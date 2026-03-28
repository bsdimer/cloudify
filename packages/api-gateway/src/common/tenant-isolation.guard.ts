import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Guard that ensures users can only access resources within their own tenant.
 *
 * Works by inspecting the `:tenantId` route param (if present) against
 * the authenticated user's tenantId. Super admins bypass this check.
 *
 * Apply on routes that take a tenantId param:
 *   @UseGuards(JwtAuthGuard, TenantIsolationGuard)
 */
@Injectable()
export class TenantIsolationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as Record<string, unknown>).user as
      | { tenantId: string; role: string }
      | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Super admins can access any tenant
    if (user.role === 'super_admin') {
      return true;
    }

    // Check route param
    const routeTenantId = request.params.tenantId || request.params.id;

    // If there's no tenant-specific route param, allow (the service layer should filter by tenantId)
    if (!routeTenantId) {
      return true;
    }

    // For tenant-specific routes, the route param might be a resource ID (not tenant ID)
    // In that case, the service layer is responsible for tenant filtering.
    // We only enforce when the param is explicitly named tenantId.
    if (request.params.tenantId && request.params.tenantId !== user.tenantId) {
      throw new ForbiddenException('Access denied: cross-tenant access is not allowed');
    }

    return true;
  }
}
