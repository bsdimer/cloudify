/**
 * Standardized event envelope for NATS JetStream messages.
 * All events across Cloudify follow this format.
 */
export interface EventEnvelope<T = unknown> {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Dot-delimited event type, e.g. "resource.created", "tenant.suspended" */
  eventType: string;
  /** Tenant context (null for system-level events) */
  tenantId: string | null;
  /** Request correlation ID for distributed tracing */
  correlationId: string;
  /** User or service that triggered the event */
  sourceService: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Schema version for forward compatibility */
  version: 1;
  /** Event-specific payload */
  payload: T;
}

// ── Core Event Streams ──

export const EVENT_STREAMS = {
  RESOURCES: 'cloudify.resources',
  TENANTS: 'cloudify.tenants',
  NETWORK: 'cloudify.network',
  CERTIFICATES: 'cloudify.certificates',
  BILLING: 'cloudify.billing',
  GITOPS: 'cloudify.gitops',
  AUDIT: 'cloudify.audit',
  FIREWALL: 'cloudify.firewall',
  IAM: 'cloudify.iam',
} as const;

// ── Resource Events ──

export interface ResourceCreatedPayload {
  resourceId: string;
  resourceType: string;
  name: string;
  spec: Record<string, unknown>;
}

export interface ResourceUpdatedPayload {
  resourceId: string;
  resourceType: string;
  changes: Record<string, unknown>;
}

export interface ResourceDeletedPayload {
  resourceId: string;
  resourceType: string;
  name: string;
}

export interface ResourceStatusChangedPayload {
  resourceId: string;
  resourceType: string;
  previousStatus: string;
  newStatus: string;
}

export interface ResourceDriftDetectedPayload {
  resourceId: string;
  resourceType: string;
  desiredStateHash: string;
  actualStateHash: string;
}

// ── Tenant Events ──

export interface TenantCreatedPayload {
  tenantId: string;
  slug: string;
  ownerEmail: string;
}

export interface TenantSuspendedPayload {
  tenantId: string;
  reason: string;
}

export interface TenantDeletedPayload {
  tenantId: string;
  slug: string;
}

// ── Event Type Constants ──

export const EVENT_TYPES = {
  // Resources
  RESOURCE_CREATED: 'resource.created',
  RESOURCE_UPDATED: 'resource.updated',
  RESOURCE_DELETED: 'resource.deleted',
  RESOURCE_STATUS_CHANGED: 'resource.status_changed',
  RESOURCE_DRIFT_DETECTED: 'resource.drift_detected',
  // Tenants
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_SUSPENDED: 'tenant.suspended',
  TENANT_DELETED: 'tenant.deleted',
  // Certificates
  CERTIFICATE_ISSUED: 'certificate.issued',
  CERTIFICATE_RENEWED: 'certificate.renewed',
  CERTIFICATE_EXPIRING: 'certificate.expiring',
  CERTIFICATE_EXPIRED: 'certificate.expired',
  CERTIFICATE_RENEWAL_FAILED: 'certificate.renewal_failed',
  // Billing
  USAGE_RECORDED: 'billing.usage_recorded',
  INVOICE_GENERATED: 'billing.invoice_generated',
  PAYMENT_RECEIVED: 'billing.payment_received',
  QUOTA_EXCEEDED: 'billing.quota_exceeded',
  // Firewall
  FIREWALL_RULE_CHANGED: 'firewall.rule_changed',
  WAF_EVENT: 'firewall.waf_event',
  DDOS_ALERT: 'firewall.ddos_alert',
  // IAM
  IAM_ROLE_CREATED: 'iam.role_created',
  IAM_ROLE_UPDATED: 'iam.role_updated',
  IAM_ROLE_DELETED: 'iam.role_deleted',
  IAM_USER_INVITED: 'iam.user_invited',
  IAM_USER_ROLE_ASSIGNED: 'iam.user_role_assigned',
  IAM_USER_ROLE_REVOKED: 'iam.user_role_revoked',
  IAM_USER_REMOVED: 'iam.user_removed',
  IAM_SERVICE_ACCOUNT_CREATED: 'iam.service_account_created',
  IAM_SERVICE_ACCOUNT_DELETED: 'iam.service_account_deleted',
  IAM_PERMISSION_DENIED: 'iam.permission_denied',
} as const;

// ── IAM Event Payloads ──

export interface IamRoleChangedPayload {
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface IamUserInvitedPayload {
  invitationId: string;
  email: string;
  roleIds: string[];
  invitedBy: string;
}

export interface IamUserRoleChangedPayload {
  userId: string;
  roleId: string;
  roleName: string;
  action: 'assigned' | 'revoked';
  changedBy: string;
}

export interface IamServiceAccountChangedPayload {
  serviceAccountId: string;
  name: string;
  action: 'created' | 'deleted';
}

export interface IamPermissionDeniedPayload {
  userId: string;
  requiredPermission: string;
  resource: string;
  action: string;
}
