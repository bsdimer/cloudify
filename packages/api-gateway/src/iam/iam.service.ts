import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import {
  iamRoles,
  userIamRoles,
  serviceAccounts,
  serviceAccountIamRoles,
  userInvitations,
  users,
  apiKeys,
} from '../database/schema';
import { BUILT_IN_ROLES, type IamPermission } from '@cloudify/common';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class IamService {
  private readonly logger = new Logger(IamService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // ── Built-in Role Seeding ──

  async seedBuiltInRoles(tenantId: string): Promise<void> {
    for (const [, roleDef] of Object.entries(BUILT_IN_ROLES)) {
      await this.db
        .insert(iamRoles)
        .values({
          tenantId,
          name: roleDef.name,
          description: roleDef.description,
          permissions: roleDef.permissions,
          builtIn: true,
        })
        .onConflictDoNothing();
    }

    this.logger.log(`Seeded built-in IAM roles for tenant ${tenantId}`);
  }

  // ── Roles CRUD ──

  async createRole(
    tenantId: string,
    data: { name: string; description?: string; permissions: string[] },
  ) {
    const [existing] = await this.db
      .select()
      .from(iamRoles)
      .where(and(eq(iamRoles.tenantId, tenantId), eq(iamRoles.name, data.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Role "${data.name}" already exists in this tenant`);
    }

    const [role] = await this.db
      .insert(iamRoles)
      .values({
        tenantId,
        name: data.name,
        description: data.description ?? null,
        permissions: data.permissions,
        builtIn: false,
      })
      .returning();

    this.logger.log(`IAM role created: ${role.name} (${role.id}) for tenant ${tenantId}`);
    return role;
  }

  async listRoles(tenantId: string) {
    return this.db
      .select()
      .from(iamRoles)
      .where(eq(iamRoles.tenantId, tenantId))
      .orderBy(iamRoles.name);
  }

  async getRole(tenantId: string, roleId: string) {
    const [role] = await this.db
      .select()
      .from(iamRoles)
      .where(and(eq(iamRoles.id, roleId), eq(iamRoles.tenantId, tenantId)))
      .limit(1);

    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }

    return role;
  }

  async updateRole(
    tenantId: string,
    roleId: string,
    data: { description?: string; permissions?: string[] },
  ) {
    const role = await this.getRole(tenantId, roleId);

    if (role.builtIn) {
      throw new ForbiddenException('Cannot modify built-in roles');
    }

    const [updated] = await this.db
      .update(iamRoles)
      .set({
        ...(data.description !== undefined && { description: data.description }),
        ...(data.permissions !== undefined && { permissions: data.permissions }),
      })
      .where(eq(iamRoles.id, roleId))
      .returning();

    this.logger.log(`IAM role updated: ${updated.name} (${updated.id})`);
    return updated;
  }

  async deleteRole(tenantId: string, roleId: string) {
    const role = await this.getRole(tenantId, roleId);

    if (role.builtIn) {
      throw new ForbiddenException('Cannot delete built-in roles');
    }

    await this.db.delete(iamRoles).where(eq(iamRoles.id, roleId));

    this.logger.log(`IAM role deleted: ${role.name} (${role.id})`);
    return { message: `Role "${role.name}" deleted` };
  }

  // ── User Role Assignment ──

  async listTenantUsers(tenantId: string) {
    const tenantUsers = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(users.email);

    // Fetch IAM roles for each user
    const result = [];
    for (const user of tenantUsers) {
      const roles = await this.db
        .select({
          id: iamRoles.id,
          name: iamRoles.name,
        })
        .from(userIamRoles)
        .innerJoin(iamRoles, eq(userIamRoles.iamRoleId, iamRoles.id))
        .where(eq(userIamRoles.userId, user.id));

      result.push({ ...user, iamRoles: roles });
    }

    return result;
  }

  async assignRole(tenantId: string, userId: string, roleId: string, assignedBy: string) {
    // Verify role belongs to tenant
    await this.getRole(tenantId, roleId);

    // Verify user belongs to tenant
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User ${userId} not found in this tenant`);
    }

    await this.db
      .insert(userIamRoles)
      .values({ userId, iamRoleId: roleId, assignedBy })
      .onConflictDoNothing();

    this.logger.log(`IAM role ${roleId} assigned to user ${userId}`);
    return { message: 'Role assigned' };
  }

  async revokeRole(tenantId: string, userId: string, roleId: string) {
    await this.getRole(tenantId, roleId);

    await this.db
      .delete(userIamRoles)
      .where(and(eq(userIamRoles.userId, userId), eq(userIamRoles.iamRoleId, roleId)));

    this.logger.log(`IAM role ${roleId} revoked from user ${userId}`);
    return { message: 'Role revoked' };
  }

  async removeUser(tenantId: string, userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`User ${userId} not found in this tenant`);
    }

    if (user.role === 'owner') {
      throw new ForbiddenException('Cannot remove the tenant owner');
    }

    await this.db.delete(users).where(eq(users.id, userId));

    this.logger.log(`User ${userId} removed from tenant ${tenantId}`);
    return { message: 'User removed from tenant' };
  }

  // ── User Invitations ──

  async inviteUser(
    tenantId: string,
    data: { email: string; iamRoleIds: string[]; invitedBy: string },
  ) {
    // Check if user already exists in this tenant
    const [existing] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, data.email), eq(users.tenantId, tenantId)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`User "${data.email}" is already a member of this tenant`);
    }

    // Verify all role IDs belong to this tenant
    for (const roleId of data.iamRoleIds) {
      await this.getRole(tenantId, roleId);
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await this.db
      .insert(userInvitations)
      .values({
        tenantId,
        email: data.email,
        invitedBy: data.invitedBy,
        iamRoleIds: data.iamRoleIds,
        token,
        expiresAt,
      })
      .returning();

    this.logger.log(`Invitation sent to ${data.email} for tenant ${tenantId}`);
    return invitation;
  }

  // ── User Permissions Resolution ──

  async getUserPermissions(userId: string): Promise<IamPermission[]> {
    const roles = await this.db
      .select({ permissions: iamRoles.permissions })
      .from(userIamRoles)
      .innerJoin(iamRoles, eq(userIamRoles.iamRoleId, iamRoles.id))
      .where(eq(userIamRoles.userId, userId));

    return roles.flatMap((r) => r.permissions) as IamPermission[];
  }

  // ── Service Accounts ──

  async createServiceAccount(
    tenantId: string,
    data: { name: string; description?: string; iamRoleIds: string[]; createdBy: string },
  ) {
    const [existing] = await this.db
      .select()
      .from(serviceAccounts)
      .where(and(eq(serviceAccounts.tenantId, tenantId), eq(serviceAccounts.name, data.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Service account "${data.name}" already exists`);
    }

    // Verify all role IDs
    for (const roleId of data.iamRoleIds) {
      await this.getRole(tenantId, roleId);
    }

    const result = await this.db.transaction(async (tx) => {
      const [sa] = await tx
        .insert(serviceAccounts)
        .values({
          tenantId,
          name: data.name,
          description: data.description ?? null,
          createdBy: data.createdBy,
        })
        .returning();

      if (data.iamRoleIds.length > 0) {
        await tx.insert(serviceAccountIamRoles).values(
          data.iamRoleIds.map((roleId) => ({
            serviceAccountId: sa.id,
            iamRoleId: roleId,
          })),
        );
      }

      return sa;
    });

    this.logger.log(
      `Service account created: ${result.name} (${result.id}) for tenant ${tenantId}`,
    );
    return result;
  }

  async listServiceAccounts(tenantId: string) {
    const accounts = await this.db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.tenantId, tenantId))
      .orderBy(serviceAccounts.name);

    const result = [];
    for (const sa of accounts) {
      const roles = await this.db
        .select({ id: iamRoles.id, name: iamRoles.name })
        .from(serviceAccountIamRoles)
        .innerJoin(iamRoles, eq(serviceAccountIamRoles.iamRoleId, iamRoles.id))
        .where(eq(serviceAccountIamRoles.serviceAccountId, sa.id));

      result.push({ ...sa, iamRoles: roles });
    }

    return result;
  }

  async issueServiceAccountKey(tenantId: string, serviceAccountId: string) {
    const [sa] = await this.db
      .select()
      .from(serviceAccounts)
      .where(and(eq(serviceAccounts.id, serviceAccountId), eq(serviceAccounts.tenantId, tenantId)))
      .limit(1);

    if (!sa) {
      throw new NotFoundException(`Service account ${serviceAccountId} not found`);
    }

    // Service account keys are API keys tied to the creator but scoped via the SA's roles
    const rawKey = `cf_sa_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    // Get the SA's permissions to store as scopes
    const saRoles = await this.db
      .select({ permissions: iamRoles.permissions })
      .from(serviceAccountIamRoles)
      .innerJoin(iamRoles, eq(serviceAccountIamRoles.iamRoleId, iamRoles.id))
      .where(eq(serviceAccountIamRoles.serviceAccountId, serviceAccountId));

    const scopes = saRoles.flatMap((r) => r.permissions);

    const [key] = await this.db
      .insert(apiKeys)
      .values({
        userId: sa.createdBy,
        tenantId,
        keyHash,
        name: `sa:${sa.name}`,
        scopes,
      })
      .returning();

    this.logger.log(`API key issued for service account ${sa.name} (${sa.id})`);
    return {
      id: key.id,
      name: key.name,
      key: rawKey,
      scopes: key.scopes,
      createdAt: key.createdAt.toISOString(),
    };
  }

  async deleteServiceAccount(tenantId: string, serviceAccountId: string) {
    const [sa] = await this.db
      .select()
      .from(serviceAccounts)
      .where(and(eq(serviceAccounts.id, serviceAccountId), eq(serviceAccounts.tenantId, tenantId)))
      .limit(1);

    if (!sa) {
      throw new NotFoundException(`Service account ${serviceAccountId} not found`);
    }

    await this.db.delete(serviceAccounts).where(eq(serviceAccounts.id, serviceAccountId));

    this.logger.log(`Service account deleted: ${sa.name} (${sa.id})`);
    return { message: `Service account "${sa.name}" deleted` };
  }
}
