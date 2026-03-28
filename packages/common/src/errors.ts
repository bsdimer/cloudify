/**
 * Cloudify error classes — consistent error handling across all services.
 *
 * Every error has:
 * - A machine-readable `code` (for API responses & client SDKs)
 * - An HTTP `statusCode` (for the API gateway to map)
 * - A human-readable `message`
 * - Optional `details` for structured context
 */

// ── Error Codes ──

export const ErrorCode = {
  // General (1xxx)
  INTERNAL_ERROR: 'ERR_INTERNAL',
  VALIDATION_ERROR: 'ERR_VALIDATION',
  NOT_FOUND: 'ERR_NOT_FOUND',
  CONFLICT: 'ERR_CONFLICT',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'ERR_SERVICE_UNAVAILABLE',

  // Auth (2xxx)
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  FORBIDDEN: 'ERR_FORBIDDEN',
  TOKEN_EXPIRED: 'ERR_TOKEN_EXPIRED',
  TOKEN_INVALID: 'ERR_TOKEN_INVALID',
  API_KEY_INVALID: 'ERR_API_KEY_INVALID',
  API_KEY_EXPIRED: 'ERR_API_KEY_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'ERR_INSUFFICIENT_PERMISSIONS',
  INVALID_CREDENTIALS: 'ERR_INVALID_CREDENTIALS',

  // Tenant (3xxx)
  TENANT_NOT_FOUND: 'ERR_TENANT_NOT_FOUND',
  TENANT_SLUG_TAKEN: 'ERR_TENANT_SLUG_TAKEN',
  TENANT_SUSPENDED: 'ERR_TENANT_SUSPENDED',
  TENANT_DECOMMISSIONED: 'ERR_TENANT_DECOMMISSIONED',

  // Resource (4xxx)
  RESOURCE_NOT_FOUND: 'ERR_RESOURCE_NOT_FOUND',
  RESOURCE_IN_USE: 'ERR_RESOURCE_IN_USE',
  RESOURCE_LIMIT_EXCEEDED: 'ERR_RESOURCE_LIMIT_EXCEEDED',
  RESOURCE_INVALID_STATE: 'ERR_RESOURCE_INVALID_STATE',

  // Quota (5xxx)
  QUOTA_EXCEEDED: 'ERR_QUOTA_EXCEEDED',
  QUOTA_NOT_FOUND: 'ERR_QUOTA_NOT_FOUND',

  // GitOps (6xxx)
  GITOPS_REPO_ERROR: 'ERR_GITOPS_REPO',
  GITOPS_TOFU_PLAN_FAILED: 'ERR_GITOPS_TOFU_PLAN',
  GITOPS_TOFU_APPLY_FAILED: 'ERR_GITOPS_TOFU_APPLY',

  // Hypervisor (7xxx)
  HYPERVISOR_UNREACHABLE: 'ERR_HYPERVISOR_UNREACHABLE',
  HYPERVISOR_OPERATION_FAILED: 'ERR_HYPERVISOR_OP_FAILED',
  NODE_CAPACITY_EXCEEDED: 'ERR_NODE_CAPACITY_EXCEEDED',

  // Event Bus (8xxx)
  EVENT_PUBLISH_FAILED: 'ERR_EVENT_PUBLISH',
  EVENT_CONSUME_FAILED: 'ERR_EVENT_CONSUME',

  // Idempotency
  IDEMPOTENCY_CONFLICT: 'ERR_IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Base Error Class ──

export class CloudifyError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCodeValue,
    statusCode: number,
    details?: Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.name = 'CloudifyError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ── Specific Error Classes ──

export class ValidationError extends CloudifyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends CloudifyError {
  constructor(message = 'Authentication required', code: ErrorCodeValue = ErrorCode.UNAUTHORIZED) {
    super(message, code, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends CloudifyError {
  constructor(message = 'Insufficient permissions') {
    super(message, ErrorCode.FORBIDDEN, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends CloudifyError {
  constructor(resource: string, identifier?: string) {
    const msg = identifier ? `${resource} '${identifier}' not found` : `${resource} not found`;
    super(msg, ErrorCode.NOT_FOUND, 404, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends CloudifyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.CONFLICT, 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends CloudifyError {
  constructor(retryAfterSeconds?: number) {
    super('Rate limit exceeded', ErrorCode.RATE_LIMITED, 429, {
      retryAfter: retryAfterSeconds,
    });
    this.name = 'RateLimitedError';
  }
}

export class QuotaExceededError extends CloudifyError {
  constructor(resourceType: string, limit: number, current: number) {
    super(
      `Quota exceeded for ${resourceType}: limit ${limit}, current ${current}`,
      ErrorCode.QUOTA_EXCEEDED,
      403,
      {
        resourceType,
        limit,
        current,
      },
    );
    this.name = 'QuotaExceededError';
  }
}

export class ServiceUnavailableError extends CloudifyError {
  constructor(service: string) {
    super(`Service unavailable: ${service}`, ErrorCode.SERVICE_UNAVAILABLE, 503, { service });
    this.name = 'ServiceUnavailableError';
  }
}

export class HypervisorError extends CloudifyError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.HYPERVISOR_OPERATION_FAILED, 502, details);
    this.name = 'HypervisorError';
  }
}

export class GitOpsError extends CloudifyError {
  constructor(
    message: string,
    code: ErrorCodeValue = ErrorCode.GITOPS_REPO_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message, code, 502, details);
    this.name = 'GitOpsError';
  }
}
