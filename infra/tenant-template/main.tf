# Cloudify Infrastructure — Tenant Template
# Auto-managed by Cloudify GitOps Service. Do not edit manually.
#
# This is the root module for a tenant's infrastructure.
# Resources are added as separate .tf files under the resources/ directory
# by the Cloudify orchestrator.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.50.0"
    }
  }
}
