# Mediasoup SFU Server Infrastructure

# Virtual Network for Mediasoup
resource "azurerm_virtual_network" "mediasoup" {
  name                = "lyrineye-mediasoup-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  tags = {
    Environment = var.environment
    Component   = "Mediasoup-SFU"
  }
}

# Subnet for Mediasoup VM
resource "azurerm_subnet" "mediasoup" {
  name                 = "lyrineye-mediasoup-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.mediasoup.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Public IP for Mediasoup server
resource "azurerm_public_ip" "mediasoup" {
  name                = "lyrineye-mediasoup-ip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
  
  tags = {
    Environment = var.environment
    Component   = "Mediasoup-SFU"
  }
}

# Network Security Group for Mediasoup
resource "azurerm_network_security_group" "mediasoup" {
  name                = "lyrineye-mediasoup-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  # SSH
  security_rule {
    name                       = "SSH"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # HTTPS/WSS (Signaling)
  security_rule {
    name                       = "HTTPS"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # HTTP (for Let's Encrypt)
  security_rule {
    name                       = "HTTP"
    priority                   = 1003
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # WebRTC Media (UDP)
  security_rule {
    name                       = "WebRTC-Media"
    priority                   = 1004
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "10000-10100"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = {
    Environment = var.environment
  }
}

# Network Interface for Mediasoup
resource "azurerm_network_interface" "mediasoup" {
  name                = "lyrineye-mediasoup-nic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.mediasoup.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.mediasoup.id
  }
}

# Associate NSG with NIC
resource "azurerm_network_interface_security_group_association" "mediasoup" {
  network_interface_id      = azurerm_network_interface.mediasoup.id
  network_security_group_id = azurerm_network_security_group.mediasoup.id
}

# Virtual Machine for Mediasoup SFU
resource "azurerm_linux_virtual_machine" "mediasoup" {
  name                = "lyrineye-mediasoup-vm"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  size                = "Standard_B2s"
  admin_username      = var.vm_admin_username
  
  network_interface_ids = [
    azurerm_network_interface.mediasoup.id,
  ]

  admin_ssh_key {
    username   = var.vm_admin_username
    public_key = var.ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = 30
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(templatefile("${path.module}/cloud-init-mediasoup.yaml", {
    domain_name           = var.mediasoup_domain
    azure_storage_conn    = azurerm_storage_account.main.primary_connection_string
    backend_url           = "https://${azurerm_container_app.backend.latest_revision_fqdn}"
  }))

  tags = {
    Environment = var.environment
    Component   = "Mediasoup-SFU"
  }
}
