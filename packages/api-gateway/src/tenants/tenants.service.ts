import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import {
  tenants,
  users,
  quotas,
  billingAccounts,
  auditLogs,
  type resourceTypeEnum,
} from '../database/schema';
import { AuthService } from '../auth/auth.service';

type ResourceTypeValue = (typeof resourceTypeEnum.enumValues)[number];
type TenantStatusValue = 'active' | 'suspended' | 'pending' | 'decommissioned';

const DEFAULT_QUOTAS: { resourceType: ResourceTypeValue; limit: number }[] = [
  { resourceType: 'k8s_cluster', limit: 3 },
  { resourceType: 'vm', limit: 10 },
  { resourceType: 'postgres', limit: 5 },
  { resourceType: 'mongodb', limit: 3 },
  { resourceType: 'valkey', limit: 5 },
  { resourceType: 'minio_bucket', limit: 10 },
  { resourceType: 'dns_zone', limit: 5 },
  { resourceType: 'load_balancer', limit: 3 },
  { resourceType: 'certificate', limit: 20 },
  { resourceType: 'floating_ip', limit: 5 },
];

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private authService: AuthService,
  ) {}

  async create(data: { name: string; slug: string; ownerEmail: string; ownerPassword: string }) {
    // Check slug uniqueness
    const [existing] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, data.slug))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Tenant with slug "${data.slug}" already exists`);
    }

    // Check email uniqueness
    const [existingUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, data.ownerEmail))
      .limit(1);

    if (existingUser) {
      throw new ConflictException(`User with email "${data.ownerEmail}" already exists`);
    }

    // Transaction: create tenant + owner user + default quotas + billing account
    const result = await this.db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: data.name,
          slug: data.slug,
          status: 'active',
        })
        .returning();

      const passwordHash = await this.authService.hashPassword(data.ownerPassword);
      const [owner] = await tx
        .insert(users)
        .values({
          email: data.ownerEmail,
          passwordHash,
          tenantId: tenant.id,
          role: 'owner',
        })
        .returning();

      await tx.update(tenants).set({ ownerId: owner.id }).where(eq(tenants.id, tenant.id));

      await tx.insert(quotas).values(
        DEFAULT_QUOTAS.map((q) => ({
          tenantId: tenant.id,
          resourceType: q.resourceType,
          limit: q.limit,
        })),
      );

      await tx.insert(billingAccounts).values({
        tenantId: tenant.id,
      });

      await tx.insert(auditLogs).values({
        tenantId: tenant.id,
        userId: owner.id,
        action: 'create',
        diff: { tenant: { name: data.name, slug: data.slug } },
      });

      this.logger.log(`Tenant created: ${tenant.slug} (${tenant.id})`);

      return {
        ...tenant,
        ownerId: owner.id,
        owner: { id: owner.id, email: owner.email, role: owner.role },
      };
    });

    return result;
  }

  async findAll(page = 1, perPage = 20) {
    const offset = (page - 1) * perPage;
    const rows = await this.db
      .select()
      .from(tenants)
      .limit(perPage)
      .offset(offset)
      .orderBy(tenants.createdAt);

    return rows;
  }

  async findById(id: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);

    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found`);
    }

    return tenant;
  }

  async update(id: string, data: { name?: string; status?: TenantStatusValue }) {
    await this.findById(id); // throws if not found

    const [updated] = await this.db
      .update(tenants)
      .set(data)
      .where(eq(tenants.id, id))
      .returning();

    return updated;
  }

  async suspend(id: string) {
    return this.update(id, { status: 'suspended' });
  }

  async activate(id: string) {
    return this.update(id, { status: 'active' });
  }

  async delete(id: string) {
    const tenant = await this.findById(id);

    await this.db
      .update(tenants)
      .set({ status: 'decommissioned' })
      .where(eq(tenants.id, id));

    this.logger.warn(`Tenant decommissioned: ${tenant.slug} (${tenant.id})`);

    return { message: `Tenant ${tenant.slug} marked for decommission` };
  }
}
