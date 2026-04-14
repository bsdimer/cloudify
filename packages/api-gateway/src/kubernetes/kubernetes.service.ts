import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { k8sClusters, resources, quotas, auditLogs } from '../database/schema';
import { SUPPORTED_K8S_VERSIONS, type CreateK8sClusterDto } from '@cloudify/common';

@Injectable()
export class KubernetesService {
  private readonly logger = new Logger(KubernetesService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async createCluster(tenantId: string, userId: string, dto: CreateK8sClusterDto) {
    // Validate K8s version
    const version = SUPPORTED_K8S_VERSIONS.find((v) => v.version === dto.version && v.supported);
    if (!version) {
      throw new BadRequestException(
        `Unsupported Kubernetes version: ${dto.version}. Supported: ${SUPPORTED_K8S_VERSIONS.filter(
          (v) => v.supported,
        )
          .map((v) => v.version)
          .join(', ')}`,
      );
    }

    // Check quota
    const [quota] = await this.db
      .select()
      .from(quotas)
      .where(and(eq(quotas.tenantId, tenantId), eq(quotas.resourceType, 'k8s_cluster')))
      .limit(1);

    if (quota && quota.currentUsage >= quota.limit) {
      throw new BadRequestException(
        `K8s cluster quota exceeded: ${quota.currentUsage}/${quota.limit}`,
      );
    }

    // Create cluster record
    const cpDefaults = {
      cpus: dto.controlPlaneCpus ?? 2,
      memoryMb: dto.controlPlaneMemoryMb ?? 4096,
      diskGb: dto.controlPlaneDiskGb ?? 50,
    };

    const [cluster] = await this.db
      .insert(k8sClusters)
      .values({
        tenantId,
        name: dto.name,
        version: dto.version,
        controlPlaneCount: dto.controlPlaneCount,
        workerCount: dto.workerCount,
        controlPlaneSpec: cpDefaults,
        workerSpec: {
          cpus: dto.workerCpus,
          memoryMb: dto.workerMemoryMb,
          diskGb: dto.workerDiskGb,
        },
        cniPlugin: dto.cniPlugin ?? 'cilium',
        podCidr: dto.podCidr ?? '10.244.0.0/16',
        serviceCidr: dto.serviceCidr ?? '10.96.0.0/12',
      })
      .returning();

    // Also create a resource record for generic tracking
    await this.db.insert(resources).values({
      tenantId,
      type: 'k8s_cluster',
      name: dto.name,
      status: 'provisioning',
      spec: {
        clusterId: cluster.id,
        version: dto.version,
        controlPlaneCount: dto.controlPlaneCount,
        workerCount: dto.workerCount,
      },
    });

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'k8s_cluster',
      diff: { cluster: { name: dto.name, version: dto.version } },
    });

    this.logger.log(
      `K8s cluster ${cluster.name} (${cluster.id}) provisioning started for tenant ${tenantId}`,
    );

    // In production: emit event to NATS → triggers VM creation, cloud-init, kubeadm bootstrap
    return cluster;
  }

  async listClusters(tenantId: string) {
    return this.db
      .select()
      .from(k8sClusters)
      .where(eq(k8sClusters.tenantId, tenantId))
      .orderBy(k8sClusters.createdAt);
  }

  async getCluster(tenantId: string, clusterId: string) {
    const [cluster] = await this.db
      .select()
      .from(k8sClusters)
      .where(and(eq(k8sClusters.id, clusterId), eq(k8sClusters.tenantId, tenantId)))
      .limit(1);

    if (!cluster) {
      throw new NotFoundException(`K8s cluster ${clusterId} not found`);
    }

    return cluster;
  }

  async scaleCluster(tenantId: string, clusterId: string, userId: string, workerCount: number) {
    const cluster = await this.getCluster(tenantId, clusterId);

    if (cluster.status !== 'active') {
      throw new BadRequestException(`Cannot scale cluster in "${cluster.status}" state`);
    }

    if (workerCount < 1) {
      throw new BadRequestException('Worker count must be at least 1');
    }

    const [updated] = await this.db
      .update(k8sClusters)
      .set({ workerCount, status: 'scaling' })
      .where(eq(k8sClusters.id, clusterId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'scale',
      resourceType: 'k8s_cluster',
      diff: { from: cluster.workerCount, to: workerCount },
    });

    this.logger.log(`K8s cluster ${cluster.name} scaling: ${cluster.workerCount} → ${workerCount}`);
    return updated;
  }

  async upgradeCluster(tenantId: string, clusterId: string, userId: string, targetVersion: string) {
    const cluster = await this.getCluster(tenantId, clusterId);

    if (cluster.status !== 'active') {
      throw new BadRequestException(`Cannot upgrade cluster in "${cluster.status}" state`);
    }

    const version = SUPPORTED_K8S_VERSIONS.find((v) => v.version === targetVersion && v.supported);
    if (!version) {
      throw new BadRequestException(`Unsupported target version: ${targetVersion}`);
    }

    if (targetVersion <= cluster.version) {
      throw new BadRequestException(
        `Target version ${targetVersion} must be greater than current ${cluster.version}`,
      );
    }

    const [updated] = await this.db
      .update(k8sClusters)
      .set({ version: targetVersion, status: 'upgrading' })
      .where(eq(k8sClusters.id, clusterId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'upgrade',
      resourceType: 'k8s_cluster',
      diff: { from: cluster.version, to: targetVersion },
    });

    this.logger.log(`K8s cluster ${cluster.name} upgrade: ${cluster.version} → ${targetVersion}`);
    return updated;
  }

  async deleteCluster(tenantId: string, clusterId: string, userId: string) {
    const cluster = await this.getCluster(tenantId, clusterId);

    const [updated] = await this.db
      .update(k8sClusters)
      .set({ status: 'deleting' })
      .where(eq(k8sClusters.id, clusterId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'k8s_cluster',
      diff: { cluster: cluster.name },
    });

    this.logger.log(`K8s cluster ${cluster.name} (${clusterId}) deletion initiated`);
    return updated;
  }
}
