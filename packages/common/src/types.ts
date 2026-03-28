import {
  TenantStatus,
  UserRole,
  ResourceType,
  ResourceStatus,
  AuditAction,
  InvitationStatus,
  ServiceAccountStatus,
} from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  role: UserRole;
  mfaSecret: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  tenantId: string;
  keyHash: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface Resource {
  id: string;
  tenantId: string;
  type: ResourceType;
  name: string;
  status: ResourceStatus;
  spec: Record<string, unknown>;
  providerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: AuditAction;
  resourceId: string | null;
  resourceType: ResourceType | null;
  diff: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: Date;
}

export interface Quota {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  limit: number;
  currentUsage: number;
}

export interface BillingAccount {
  id: string;
  tenantId: string;
  paymentMethod: string | null;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  resourceId: string;
  metric: string;
  value: number;
  timestamp: Date;
}

// ── IAM Types ──

/** Permission string in `domain:action` format */
export type IamPermission = `${string}:${string}`;

/** Custom IAM role within a tenant */
export interface IamRole {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: IamPermission[];
  builtIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Service account (machine identity) within a tenant */
export interface ServiceAccount {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  createdBy: string;
  status: ServiceAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** User invitation to join a tenant */
export interface UserInvitation {
  id: string;
  tenantId: string;
  email: string;
  invitedBy: string;
  iamRoleIds: string[];
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Built-in IAM role definitions.
 * Seeded on tenant creation — cannot be deleted.
 */
export const BUILT_IN_ROLES: Record<
  string,
  { name: string; description: string; permissions: IamPermission[] }
> = {
  'tenant-admin': {
    name: 'tenant-admin',
    description: 'Full access to all tenant resources and IAM management',
    permissions: ['*:*'],
  },
  developer: {
    name: 'developer',
    description: 'Create and manage compute, storage, and read databases/networks',
    permissions: [
      'compute:create',
      'compute:read',
      'compute:update',
      'compute:delete',
      'database:read',
      'storage:create',
      'storage:read',
      'storage:update',
      'storage:delete',
      'network:read',
      'dns:read',
      'certificates:read',
      'secrets:read',
      'registry:create',
      'registry:read',
      'registry:update',
    ],
  },
  'billing-admin': {
    name: 'billing-admin',
    description: 'Manage billing, view usage, and read IAM configuration',
    permissions: [
      'billing:create',
      'billing:read',
      'billing:update',
      'billing:delete',
      'iam:read',
      'audit:read',
    ],
  },
  'read-only': {
    name: 'read-only',
    description: 'Read-only access to all tenant resources',
    permissions: ['*:read'],
  },
};

/**
 * Check if a set of granted permissions includes the required permission.
 * Supports wildcards: `*:*` grants everything, `compute:*` grants all compute actions.
 */
export function hasPermission(granted: IamPermission[], required: IamPermission): boolean {
  const [reqDomain, reqAction] = required.split(':');

  for (const perm of granted) {
    const [grantDomain, grantAction] = perm.split(':');

    // Full wildcard
    if (grantDomain === '*' && grantAction === '*') return true;
    // Domain wildcard with matching action
    if (grantDomain === '*' && (grantAction === reqAction || grantAction === '*')) return true;
    // Matching domain with action wildcard
    if (grantDomain === reqDomain && grantAction === '*') return true;
    // Exact match
    if (grantDomain === reqDomain && grantAction === reqAction) return true;
  }

  return false;
}

/** Standard API response wrapper */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    perPage?: number;
    total?: number;
    totalPages?: number;
  };
}

/** Standard error response */
export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
  details?: Record<string, unknown>;
}

/** Pagination query params */
export interface PaginationParams {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** JWT payload */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  tenantId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** API Key payload (after validation) */
export interface ApiKeyPayload {
  userId: string;
  tenantId: string;
  scopes: string[];
}
