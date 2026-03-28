/**
 * Seed script for control-plane database.
 * Run: npx ts-node --project tsconfig.json src/database/seed.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import * as bcrypt from 'bcryptjs';
import { tenants, users, quotas, billingAccounts } from './schema';
import type { resourceTypeEnum } from './schema';

type ResourceTypeValue = (typeof resourceTypeEnum.enumValues)[number];

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://cloudify:cloudify@localhost:5432/cloudify';

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

async function seed() {
  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  console.log('Seeding database...');

  // 1. Create system admin tenant
  const [adminTenant] = await db
    .insert(tenants)
    .values({
      name: 'Cloudify Admin',
      slug: 'cloudify-admin',
      status: 'active',
    })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  if (!adminTenant) {
    console.log('Admin tenant already exists, skipping seed.');
    await client.end();
    return;
  }

  // 2. Create admin user
  const passwordHash = await bcrypt.hash('admin123456', 12);
  const [adminUser] = await db
    .insert(users)
    .values({
      email: 'admin@cloudify.local',
      passwordHash,
      tenantId: adminTenant.id,
      role: 'super_admin',
    })
    .returning();

  // 3. Set owner
  await db.update(tenants).set({ ownerId: adminUser.id }).where(eq(tenants.id, adminTenant.id));

  // 4. Default quotas
  await db.insert(quotas).values(
    DEFAULT_QUOTAS.map((q) => ({
      tenantId: adminTenant.id,
      resourceType: q.resourceType,
      limit: q.limit,
    })),
  );

  // 5. Billing account
  await db.insert(billingAccounts).values({
    tenantId: adminTenant.id,
  });

  console.log('Seed complete:');
  console.log(`  Admin tenant: ${adminTenant.slug} (${adminTenant.id})`);
  console.log(`  Admin user: ${adminUser.email}`);
  console.log('  Default password: admin123456 (CHANGE THIS!)');

  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
