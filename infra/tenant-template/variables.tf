# Tenant Variables — Populated by Cloudify during repo initialization

variable "tenant_id" {
  description = "Cloudify tenant ID (UUID)"
  type        = string
}

variable "tenant_slug" {
  description = "Cloudify tenant slug (human-readable identifier)"
  type        = string
}

variable "proxmox_endpoint" {
  description = "Proxmox VE API endpoint URL"
  type        = string
}

variable "proxmox_token_id" {
  description = "Proxmox API token ID"
  type        = string
  sensitive   = true
}

variable "proxmox_token_secret" {
  description = "Proxmox API token secret"
  type        = string
  sensitive   = true
}
