import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators';

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 5,
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('No user context');
    }

    // super_admin bypasses all role checks
    if (user.role === 'super_admin') {
      return true;
    }

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const hasRole = requiredRoles.some((role) => userLevel >= (ROLE_HIERARCHY[role] ?? 0));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
