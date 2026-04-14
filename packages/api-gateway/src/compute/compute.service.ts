import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { resources, quotas, auditLogs } from '../database/schema';
import type { CreateVmDto, ResizeVmDto, DEFAULT_VM_IMAGES } from '@cloudify/common';

@Injectable()
export class ComputeService {
  private readonly logger = new Logger(ComputeService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async createVm(tenantId: string, userId: string, dto: CreateVmDto) {
    // Check quota
    await this.checkQuota(tenantId, 'vm');

    // Create resource record
    const [resource] = await this.db
      .insert(resources)
      .values({
        tenantId,
        type: 'vm',
        name: dto.name,
        status: 'provisioning',
        spec: {
          cpus: dto.cpus,
          memoryMb: dto.memoryMb,
          diskGb: dto.diskGb,
          templateId: dto.templateId ?? null,
          networkBridge: dto.networkBridge ?? 'vmbr0',
          sshKeys: dto.sshKeys ?? [],
          userData: dto.userData ?? null,
          tags: dto.tags ?? {},
          placementStrategy: dto.placementStrategy ?? 'spread',
          preferredNode: dto.preferredNode ?? null,
        },
      })
      .returning();

    // Increment quota usage
    await this.db
      .update(quotas)
      .set({ currentUsage: resource ? 1 : 0 }) // Will use sql`current_usage + 1` in real impl
      .where(and(eq(quotas.tenantId, tenantId), eq(quotas.resourceType, 'vm')));

    // Audit log
    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceId: resource.id,
      resourceType: 'vm',
      diff: { spec: resource.spec },
    });

    this.logger.log(
      `VM ${resource.name} (${resource.id}) creation initiated for tenant ${tenantId}`,
    );

    // In production, this would emit an event to the NATS bus triggering
    // the hypervisor provider to actually create the VM asynchronously
    return resource;
  }

  async listVms(tenantId: string) {
    return this.db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenantId), eq(resources.type, 'vm')))
      .orderBy(resources.createdAt);
  }

  async getVm(tenantId: string, vmId: string) {
    const [vm] = await this.db
      .select()
      .from(resources)
      .where(
        and(eq(resources.id, vmId), eq(resources.tenantId, tenantId), eq(resources.type, 'vm')),
      )
      .limit(1);

    if (!vm) {
      throw new NotFoundException(`VM ${vmId} not found`);
    }

    return vm;
  }

  async vmAction(tenantId: string, vmId: string, userId: string, action: string, force?: boolean) {
    const vm = await this.getVm(tenantId, vmId);

    const actionMap: Record<string, string> = {
      start: 'start',
      stop: 'stop',
      restart: 'restart',
    };

    if (!actionMap[action]) {
      throw new BadRequestException(`Invalid action: ${action}`);
    }

    // Update status
    const [updated] = await this.db
      .update(resources)
      .set({
        status: action === 'stop' ? 'suspended' : 'active',
        spec: { ...(vm.spec as Record<string, unknown>), lastAction: action, force: !!force },
      })
      .where(eq(resources.id, vmId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: action as 'start' | 'stop' | 'restart',
      resourceId: vmId,
      resourceType: 'vm',
    });

    this.logger.log(`VM ${vm.name} action: ${action} (force=${force})`);
    return updated;
  }

  async resizeVm(tenantId: string, vmId: string, userId: string, dto: ResizeVmDto) {
    const vm = await this.getVm(tenantId, vmId);
    const currentSpec = vm.spec as Record<string, unknown>;

    const newSpec = {
      ...currentSpec,
      ...(dto.cpus !== undefined && { cpus: dto.cpus }),
      ...(dto.memoryMb !== undefined && { memoryMb: dto.memoryMb }),
      ...(dto.diskGb !== undefined && { diskGb: dto.diskGb }),
    };

    const [updated] = await this.db
      .update(resources)
      .set({ spec: newSpec, status: 'updating' })
      .where(eq(resources.id, vmId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'scale',
      resourceId: vmId,
      resourceType: 'vm',
      diff: { before: currentSpec, after: newSpec },
    });

    this.logger.log(`VM ${vm.name} resize initiated`);
    return updated;
  }

  async deleteVm(tenantId: string, vmId: string, userId: string) {
    const vm = await this.getVm(tenantId, vmId);

    const [updated] = await this.db
      .update(resources)
      .set({ status: 'deleting' })
      .where(eq(resources.id, vmId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceId: vmId,
      resourceType: 'vm',
    });

    this.logger.log(`VM ${vm.name} (${vmId}) deletion initiated for tenant ${tenantId}`);
    return updated;
  }

  // ── Snapshots ──

  async createSnapshot(
    tenantId: string,
    vmId: string,
    userId: string,
    name: string,
    description?: string,
  ) {
    await this.getVm(tenantId, vmId);

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'backup',
      resourceId: vmId,
      resourceType: 'vm',
      diff: { snapshot: { name, description } },
    });

    this.logger.log(`Snapshot "${name}" creation requested for VM ${vmId}`);
    return { vmId, snapshotName: name, status: 'creating' };
  }

  async restoreSnapshot(tenantId: string, vmId: string, userId: string, snapshotName: string) {
    await this.getVm(tenantId, vmId);

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'restore',
      resourceId: vmId,
      resourceType: 'vm',
      diff: { snapshot: snapshotName },
    });

    this.logger.log(`Snapshot "${snapshotName}" restore requested for VM ${vmId}`);
    return { vmId, snapshotName, status: 'restoring' };
  }

  // ── Helpers ──

  private async checkQuota(tenantId: string, resourceType: string) {
    const [quota] = await this.db
      .select()
      .from(quotas)
      .where(
        and(
          eq(quotas.tenantId, tenantId),
          eq(quotas.resourceType, resourceType as (typeof quotas.resourceType.enumValues)[number]),
        ),
      )
      .limit(1);

    if (quota && quota.currentUsage >= quota.limit) {
      throw new BadRequestException(
        `Quota exceeded for ${resourceType}: ${quota.currentUsage}/${quota.limit}`,
      );
    }
  }
}
