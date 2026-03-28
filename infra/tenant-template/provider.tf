# Provider Configuration — Auto-managed by Cloudify

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = "${var.proxmox_token_id}=${var.proxmox_token_secret}"
  insecure  = true # TODO: Use proper TLS certs in production

  ssh {
    agent = false
  }
}
