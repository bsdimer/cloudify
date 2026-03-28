import {
  TenantStatus,
  UserRole,
  ResourceType,
  ResourceStatus,
  AuditAction,
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
