terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  backend "remote" {
    # Organization and workspace will be set via backend.hcl or command line
    # Alternatively, you can hardcode them here after setting up TF Cloud
    organization = "cogalde"

    workspaces {
      name = "lyrineye-infra"
    }
  }
}

provider "azurerm" {
  features {}
  use_oidc = true
}

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location
}

# --- Monitor & Logs ---
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-${var.environment}-law"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# --- Storage (Tables & Blobs) ---
resource "azurerm_storage_account" "main" {
  name                     = "${var.project_name}${var.environment}st"
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

  template {
    container {
      name   = "backend"
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" # Placeholder
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "STORAGE_CONNECTION_STRING"
        value = azurerm_storage_account.main.primary_connection_string
      }
    }
    
    min_replicas = 0
    max_replicas = 2
  }

  ingress {
    external_enabled = true
    target_port      = 80
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}
