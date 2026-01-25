output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "backend_url" {
  value = azurerm_container_app.backend.latest_revision_fqdn
}

output "storage_connection_string" {
  value     = azurerm_storage_account.main.primary_connection_string
  sensitive = true
}
