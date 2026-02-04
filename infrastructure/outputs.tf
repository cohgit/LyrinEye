output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "backend_url" {
  value = "https://${azurerm_container_app.backend.ingress[0].fqdn}"
}

output "storage_connection_string" {
  value     = azurerm_storage_account.main.primary_connection_string
  sensitive = true
}

output "web_panel_url" {
  value       = "https://${azurerm_static_web_app.web.default_host_name}"
  description = "Web Admin Panel URL"
}

output "web_panel_api_token" {
  value       = azurerm_static_web_app.web.api_key
  description = "API token for GitHub Actions deployment"
  sensitive   = true
}

# Mediasoup SFU Outputs
output "mediasoup_public_ip" {
  description = "Public IP address of Mediasoup server"
  value       = azurerm_public_ip.mediasoup.ip_address
}

output "mediasoup_ssh_command" {
  description = "SSH command to connect to Mediasoup server"
  value       = "ssh ${var.vm_admin_username}@${azurerm_public_ip.mediasoup.ip_address}"
}

output "mediasoup_domain" {
  description = "Mediasoup SFU domain"
  value       = var.mediasoup_domain
}
