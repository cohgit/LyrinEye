variable "project_name" {
  type        = string
  description = "The name of the project"
  default     = "lyrineye"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, prod, etc.)"
  default     = "dev"
}

variable "location" {
  type        = string
  description = "Azure region for resources"
  default     = "East US"
}

variable "github_username" {
  type        = string
  description = "GitHub username for GHCR"
  default     = "cohgit"
}

variable "firebase_service_account_key" {
  type        = string
  description = "JSON content of Firebase Service Account Key"
  sensitive   = true

  validation {
    condition     = length(var.firebase_service_account_key) > 0
    error_message = "The firebase_service_account_key variable must not be empty."
  }
}

variable "nextauth_secret" {
  type        = string
  description = "Secret for NextAuth.js encryption"
  sensitive   = true
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth Client ID"
  sensitive   = true
}

variable "google_client_secret" {
  type        = string
  description = "Google OAuth Client Secret"
  sensitive   = true
}

# Mediasoup SFU Variables
variable "vm_admin_username" {
  type        = string
  description = "Admin username for Mediasoup VM"
  default     = "azureuser"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key content for VM access"
  sensitive   = true
}

variable "mediasoup_domain" {
  type        = string
  description = "Domain name for Mediasoup SFU (e.g., sfu.lyrineye.com)"
  default     = "sfu.lyrineye.com"
}
