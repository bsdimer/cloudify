export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  DECOMMISSIONED = 'decommissioned',
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum ResourceType {
  K8S_CLUSTER = 'k8s_cluster',
  VM = 'vm',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
  VALKEY = 'valkey',
  MINIO_BUCKET = 'minio_bucket',
  DNS_ZONE = 'dns_zone',
  LOAD_BALANCER = 'load_balancer',
  CERTIFICATE = 'certificate',
  SECRET = 'secret',
  REGISTRY_PROJECT = 'registry_project',
  SDN_NETWORK = 'sdn_network',
  FLOATING_IP = 'floating_ip',
}

export enum ResourceStatus {
  PENDING = 'pending',
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  UPDATING = 'updating',
  DELETING = 'deleting',
  DELETED = 'deleted',
  ERROR = 'error',
  SUSPENDED = 'suspended',
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  START = 'start',
  STOP = 'stop',
  RESTART = 'restart',
  SCALE = 'scale',
  UPGRADE = 'upgrade',
  BACKUP = 'backup',
  RESTORE = 'restore',
  LOGIN = 'login',
  LOGOUT = 'logout',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  // IAM actions
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  USER_INVITED = 'user_invited',
  USER_ROLE_ASSIGNED = 'user_role_assigned',
  USER_ROLE_REVOKED = 'user_role_revoked',
  USER_REMOVED = 'user_removed',
  SERVICE_ACCOUNT_CREATED = 'service_account_created',
  SERVICE_ACCOUNT_DELETED = 'service_account_deleted',
  PERMISSION_DENIED = 'permission_denied',
}

// ── IAM Enums ──

/**
 * Fine-grained IAM permission domains.
 * Format: `<domain>:<action>` — e.g., `compute:create`, `database:read`.
 */
export enum IamDomain {
  COMPUTE = 'compute',
  DATABASE = 'database',
  NETWORK = 'network',
  STORAGE = 'storage',
  DNS = 'dns',
  CERTIFICATES = 'certificates',
  SECRETS = 'secrets',
  REGISTRY = 'registry',
  IAM = 'iam',
  BILLING = 'billing',
  AUDIT = 'audit',
  ALL = '*',
}

export enum IamAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
  ALL = '*',
}

/**
 * Built-in IAM role names seeded per tenant on creation.
 */
export enum BuiltInIamRole {
  TENANT_ADMIN = 'tenant-admin',
  DEVELOPER = 'developer',
  BILLING_ADMIN = 'billing-admin',
  READ_ONLY = 'read-only',
}

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export enum ServiceAccountStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

export enum CertificateStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  ISSUING = 'issuing',
  ACTIVE = 'active',
  RENEWING = 'renewing',
  EXPIRING = 'expiring',
  EXPIRED = 'expired',
  VALIDATION_FAILED = 'validation_failed',
  ISSUANCE_FAILED = 'issuance_failed',
}
