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
