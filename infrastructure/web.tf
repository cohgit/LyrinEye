# --- Azure Static Web Apps for Web Panel ---
resource "azurerm_static_web_app" "web" {
  name                = "${var.project_name}-${var.environment}-web"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East US 2" # Static Web Apps Free tier only available in certain regions
  sku_tier            = "Free"
  sku_size            = "Free"

  # App settings (environment variables)
  app_settings = {
    NEXTAUTH_URL    = "https://${var.project_name}-${var.environment}-web.azurestaticapps.net"
    BACKEND_API_URL = azurerm_container_app.backend.latest_revision_fqdn
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Component   = "WebPanel"
  }
}
