import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { userIamRoles, iamRoles } from '../database/schema';
import { eq } from 'drizzle-orm';
import { hasPermission, type IamPermission } from '@cloudify/common';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    @Inject(DRIZZLE) private db: DrizzleDB,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('No user context');
    }

    // super_admin bypasses all permission checks
    if (user.role === 'super_admin') {
      return true;
    }

    // owner has implicit full access within their tenant
    if (user.role === 'owner') {
      return true;
    }

    // If JWT already has cached permissions, use them
    if (user.permissions && Array.isArray(user.permissions)) {
      return this.checkPermissions(user.permissions, requiredPermissions, user.userId);
    }

    // Otherwise fetch from DB
    const userRoles = await this.db
      .select({ permissions: iamRoles.permissions })
      .from(userIamRoles)
      .innerJoin(iamRoles, eq(userIamRoles.iamRoleId, iamRoles.id))
      .where(eq(userIamRoles.userId, user.userId));

    const allPermissions = userRoles.flatMap((r) => r.permissions) as IamPermission[];
    return this.checkPermissions(allPermissions, requiredPermissions, user.userId);
  }

  private checkPermissions(granted: IamPermission[], required: string[], userId: string): boolean {
    // OR logic: any one required permission matching is enough
    const allowed = required.some((perm) => hasPermission(granted, perm as IamPermission));

    if (!allowed) {
      this.logger.warn(`Permission denied for user ${userId}: required=[${required.join(',')}]`);
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
