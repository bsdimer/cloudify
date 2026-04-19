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
import { mongodbInstances, managedServiceBackups, auditLogs } from '../database/schema';
import {
  INSTANCE_SIZES,
  DEFAULT_BACKUP_POLICY,
  SUPPORTED_MONGODB_VERSIONS,
  type CreateMongoDbDto,
} from '@cloudify/common';

@Injectable()
export class MongoDbService {
  private readonly logger = new Logger(MongoDbService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async create(tenantId: string, userId: string, dto: CreateMongoDbDto) {
    if (
      !SUPPORTED_MONGODB_VERSIONS.includes(
        dto.version as (typeof SUPPORTED_MONGODB_VERSIONS)[number],
      )
    ) {
      throw new BadRequestException(
        `Unsupported MongoDB version: ${dto.version}. Supported: ${SUPPORTED_MONGODB_VERSIONS.join(', ')}`,
      );
    }

    if (!INSTANCE_SIZES[dto.size]) {
      throw new BadRequestException(`Unknown instance size: ${dto.size}`);
    }

    if (![1, 3, 5].includes(dto.replicaSetSize)) {
      throw new BadRequestException('replicaSetSize must be 1, 3, or 5');
    }

    const [existing] = await this.db
      .select()
      .from(mongodbInstances)
      .where(and(eq(mongodbInstances.tenantId, tenantId), eq(mongodbInstances.name, dto.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`MongoDB instance "${dto.name}" already exists`);
    }

    const spec = INSTANCE_SIZES[dto.size];
    const backupPolicy = { ...DEFAULT_BACKUP_POLICY, ...(dto.backupPolicy ?? {}) };

    const [instance] = await this.db
      .insert(mongodbInstances)
      .values({
        tenantId,
        name: dto.name,
        version: dto.version,
        size: dto.size,
        replicaSetSize: dto.replicaSetSize,
        publicAccess: dto.publicAccess ?? false,
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
      resourceType: 'mongodb',
      diff: {
        mongodb: {
          name: dto.name,
          version: dto.version,
          size: dto.size,
          replicaSet: dto.replicaSetSize,
        },
      },
    });

    this.logger.log(
      `MongoDB ${instance.name} (${instance.id}) provisioning for tenant ${tenantId}`,
    );
    return instance;
  }

  async list(tenantId: string) {
    return this.db
      .select()
      .from(mongodbInstances)
      .where(eq(mongodbInstances.tenantId, tenantId))
      .orderBy(mongodbInstances.createdAt);
  }

  async get(tenantId: string, id: string) {
    const [instance] = await this.db
      .select()
      .from(mongodbInstances)
      .where(and(eq(mongodbInstances.id, id), eq(mongodbInstances.tenantId, tenantId)))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`MongoDB instance ${id} not found`);
    }

    return instance;
  }

  async createBackup(tenantId: string, id: string, userId: string, name?: string) {
    const instance = await this.get(tenantId, id);

    const backupName = name ?? `${instance.name}-${new Date().toISOString()}`;
    const [backup] = await this.db
      .insert(managedServiceBackups)
      .values({
        tenantId,
        serviceType: 'mongodb',
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
      resourceType: 'mongodb',
      diff: { backup: backupName },
    });

    this.logger.log(`MongoDB backup "${backupName}" initiated for ${instance.name}`);
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
          eq(managedServiceBackups.serviceType, 'mongodb'),
          eq(managedServiceBackups.instanceId, instanceId),
        ),
      )
      .orderBy(managedServiceBackups.createdAt);
  }

  async delete(tenantId: string, id: string, userId: string) {
    const instance = await this.get(tenantId, id);

    const [updated] = await this.db
      .update(mongodbInstances)
      .set({ status: 'deleting' })
      .where(eq(mongodbInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'mongodb',
      diff: { mongodb: instance.name },
    });

    this.logger.log(`MongoDB ${instance.name} (${id}) deletion initiated`);
    return updated;
  }
}
