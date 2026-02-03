terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.90"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}

  use_oidc                   = true
  use_cli                    = false
  skip_provider_registration = false
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location
}

# --- Monitor & Logs ---
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-${var.environment}-law-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# --- Storage (Tables & Blobs) ---
resource "azurerm_storage_account" "main" {
  name                     = "${var.project_name}${var.environment}st${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # Zero-cost strategy: use Hot tier for low access cost or Cool for long storage
  access_tier = "Hot"
}

resource "azurerm_storage_table" "metadata" {
  name                 = "camerametadata"
  storage_account_name = azurerm_storage_account.main.name
}

resource "azurerm_storage_table" "userdevices" {
  name                 = "userdevices"
  storage_account_name = azurerm_storage_account.main.name
}

resource "azurerm_storage_container" "recordings" {
  name                  = "recordings"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# --- Container Apps Environment ---
resource "azurerm_container_app_environment" "main" {
  name                       = "${var.project_name}-${var.environment}-env"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
}

# --- Backend API (Container App) ---
resource "azurerm_container_app" "backend" {
  name                         = "${var.project_name}-backend"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  identity {
    type = "SystemAssigned"
  }

  template {
    container {
      name   = "backend"
      image  = "ghcr.io/${var.github_username}/lyrineye-backend:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "STORAGE_CONNECTION_STRING"
        value = azurerm_storage_account.main.primary_connection_string
      }

      env {
        name  = "LOG_ANALYTICS_WORKSPACE_ID"
        value = azurerm_log_analytics_workspace.main.workspace_id
      }

      env {
        name  = "LOG_ANALYTICS_SHARED_KEY"
        value = azurerm_log_analytics_workspace.main.primary_shared_key
      }
    }

    min_replicas = 0
    max_replicas = 2
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

/*
# --- Permissions for Querying Log Analytics ---
resource "azurerm_role_assignment" "backend_log_reader" {
  scope                = azurerm_log_analytics_workspace.main.id
  role_definition_name = "Log Analytics Reader"
  principal_id         = azurerm_container_app.backend.identity[0].principal_id
}
*/
