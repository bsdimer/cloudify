import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { ipPools, ipAllocations, resources, auditLogs } from '../database/schema';
import type { IpVersion, IpAllocationType } from '@cloudify/common';

@Injectable()
export class IpamService {
  private readonly logger = new Logger(IpamService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // ── IP Pools (admin-only) ──

  async createPool(data: {
    name: string;
    cidr: string;
    version: IpVersion;
    gateway?: string;
    description?: string;
  }) {
    const totalIps = this.calculateTotalIps(data.cidr, data.version);

    const [pool] = await this.db
      .insert(ipPools)
      .values({
        name: data.name,
        cidr: data.cidr,
        version: data.version,
        gateway: data.gateway ?? null,
        description: data.description ?? null,
        totalIps,
      })
      .returning();

    this.logger.log(`IP pool created: ${pool.name} (${pool.cidr}), ${totalIps} IPs`);
    return pool;
  }

  async listPools() {
    return this.db.select().from(ipPools).orderBy(ipPools.name);
  }

  async getPool(poolId: string) {
    const [pool] = await this.db.select().from(ipPools).where(eq(ipPools.id, poolId)).limit(1);

    if (!pool) {
      throw new NotFoundException(`IP pool ${poolId} not found`);
    }

    return pool;
  }

  async deletePool(poolId: string) {
    const pool = await this.getPool(poolId);

    if (pool.allocatedIps > 0) {
      throw new BadRequestException(
        `Cannot delete pool with ${pool.allocatedIps} active allocations`,
      );
    }

    await this.db.delete(ipPools).where(eq(ipPools.id, poolId));
    this.logger.log(`IP pool ${pool.name} deleted`);
    return { message: `Pool "${pool.name}" deleted` };
  }

  // ── IP Allocation (per-tenant) ──

  async allocateIp(
    tenantId: string,
    userId: string,
    data: { poolId: string; type: IpAllocationType; description?: string },
  ) {
    const pool = await this.getPool(data.poolId);

    if (pool.allocatedIps >= pool.totalIps) {
      throw new BadRequestException(`IP pool "${pool.name}" is exhausted`);
    }

    // Generate next available IP (simplified — in production use proper CIDR math)
    const nextIp = this.getNextAvailableIp(pool.cidr, pool.allocatedIps);

    const result = await this.db.transaction(async (tx) => {
      const [allocation] = await tx
        .insert(ipAllocations)
        .values({
          tenantId,
          poolId: data.poolId,
          address: nextIp,
          version: pool.version,
          type: data.type,
          status: 'allocated',
          description: data.description ?? null,
        })
        .returning();

      await tx
        .update(ipPools)
        .set({ allocatedIps: sql`${ipPools.allocatedIps} + 1` })
        .where(eq(ipPools.id, data.poolId));

      return allocation;
    });

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'floating_ip',
      diff: { ip: nextIp, type: data.type, pool: pool.name },
    });

    this.logger.log(`IP ${nextIp} allocated to tenant ${tenantId} from pool ${pool.name}`);
    return result;
  }

  async releaseIp(tenantId: string, allocationId: string, userId: string) {
    const [allocation] = await this.db
      .select()
      .from(ipAllocations)
      .where(and(eq(ipAllocations.id, allocationId), eq(ipAllocations.tenantId, tenantId)))
      .limit(1);

    if (!allocation) {
      throw new NotFoundException(`IP allocation ${allocationId} not found`);
    }

    if (allocation.status === 'released') {
      throw new BadRequestException('IP already released');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ipAllocations)
        .set({ status: 'released', resourceId: null })
        .where(eq(ipAllocations.id, allocationId));

      await tx
        .update(ipPools)
        .set({ allocatedIps: sql`${ipPools.allocatedIps} - 1` })
        .where(eq(ipPools.id, allocation.poolId));
    });

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'floating_ip',
      diff: { ip: allocation.address },
    });

    this.logger.log(`IP ${allocation.address} released by tenant ${tenantId}`);
    return { message: `IP ${allocation.address} released` };
  }

  async assignIp(tenantId: string, allocationId: string, resourceId: string, userId: string) {
    const [allocation] = await this.db
      .select()
      .from(ipAllocations)
      .where(and(eq(ipAllocations.id, allocationId), eq(ipAllocations.tenantId, tenantId)))
      .limit(1);

    if (!allocation) {
      throw new NotFoundException(`IP allocation ${allocationId} not found`);
    }

    if (allocation.status !== 'allocated') {
      throw new BadRequestException(`IP is in "${allocation.status}" state, must be "allocated"`);
    }

    // Verify resource belongs to tenant
    const [resource] = await this.db
      .select()
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.tenantId, tenantId)))
      .limit(1);

    if (!resource) {
      throw new NotFoundException(`Resource ${resourceId} not found`);
    }

    const [updated] = await this.db
      .update(ipAllocations)
      .set({ status: 'assigned', resourceId })
      .where(eq(ipAllocations.id, allocationId))
      .returning();

    this.logger.log(`IP ${allocation.address} assigned to resource ${resourceId}`);
    return updated;
  }

  async listAllocations(tenantId: string) {
    return this.db
      .select()
      .from(ipAllocations)
      .where(eq(ipAllocations.tenantId, tenantId))
      .orderBy(ipAllocations.createdAt);
  }

  // ── Helpers ──

  private calculateTotalIps(cidr: string, version: IpVersion): number {
    const prefix = parseInt(cidr.split('/')[1], 10);
    const bits = version === 4 ? 32 : 128;
    // Cap at 65536 for sanity
    return Math.min(Math.pow(2, bits - prefix) - 2, 65536); // -2 for network + broadcast
  }

  private getNextAvailableIp(cidr: string, offset: number): string {
    const [network] = cidr.split('/');
    const octets = network.split('.').map(Number);
    // Simple offset calculation — add offset+1 to the base address
    const ipNum =
      ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3] + offset + 1;
    return [(ipNum >>> 24) & 255, (ipNum >>> 16) & 255, (ipNum >>> 8) & 255, ipNum & 255].join('.');
  }
}
