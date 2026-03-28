import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  numeric,
  index,
} from 'drizzle-orm/pg-core';

// ── Enums ──

export const tenantStatusEnum = pgEnum('tenant_status', [
  'active',
  'suspended',
  'pending',
  'decommissioned',
]);

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer']);

export const resourceTypeEnum = pgEnum('resource_type', [
  'k8s_cluster',
  'vm',
  'postgres',
  'mongodb',
  'valkey',
  'minio_bucket',
  'dns_zone',
  'load_balancer',
  'certificate',
  'secret',
  'registry_project',
  'sdn_network',
  'floating_ip',
]);

export const resourceStatusEnum = pgEnum('resource_status', [
  'pending',
  'provisioning',
  'active',
  'updating',
  'deleting',
  'deleted',
  'error',
  'suspended',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'start',
  'stop',
  'restart',
  'scale',
  'upgrade',
  'backup',
  'restore',
  'login',
  'logout',
  'api_key_created',
  'api_key_revoked',
]);

// ── Tables ──

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 128 }).notNull().unique(),
    ownerId: uuid('owner_id'),
    status: tenantStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('tenants_slug_idx').on(table.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull().default('member'),
    mfaSecret: text('mfa_secret'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_tenant_id_idx').on(table.tenantId),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    keyHash: text('key_hash').notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_user_id_idx').on(table.userId),
  ],
);

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: resourceTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: resourceStatusEnum('status').notNull().default('pending'),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull().default({}),
    providerId: varchar('provider_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('resources_tenant_id_idx').on(table.tenantId),
    index('resources_type_idx').on(table.type),
    index('resources_status_idx').on(table.status),
    index('resources_tenant_type_idx').on(table.tenantId, table.type),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: auditActionEnum('action').notNull(),
    resourceId: uuid('resource_id'),
    resourceType: resourceTypeEnum('resource_type'),
    diff: jsonb('diff').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_id_idx').on(table.tenantId),
    index('audit_logs_timestamp_idx').on(table.timestamp),
    index('audit_logs_tenant_timestamp_idx').on(table.tenantId, table.timestamp),
  ],
);

export const quotas = pgTable(
  'quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourceType: resourceTypeEnum('resource_type').notNull(),
    limit: integer('limit').notNull(),
    currentUsage: integer('current_usage').notNull().default(0),
  },
  (table) => [index('quotas_tenant_resource_idx').on(table.tenantId, table.resourceType)],
);

export const billingAccounts = pgTable('billing_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  paymentMethod: text('payment_method'),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0.00'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    metric: varchar('metric', { length: 128 }).notNull(),
    value: numeric('value', { precision: 18, scale: 6 }).notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_records_tenant_idx').on(table.tenantId),
    index('usage_records_resource_idx').on(table.resourceId),
    index('usage_records_timestamp_idx').on(table.timestamp),
  ],
);
