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
