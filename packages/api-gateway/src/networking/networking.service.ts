import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { vpcs, subnets, securityGroups, auditLogs } from '../database/schema';
import type { CreateVpcDto, CreateSubnetDto, SecurityRule } from '@cloudify/common';

@Injectable()
export class NetworkingService {
  private readonly logger = new Logger(NetworkingService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // ── VPCs ──

  async createVpc(tenantId: string, userId: string, dto: CreateVpcDto) {
    const [existing] = await this.db
      .select()
      .from(vpcs)
      .where(and(eq(vpcs.tenantId, tenantId), eq(vpcs.name, dto.name)))
      .limit(1);

    if (existing) {
      throw new ConflictException(`VPC "${dto.name}" already exists`);
    }

    if (!this.isValidCidr(dto.cidr)) {
      throw new BadRequestException(`Invalid CIDR: ${dto.cidr}`);
    }

    const [vpc] = await this.db
      .insert(vpcs)
      .values({
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        cidr: dto.cidr,
        status: 'provisioning',
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'sdn_network',
      diff: { vpc: { name: dto.name, cidr: dto.cidr } },
    });

    this.logger.log(`VPC ${vpc.name} (${vpc.id}) created for tenant ${tenantId}`);

    // In production: emit event to NATS → OVN creates logical router
    return vpc;
  }

  async listVpcs(tenantId: string) {
    return this.db.select().from(vpcs).where(eq(vpcs.tenantId, tenantId)).orderBy(vpcs.createdAt);
  }

  async getVpc(tenantId: string, vpcId: string) {
    const [vpc] = await this.db
      .select()
      .from(vpcs)
      .where(and(eq(vpcs.id, vpcId), eq(vpcs.tenantId, tenantId)))
      .limit(1);

    if (!vpc) {
      throw new NotFoundException(`VPC ${vpcId} not found`);
    }

    return vpc;
  }

  async deleteVpc(tenantId: string, vpcId: string, userId: string) {
    const vpc = await this.getVpc(tenantId, vpcId);

    await this.db.update(vpcs).set({ status: 'deleting' }).where(eq(vpcs.id, vpcId));

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'sdn_network',
      diff: { vpc: vpc.name },
    });

    this.logger.log(`VPC ${vpc.name} (${vpcId}) deletion initiated`);
    return { message: `VPC "${vpc.name}" scheduled for deletion` };
  }

  // ── Subnets ──

  async createSubnet(tenantId: string, userId: string, dto: CreateSubnetDto) {
    const vpc = await this.getVpc(tenantId, dto.vpcId);

    if (!this.isSubnetOfVpc(dto.cidr, vpc.cidr)) {
      throw new BadRequestException(`Subnet CIDR ${dto.cidr} must be within VPC CIDR ${vpc.cidr}`);
    }

    const [subnet] = await this.db
      .insert(subnets)
      .values({
        vpcId: dto.vpcId,
        tenantId,
        name: dto.name,
        cidr: dto.cidr,
        gateway: dto.gateway ?? null,
        dnsServers: dto.dnsServers ?? ['8.8.8.8', '1.1.1.1'],
        dhcpEnabled: dto.dhcpEnabled ?? true,
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'sdn_network',
      diff: { subnet: { name: dto.name, cidr: dto.cidr, vpcId: dto.vpcId } },
    });

    this.logger.log(`Subnet ${subnet.name} (${subnet.id}) created in VPC ${vpc.name}`);
    return subnet;
  }

  async listSubnets(tenantId: string, vpcId: string) {
    return this.db
      .select()
      .from(subnets)
      .where(and(eq(subnets.tenantId, tenantId), eq(subnets.vpcId, vpcId)))
      .orderBy(subnets.createdAt);
  }

  async deleteSubnet(tenantId: string, subnetId: string, userId: string) {
    const [subnet] = await this.db
      .select()
      .from(subnets)
      .where(and(eq(subnets.id, subnetId), eq(subnets.tenantId, tenantId)))
      .limit(1);

    if (!subnet) {
      throw new NotFoundException(`Subnet ${subnetId} not found`);
    }

    await this.db.delete(subnets).where(eq(subnets.id, subnetId));

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'sdn_network',
      diff: { subnet: subnet.name },
    });

    this.logger.log(`Subnet ${subnet.name} (${subnetId}) deleted`);
    return { message: `Subnet "${subnet.name}" deleted` };
  }

  // ── Security Groups ──

  async createSecurityGroup(
    tenantId: string,
    userId: string,
    dto: { name: string; description?: string; vpcId: string; rules: SecurityRule[] },
  ) {
    await this.getVpc(tenantId, dto.vpcId);

    const [sg] = await this.db
      .insert(securityGroups)
      .values({
        tenantId,
        vpcId: dto.vpcId,
        name: dto.name,
        description: dto.description ?? null,
        rules: dto.rules,
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      diff: { securityGroup: { name: dto.name, rulesCount: dto.rules.length } },
    });

    this.logger.log(`Security group ${sg.name} (${sg.id}) created`);
    return sg;
  }

  async listSecurityGroups(tenantId: string, vpcId: string) {
    return this.db
      .select()
      .from(securityGroups)
      .where(and(eq(securityGroups.tenantId, tenantId), eq(securityGroups.vpcId, vpcId)))
      .orderBy(securityGroups.name);
  }

  async updateSecurityGroupRules(
    tenantId: string,
    sgId: string,
    userId: string,
    rules: SecurityRule[],
  ) {
    const [sg] = await this.db
      .select()
      .from(securityGroups)
      .where(and(eq(securityGroups.id, sgId), eq(securityGroups.tenantId, tenantId)))
      .limit(1);

    if (!sg) {
      throw new NotFoundException(`Security group ${sgId} not found`);
    }

    const [updated] = await this.db
      .update(securityGroups)
      .set({ rules })
      .where(eq(securityGroups.id, sgId))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      diff: { securityGroup: sg.name, rulesCount: rules.length },
    });

    this.logger.log(`Security group ${sg.name} rules updated (${rules.length} rules)`);
    return updated;
  }

  async deleteSecurityGroup(tenantId: string, sgId: string, userId: string) {
    const [sg] = await this.db
      .select()
      .from(securityGroups)
      .where(and(eq(securityGroups.id, sgId), eq(securityGroups.tenantId, tenantId)))
      .limit(1);

    if (!sg) {
      throw new NotFoundException(`Security group ${sgId} not found`);
    }

    await this.db.delete(securityGroups).where(eq(securityGroups.id, sgId));

    this.logger.log(`Security group ${sg.name} (${sgId}) deleted`);
    return { message: `Security group "${sg.name}" deleted` };
  }

  // ── Helpers ──

  private isValidCidr(cidr: string): boolean {
    const parts = cidr.split('/');
    if (parts.length !== 2) return false;
    const prefix = parseInt(parts[1], 10);
    return prefix >= 8 && prefix <= 30;
  }

  private isSubnetOfVpc(subnetCidr: string, vpcCidr: string): boolean {
    // Basic check: subnet prefix must be larger than VPC prefix
    const subnetPrefix = parseInt(subnetCidr.split('/')[1], 10);
    const vpcPrefix = parseInt(vpcCidr.split('/')[1], 10);
    return subnetPrefix > vpcPrefix;
  }
}
