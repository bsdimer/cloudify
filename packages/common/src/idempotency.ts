/**
 * Idempotency key utilities — helpers for idempotent API operations.
 */

import { createHash, randomUUID } from 'crypto';

/**
 * Generate a new idempotency key (UUID v4).
 * Clients use this when making mutating API calls.
 */
export function generateIdempotencyKey(): string {
  return randomUUID();
}

/**
 * Generate a deterministic idempotency key from operation params.
 * Useful for operations that are inherently idempotent (e.g., same tenant + same slug).
 */
export function deterministicIdempotencyKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex').substring(0, 64);
}

/**
 * Validate an idempotency key format.
 * Accepts UUID v4 or hex strings up to 64 chars.
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || key.length > 64) return false;
  return /^[a-f0-9-]{1,64}$/i.test(key);
}

/**
 * Hash a request body for idempotency comparison.
 * Used to detect if the same idempotency key is used with a different request body.
 */
export function hashRequestBody(body: unknown): string {
  const serialized = JSON.stringify(body, Object.keys(body as Record<string, unknown>).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_TTL_HOURS = 24;
