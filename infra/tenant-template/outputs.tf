# Outputs — Auto-managed by Cloudify
# Resource-specific outputs are added as resources are provisioned.

output "tenant_id" {
  value       = var.tenant_id
  description = "Cloudify tenant ID"
}
