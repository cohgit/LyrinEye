# --- Azure Static Web Apps for Web Panel ---
resource "azurerm_static_web_app" "web" {
  name                = "${var.project_name}-${var.environment}-web"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East US 2" # Static Web Apps Free tier only available in certain regions
  sku_tier            = "Free"
  sku_size            = "Free"

  # App settings (environment variables)
  app_settings = {
    NEXTAUTH_URL       = "https://${var.project_name}-${var.environment}-web.azurestaticapps.net"
    NEXTAUTH_SECRET    = var.nextauth_secret
    AUTH_SECRET        = var.nextauth_secret
    AUTH_URL           = "https://${var.project_name}-${var.environment}-web.azurestaticapps.net"
    AUTH_TRUST_HOST    = "true"
    GOOGLE_CLIENT_ID   = var.google_client_id
    GOOGLE_CLIENT_SECRET = var.google_client_secret
    BACKEND_API_URL    = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Component   = "WebPanel"
  }
}
