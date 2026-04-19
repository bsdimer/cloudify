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
import { valkeyInstances, auditLogs } from '../database/schema';
import { INSTANCE_SIZES, SUPPORTED_VALKEY_VERSIONS, type CreateValkeyDto } from '@cloudify/common';

@Injectable()
export class ValkeyService {
  private readonly logger = new Logger(ValkeyService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async create(tenantId: string, userId: string, dto: CreateValkeyDto) {
    if (
      !SUPPORTED_VALKEY_VERSIONS.includes(dto.version as (typeof SUPPORTED_VALKEY_VERSIONS)[number])
    ) {
      throw new BadRequestException(
        `Unsupported Valkey version: ${dto.version}. Supported: ${SUPPORTED_VALKEY_VERSIONS.join(', ')}`,
      );
    }

    if (!INSTANCE_SIZES[dto.size]) {
      throw new BadRequestException(`Unknown instance size: ${dto.size}`);
    }

    if (dto.mode === 'cluster') {
      if (!dto.clusterShards || dto.clusterShards < 3) {
        throw new BadRequestException('Cluster mode requires at least 3 shards');
      }
    }

    const [existing] = await this.db
      .select()
      .from(valkeyInstances)
      .where(and(eq(valkeyInstances.tenantId, tenantId), eq(valkeyInstances.name, dto.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Valkey instance "${dto.name}" already exists`);
    }

    const spec = INSTANCE_SIZES[dto.size];

    const [instance] = await this.db
      .insert(valkeyInstances)
      .values({
        tenantId,
        name: dto.name,
        version: dto.version,
        size: dto.size,
        mode: dto.mode,
        persistence: dto.persistence ?? 'rdb',
        evictionPolicy: dto.evictionPolicy ?? 'noeviction',
        clusterShards: dto.mode === 'cluster' ? (dto.clusterShards ?? 3) : 1,
        replicasPerShard: dto.mode === 'cluster' ? (dto.replicasPerShard ?? 1) : 0,
        memoryMb: spec.memoryMb,
        passwordEnabled: dto.password ?? true,
        publicAccess: dto.publicAccess ?? false,
        vpcId: dto.vpcId ?? null,
        tags: dto.tags ?? {},
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'valkey',
      diff: { valkey: { name: dto.name, mode: dto.mode, size: dto.size } },
    });

    this.logger.log(`Valkey ${instance.name} (${instance.id}) provisioning for tenant ${tenantId}`);
    return instance;
  }

  async list(tenantId: string) {
    return this.db
      .select()
      .from(valkeyInstances)
      .where(eq(valkeyInstances.tenantId, tenantId))
      .orderBy(valkeyInstances.createdAt);
  }

  async get(tenantId: string, id: string) {
    const [instance] = await this.db
      .select()
      .from(valkeyInstances)
      .where(and(eq(valkeyInstances.id, id), eq(valkeyInstances.tenantId, tenantId)))
      .limit(1);

    if (!instance) {
      throw new NotFoundException(`Valkey instance ${id} not found`);
    }

    return instance;
  }

  async updateConfig(
    tenantId: string,
    id: string,
    userId: string,
    updates: { evictionPolicy?: string; persistence?: 'none' | 'rdb' | 'aof' | 'rdb-aof' },
  ) {
    const instance = await this.get(tenantId, id);

    const [updated] = await this.db
      .update(valkeyInstances)
      .set({
        status: 'updating',
        ...(updates.evictionPolicy && { evictionPolicy: updates.evictionPolicy }),
        ...(updates.persistence && { persistence: updates.persistence }),
      })
      .where(eq(valkeyInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      resourceType: 'valkey',
      diff: { config: updates },
    });

    this.logger.log(`Valkey ${instance.name} config updated`);
    return updated;
  }

  async delete(tenantId: string, id: string, userId: string) {
    const instance = await this.get(tenantId, id);

    const [updated] = await this.db
      .update(valkeyInstances)
      .set({ status: 'deleting' })
      .where(eq(valkeyInstances.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'valkey',
      diff: { valkey: instance.name },
    });

    this.logger.log(`Valkey ${instance.name} (${id}) deletion initiated`);
    return updated;
  }
}
