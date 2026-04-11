import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require specific IAM permissions on a route handler.
 * Format: `domain:action` — e.g., `@RequirePermissions('compute:create')`
 *
 * Multiple permissions use OR logic — any one match grants access.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
