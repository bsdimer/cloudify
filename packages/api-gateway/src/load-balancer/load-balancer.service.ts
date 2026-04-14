import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { loadBalancers, vpcs, auditLogs } from '../database/schema';
import type { HealthCheckConfig } from '@cloudify/common';

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async create(
    tenantId: string,
    userId: string,
    dto: {
      name: string;
      vpcId: string;
      protocol: string;
      frontendPort: number;
      backendPort: number;
      algorithm?: string;
      healthCheck?: HealthCheckConfig;
      backends: Array<{ address: string; port: number; weight?: number }>;
    },
  ) {
    // Verify VPC belongs to tenant
    const [vpc] = await this.db
      .select()
      .from(vpcs)
      .where(and(eq(vpcs.id, dto.vpcId), eq(vpcs.tenantId, tenantId)))
      .limit(1);

    if (!vpc) {
      throw new NotFoundException(`VPC ${dto.vpcId} not found`);
    }

    const backends = dto.backends.map((b) => ({
      address: b.address,
      port: b.port,
      weight: b.weight ?? 1,
    }));

    const [lb] = await this.db
      .insert(loadBalancers)
      .values({
        tenantId,
        name: dto.name,
        vpcId: dto.vpcId,
        protocol: dto.protocol,
        frontendPort: dto.frontendPort,
        backendPort: dto.backendPort,
        algorithm: dto.algorithm ?? 'roundrobin',
        backends,
        healthCheck: dto.healthCheck ?? null,
        status: 'provisioning',
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'load_balancer',
      diff: { lb: { name: dto.name, protocol: dto.protocol, backends: backends.length } },
    });

    this.logger.log(`Load balancer ${lb.name} (${lb.id}) created for tenant ${tenantId}`);

    // In production: generate HAProxy config and push to LB nodes
    return lb;
  }

  async list(tenantId: string) {
    return this.db
      .select()
      .from(loadBalancers)
      .where(eq(loadBalancers.tenantId, tenantId))
      .orderBy(loadBalancers.createdAt);
  }

  async get(tenantId: string, lbId: string) {
    const [lb] = await this.db
      .select()
      .from(loadBalancers)
      .where(and(eq(loadBalancers.id, lbId), eq(loadBalancers.tenantId, tenantId)))
      .limit(1);

    if (!lb) {
      throw new NotFoundException(`Load balancer ${lbId} not found`);
    }

    return lb;
  }

  async updateBackends(
    tenantId: string,
    lbId: string,
    userId: string,
    backends: Array<{ address: string; port: number; weight?: number }>,
  ) {
    const lb = await this.get(tenantId, lbId);

    const normalizedBackends = backends.map((b) => ({
      address: b.address,
      port: b.port,
      weight: b.weight ?? 1,
    }));

    const [updated] = await this.db
      .update(loadBalancers)
      .set({ backends: normalizedBackends, status: 'updating' })
      .where(eq(loadBalancers.id, lbId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      resourceType: 'load_balancer',
      diff: { backends: normalizedBackends.length },
    });

    this.logger.log(`Load balancer ${lb.name} backends updated (${normalizedBackends.length})`);
    return updated;
  }

  async remove(tenantId: string, lbId: string, userId: string) {
    const lb = await this.get(tenantId, lbId);

    await this.db
      .update(loadBalancers)
      .set({ status: 'deleting' })
      .where(eq(loadBalancers.id, lbId));

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'load_balancer',
      diff: { lb: lb.name },
    });

    this.logger.log(`Load balancer ${lb.name} (${lbId}) deletion initiated`);
    return { message: `Load balancer "${lb.name}" scheduled for deletion` };
  }

  /**
   * Generate HAProxy configuration for a load balancer.
   * This would be pushed to the HAProxy Data Plane API in production.
   */
  generateHaproxyConfig(lb: {
    name: string;
    protocol: string;
    frontendPort: number;
    backendPort: number;
    algorithm: string;
    backends: Array<{ address: string; port: number; weight: number }>;
    healthCheck: {
      protocol: string;
      path?: string;
      intervalSeconds: number;
      timeoutSeconds: number;
      unhealthyThreshold: number;
    } | null;
  }): string {
    const safeName = lb.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lines: string[] = [];

    // Frontend
    lines.push(`frontend ft_${safeName}`);
    lines.push(`  bind *:${lb.frontendPort}`);
    if (lb.protocol === 'http' || lb.protocol === 'https') {
      lines.push(`  mode http`);
    } else {
      lines.push(`  mode tcp`);
    }
    lines.push(`  default_backend bk_${safeName}`);
    lines.push('');

    // Backend
    lines.push(`backend bk_${safeName}`);
    if (lb.protocol === 'http' || lb.protocol === 'https') {
      lines.push(`  mode http`);
    } else {
      lines.push(`  mode tcp`);
    }
    lines.push(`  balance ${lb.algorithm}`);

    // Health check
    if (lb.healthCheck) {
      if (lb.healthCheck.protocol === 'http' && lb.healthCheck.path) {
        lines.push(`  option httpchk GET ${lb.healthCheck.path}`);
      }
      lines.push(
        `  default-server inter ${lb.healthCheck.intervalSeconds}s fall ${lb.healthCheck.unhealthyThreshold}`,
      );
    }

    // Servers
    lb.backends.forEach((backend, i) => {
      const checkStr = lb.healthCheck ? ' check' : '';
      lines.push(
        `  server srv_${i} ${backend.address}:${backend.port} weight ${backend.weight}${checkStr}`,
      );
    });

    return lines.join('\n');
  }
}
