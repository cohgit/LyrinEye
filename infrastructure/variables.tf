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
