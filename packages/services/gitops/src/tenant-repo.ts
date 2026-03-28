/**
 * Tenant repository lifecycle management.
 *
 * On tenant creation:  Creates repo → pushes template files (main.tf, variables.tf, etc.)
 * On resource change:  Commits updated .tf files to the tenant repo
 * On tenant deletion:  Archives the repo for audit trail
 */

import { GiteaClient } from './gitea-client';
import { createLogger } from '@cloudify/common';

const logger = createLogger('TenantRepo');

export interface TenantRepoConfig {
  /** Prefix for repo names. Default: 'tenant-' */
  repoPrefix?: string;
  /** OpenTofu state backend type. Default: 'pg' (Postgres) */
  stateBackend?: 'pg' | 's3';
  /** Postgres connection string for state backend. */
  stateDbUrl?: string;
  /** S3 bucket for state backend. */
  stateBucket?: string;
}

/**
 * Generate the tenant template files.
 */
function generateTemplateFiles(
  tenantSlug: string,
  tenantId: string,
  config: TenantRepoConfig,
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];

  // main.tf — root module
  files.push({
    path: 'main.tf',
    content: `# Cloudify Infrastructure — Tenant: ${tenantSlug}
# Auto-managed by Cloudify GitOps Service. Do not edit manually.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.50.0"
    }
  }
}

# Resources are added here by the Cloudify orchestrator.
# Each resource change creates a Git commit and triggers plan/apply.
`,
  });

  // variables.tf
  files.push({
    path: 'variables.tf',
    content: `# Tenant Variables — Auto-managed by Cloudify

variable "tenant_id" {
  description = "Cloudify tenant ID"
  type        = string
  default     = "${tenantId}"
}

variable "tenant_slug" {
  description = "Cloudify tenant slug"
  type        = string
  default     = "${tenantSlug}"
}

variable "proxmox_endpoint" {
  description = "Proxmox API endpoint"
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
`,
  });

  // backend.tf
  const backendContent =
    config.stateBackend === 's3'
      ? `# State Backend — S3-compatible (MinIO)
terraform {
  backend "s3" {
    bucket = "${config.stateBucket || 'cloudify-tf-state'}"
    key    = "tenants/${tenantSlug}/terraform.tfstate"
    region = "us-east-1"

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}
`
      : `# State Backend — PostgreSQL
terraform {
  backend "pg" {
    schema_name = "tenant_${tenantSlug.replace(/-/g, '_')}"
  }
}
`;

  files.push({ path: 'backend.tf', content: backendContent });

  // provider.tf
  files.push({
    path: 'provider.tf',
    content: `# Provider Configuration — Auto-managed by Cloudify

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = "\${var.proxmox_token_id}=\${var.proxmox_token_secret}"
  insecure  = true  # TODO: Use proper TLS in production

  ssh {
    agent = false
  }
}
`,
  });

  // outputs.tf
  files.push({
    path: 'outputs.tf',
    content: `# Outputs — Auto-managed by Cloudify
# Resource-specific outputs are added here as resources are provisioned.

output "tenant_id" {
  value       = var.tenant_id
  description = "Cloudify tenant ID"
}
`,
  });

  // .gitignore
  files.push({
    path: '.gitignore',
    content: `# OpenTofu
.terraform/
*.tfstate
*.tfstate.backup
*.tfvars
.terraform.lock.hcl
crash.log

# Plans
*.tfplan
`,
  });

  return files;
}

/**
 * Create and initialize a tenant's infrastructure repository.
 */
export async function createTenantRepo(
  gitea: GiteaClient,
  tenantSlug: string,
  tenantId: string,
  config: TenantRepoConfig = {},
): Promise<{ repoName: string; cloneUrl: string }> {
  const repoName = `${config.repoPrefix || 'tenant-'}${tenantSlug}`;

  logger.info(`Creating tenant repo: ${repoName}`, { tenantId, tenantSlug });

  // Check if repo already exists (idempotency)
  if (await gitea.repoExists(repoName)) {
    logger.info(`Tenant repo already exists: ${repoName}`);
    const repo = await gitea.getRepo(repoName);
    return { repoName, cloneUrl: repo.clone_url };
  }

  // Create the repo
  const repo = await gitea.createRepo({
    name: repoName,
    description: `Infrastructure as Code for tenant: ${tenantSlug}`,
    private_repo: true,
    auto_init: true,
    default_branch: 'main',
  });

  // Push template files
  const templateFiles = generateTemplateFiles(tenantSlug, tenantId, config);
  await gitea.createFiles(repoName, templateFiles, `chore: initialize tenant infrastructure for ${tenantSlug}`);

  logger.info(`Tenant repo initialized: ${repoName}`, { tenantId, cloneUrl: repo.clone_url });

  return { repoName, cloneUrl: repo.clone_url };
}

/**
 * Commit a resource change to the tenant's infrastructure repo.
 */
export async function commitResourceChange(
  gitea: GiteaClient,
  tenantSlug: string,
  resourceType: string,
  resourceName: string,
  tofuContent: string,
  config: TenantRepoConfig = {},
): Promise<void> {
  const repoName = `${config.repoPrefix || 'tenant-'}${tenantSlug}`;
  const filePath = `resources/${resourceType}/${resourceName}.tf`;
  const commitMessage = `feat: update ${resourceType}/${resourceName}`;

  logger.info(`Committing resource change: ${filePath}`, { tenantSlug, resourceType, resourceName });

  await gitea.createOrUpdateFile(repoName, filePath, tofuContent, commitMessage);
}

/**
 * Remove a resource file from the tenant's infrastructure repo.
 */
export async function removeResourceFile(
  gitea: GiteaClient,
  tenantSlug: string,
  resourceType: string,
  resourceName: string,
  config: TenantRepoConfig = {},
): Promise<void> {
  const repoName = `${config.repoPrefix || 'tenant-'}${tenantSlug}`;
  const filePath = `resources/${resourceType}/${resourceName}.tf`;
  const commitMessage = `feat: remove ${resourceType}/${resourceName}`;

  logger.info(`Removing resource file: ${filePath}`, { tenantSlug });

  // Write an empty file (Gitea API requires content for delete; simpler than tracking SHA)
  await gitea.createOrUpdateFile(
    repoName,
    filePath,
    `# Resource ${resourceName} has been deleted.\n# This file will be cleaned up.\n`,
    commitMessage,
  );
}

/**
 * Archive a tenant repo on tenant decommission.
 */
export async function archiveTenantRepo(
  gitea: GiteaClient,
  tenantSlug: string,
  config: TenantRepoConfig = {},
): Promise<void> {
  const repoName = `${config.repoPrefix || 'tenant-'}${tenantSlug}`;
  logger.info(`Archiving tenant repo: ${repoName}`, { tenantSlug });
  await gitea.archiveRepo(repoName);
}
