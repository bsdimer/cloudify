import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { postgresInstances, managedServiceBackups, auditLogs } from '../database/schema';
import {
  INSTANCE_SIZES,
  DEFAULT_BACKUP_POLICY,
  SUPPORTED_POSTGRES_VERSIONS,
  type CreatePostgresDto,
  type ScalePostgresDto,
  type InstanceSize,
} from '@cloudify/common';

@Injectable()
export class PostgresService {
  private readonly logger = new Logger(PostgresService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async create(tenantId: string, userId: string, dto: CreatePostgresDto) {
    if (
      !SUPPORTED_POSTGRES_VERSIONS.includes(
        dto.version as (typeof SUPPORTED_POSTGRES_VERSIONS)[number],
      )
    ) {
      throw new BadRequestException(
        `Unsupported Postgres version: ${dto.version}. Supported: ${SUPPORTED_POSTGRES_VERSIONS.join(', ')}`,
      );
    }

    if (!INSTANCE_SIZES[dto.size]) {
      throw new BadRequestException(`Unknown instance size: ${dto.size}`);
    }

    const [existing] = await this.db
      .select()
      .from(postgresInstances)
      .where(and(eq(postgresInstances.tenantId, tenantId), eq(postgresInstances.name, dto.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Postgres instance "${dto.name}" already exists`);
    }

    const spec = INSTANCE_SIZES[dto.size];
    const backupPolicy = { ...DEFAULT_BACKUP_POLICY, ...(dto.backupPolicy ?? {}) };

    const [instance] = await this.db
      .insert(postgresInstances)
      .values({
        tenantId,
        name: dto.name,
        version: dto.version,
        size: dto.size,
        readReplicas: dto.readReplicas ?? 0,
        highAvailability: dto.highAvailability ?? false,
        publicAccess: dto.publicAccess ?? false,
        connectionPooling: dto.connectionPooling ?? false,
        storageGb: spec.storageGb,
        backupPolicy,
        vpcId: dto.vpcId ?? null,
        tags: dto.tags ?? {},
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'postgres',
      diff: { postgres: { name: dto.name, version: dto.version, size: dto.size } },
    });

    this.logger.log(
      `Postgres ${instance.name} (${instance.id}) provisioning for tenant ${tenantId}`,
    );

    // In production: emit event → CloudNativePG operator provisions instance
    return instance;
  }

  async list(tenantId: string) {
    return this.db
      .select()
      .from(postgresInstances)
      .where(eq(postgresInstances.tenantId, tenantId))
      .orderBy(postgresInstances.createdAt);
  }

  async get(tenantId: string, id: string) {
    const [instance] = await this.db
      .select()
      .from(postgresInstances)
      .where(and(eq(postgresInstances.id, id), eq(postgresInstances.tenantId, tenantId)))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`Postgres instance ${id} not found`);
    }

    return instance;
  }

  async scale(tenantId: string, id: string, userId: string, dto: ScalePostgresDto) {
    const instance = await this.get(tenantId, id);

    if (instance.status !== 'active') {
      throw new BadRequestException(`Cannot scale instance in "${instance.status}" state`);
    }

    const updates: Partial<typeof instance> = { status: 'updating' };

    if (dto.size) {
      if (!INSTANCE_SIZES[dto.size]) {
        throw new BadRequestException(`Unknown instance size: ${dto.size}`);
      }
      updates.size = dto.size;
    }
    if (dto.readReplicas !== undefined) {
      if (dto.readReplicas < 0 || dto.readReplicas > 5) {
        throw new BadRequestException('readReplicas must be between 0 and 5');
      }
      updates.readReplicas = dto.readReplicas;
    }
    if (dto.storageGb !== undefined) {
      if (dto.storageGb < instance.storageGb) {
        throw new BadRequestException('Storage cannot be decreased');
      }
      updates.storageGb = dto.storageGb;
    }

    const [updated] = await this.db
      .update(postgresInstances)
      .set(updates)
      .where(eq(postgresInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'scale',
      resourceType: 'postgres',
      diff: {
        before: { size: instance.size, readReplicas: instance.readReplicas },
        after: updates,
      },
    });

    this.logger.log(`Postgres ${instance.name} scale initiated`);
    return updated;
  }

  async createBackup(tenantId: string, id: string, userId: string, name?: string) {
    const instance = await this.get(tenantId, id);

    const backupName = name ?? `${instance.name}-${new Date().toISOString()}`;
    const [backup] = await this.db
      .insert(managedServiceBackups)
      .values({
        tenantId,
        serviceType: 'postgres',
        instanceId: id,
        name: backupName,
        type: 'manual',
        expiresAt: new Date(Date.now() + (instance.backupPolicy.retentionDays ?? 7) * 86400 * 1000),
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'backup',
      resourceType: 'postgres',
      diff: { backup: backupName },
    });

    this.logger.log(`Postgres backup "${backupName}" initiated for ${instance.name}`);
    return backup;
  }

  async listBackups(tenantId: string, instanceId: string) {
    await this.get(tenantId, instanceId);
    return this.db
      .select()
      .from(managedServiceBackups)
      .where(
        and(
          eq(managedServiceBackups.tenantId, tenantId),
          eq(managedServiceBackups.serviceType, 'postgres'),
          eq(managedServiceBackups.instanceId, instanceId),
        ),
      )
      .orderBy(managedServiceBackups.createdAt);
  }

  async restore(tenantId: string, id: string, userId: string, backupId: string) {
    const instance = await this.get(tenantId, id);

    const [backup] = await this.db
      .select()
      .from(managedServiceBackups)
      .where(
        and(eq(managedServiceBackups.id, backupId), eq(managedServiceBackups.tenantId, tenantId)),
      )
      .limit(1);

    if (!backup) {
      throw new NotFoundException(`Backup ${backupId} not found`);
    }

    const [updated] = await this.db
      .update(postgresInstances)
      .set({ status: 'restoring' })
      .where(eq(postgresInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'restore',
      resourceType: 'postgres',
      diff: { backup: backup.name, instance: instance.name },
    });

    this.logger.log(`Postgres ${instance.name} restore from backup "${backup.name}" initiated`);
    return updated;
  }

  async delete(tenantId: string, id: string, userId: string) {
    const instance = await this.get(tenantId, id);

    const [updated] = await this.db
      .update(postgresInstances)
      .set({ status: 'deleting' })
      .where(eq(postgresInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'postgres',
      diff: { postgres: instance.name },
    });

    this.logger.log(`Postgres ${instance.name} (${id}) deletion initiated`);
    return updated;
  }
}
