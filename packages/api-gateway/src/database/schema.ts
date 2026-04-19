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
  boolean,
  index,
  uniqueIndex,
  inet,
  smallint,
} from 'drizzle-orm/pg-core';

// ── Enums ──

export const tenantStatusEnum = pgEnum('tenant_status', [
  'active',
  'suspended',
  'pending',
  'decommissioned',
]);

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'owner',
  'admin',
  'member',
  'viewer',
]);

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
  // IAM actions
  'role_created',
  'role_updated',
  'role_deleted',
  'user_invited',
  'user_role_assigned',
  'user_role_revoked',
  'user_removed',
  'service_account_created',
  'service_account_deleted',
  'permission_denied',
]);

export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);

export const serviceAccountStatusEnum = pgEnum('service_account_status', ['active', 'disabled']);

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
    // Reconciliation fields (Section 17)
    desiredStateHash: varchar('desired_state_hash', { length: 64 }),
    actualStateHash: varchar('actual_state_hash', { length: 64 }),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
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

// ── Resource Tags (Section 20) ──

export const resourceTags = pgTable(
  'resource_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 128 }).notNull(),
    value: varchar('value', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resource_tags_resource_key_idx').on(table.resourceId, table.key),
    index('resource_tags_key_value_idx').on(table.key, table.value),
  ],
);

// ── Idempotency Keys (Section 23) ──

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 255 }).notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    method: varchar('method', { length: 10 }).notNull(),
    path: varchar('path', { length: 1024 }).notNull(),
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_keys_tenant_key_idx').on(table.tenantId, table.key),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
  ],
);

// ── Webhook Endpoints (Section 19) ──

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    events: jsonb('events').$type<string[]>().notNull().default([]),
    active: boolean('active').notNull().default(true),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('webhook_endpoints_tenant_id_idx').on(table.tenantId)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    statusCode: integer('status_code'),
    responseBody: text('response_body'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_id_idx').on(table.endpointId),
    index('webhook_deliveries_next_retry_idx').on(table.nextRetryAt),
    index('webhook_deliveries_created_at_idx').on(table.createdAt),
  ],
);

// ── Audit Logs ──

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
    correlationId: varchar('correlation_id', { length: 64 }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_id_idx').on(table.tenantId),
    index('audit_logs_timestamp_idx').on(table.timestamp),
    index('audit_logs_tenant_timestamp_idx').on(table.tenantId, table.timestamp),
    index('audit_logs_correlation_id_idx').on(table.correlationId),
  ],
);

// ── Revoked Tokens (for logout / token revocation) ──

export const revokedTokens = pgTable(
  'revoked_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jti: varchar('jti', { length: 255 }).notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('revoked_tokens_jti_idx').on(table.jti),
    index('revoked_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

// ── Quotas ──

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

// ── Billing ──

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

// ── IAM: Custom Roles ──

export const iamRoles = pgTable(
  'iam_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    builtIn: boolean('built_in').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('iam_roles_tenant_name_idx').on(table.tenantId, table.name),
    index('iam_roles_tenant_id_idx').on(table.tenantId),
  ],
);

// ── IAM: User ↔ Role (many-to-many) ──

export const userIamRoles = pgTable(
  'user_iam_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    iamRoleId: uuid('iam_role_id')
      .notNull()
      .references(() => iamRoles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('user_iam_roles_user_role_idx').on(table.userId, table.iamRoleId),
    index('user_iam_roles_user_id_idx').on(table.userId),
    index('user_iam_roles_role_id_idx').on(table.iamRoleId),
  ],
);

// ── IAM: Service Accounts ──

export const serviceAccounts = pgTable(
  'service_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    status: serviceAccountStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('service_accounts_tenant_name_idx').on(table.tenantId, table.name),
    index('service_accounts_tenant_id_idx').on(table.tenantId),
  ],
);

// ── IAM: Service Account ↔ Role (many-to-many) ──

export const serviceAccountIamRoles = pgTable(
  'service_account_iam_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'cascade' }),
    iamRoleId: uuid('iam_role_id')
      .notNull()
      .references(() => iamRoles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sa_iam_roles_sa_role_idx').on(table.serviceAccountId, table.iamRoleId),
    index('sa_iam_roles_sa_id_idx').on(table.serviceAccountId),
  ],
);

// ── IAM: User Invitations ──

export const userInvitations = pgTable(
  'user_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    iamRoleIds: jsonb('iam_role_ids').$type<string[]>().notNull().default([]),
    status: invitationStatusEnum('status').notNull().default('pending'),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('user_invitations_tenant_id_idx').on(table.tenantId),
    index('user_invitations_email_idx').on(table.email),
    index('user_invitations_token_idx').on(table.token),
    index('user_invitations_expires_at_idx').on(table.expiresAt),
  ],
);

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

// ══════════════════════════════════════════════════════════════════════════════
// Phase 1 — Core Compute & Networking
// ══════════════════════════════════════════════════════════════════════════════

// ── Phase 1 Enums ──

export const vpcStatusEnum = pgEnum('vpc_status', [
  'active',
  'provisioning',
  'deleting',
  'deleted',
  'error',
]);

export const ipAllocationTypeEnum = pgEnum('ip_allocation_type', [
  'floating',
  'ephemeral',
  'private',
]);

export const ipAllocationStatusEnum = pgEnum('ip_allocation_status', [
  'available',
  'allocated',
  'assigned',
  'released',
]);

export const lbStatusEnum = pgEnum('lb_status', [
  'active',
  'provisioning',
  'updating',
  'deleting',
  'deleted',
  'error',
]);

export const k8sClusterStatusEnum = pgEnum('k8s_cluster_status', [
  'provisioning',
  'active',
  'upgrading',
  'scaling',
  'deleting',
  'deleted',
  'error',
]);

// ── VPCs (Virtual Private Clouds) ──

export const vpcs = pgTable(
  'vpcs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    cidr: varchar('cidr', { length: 43 }).notNull(), // max CIDR string length
    status: vpcStatusEnum('status').notNull().default('provisioning'),
    routerId: varchar('router_id', { length: 255 }), // OVN logical router ID
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('vpcs_tenant_id_idx').on(table.tenantId),
    uniqueIndex('vpcs_tenant_name_idx').on(table.tenantId, table.name),
  ],
);

// ── Subnets ──

export const subnets = pgTable(
  'subnets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vpcId: uuid('vpc_id')
      .notNull()
      .references(() => vpcs.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    cidr: varchar('cidr', { length: 43 }).notNull(),
    gateway: varchar('gateway', { length: 45 }),
    dnsServers: jsonb('dns_servers').$type<string[]>().notNull().default([]),
    dhcpEnabled: boolean('dhcp_enabled').notNull().default(true),
    switchId: varchar('switch_id', { length: 255 }), // OVN logical switch ID
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('subnets_vpc_id_idx').on(table.vpcId),
    index('subnets_tenant_id_idx').on(table.tenantId),
    uniqueIndex('subnets_vpc_name_idx').on(table.vpcId, table.name),
  ],
);

// ── Security Groups ──

export const securityGroups = pgTable(
  'security_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    vpcId: uuid('vpc_id')
      .notNull()
      .references(() => vpcs.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    rules: jsonb('rules')
      .$type<
        Array<{
          direction: string;
          protocol: string;
          portRangeMin?: number;
          portRangeMax?: number;
          remoteCidr?: string;
          description?: string;
        }>
      >()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('security_groups_tenant_id_idx').on(table.tenantId),
    index('security_groups_vpc_id_idx').on(table.vpcId),
    uniqueIndex('security_groups_vpc_name_idx').on(table.vpcId, table.name),
  ],
);

// ── IP Pools ──

export const ipPools = pgTable(
  'ip_pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    cidr: varchar('cidr', { length: 43 }).notNull(),
    version: smallint('version').notNull(), // 4 or 6
    gateway: varchar('gateway', { length: 45 }),
    description: text('description'),
    totalIps: integer('total_ips').notNull().default(0),
    allocatedIps: integer('allocated_ips').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('ip_pools_name_idx').on(table.name)],
);

// ── IP Allocations ──

export const ipAllocations = pgTable(
  'ip_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => ipPools.id, { onDelete: 'cascade' }),
    address: inet('address').notNull(),
    version: smallint('version').notNull(),
    type: ipAllocationTypeEnum('type').notNull(),
    status: ipAllocationStatusEnum('status').notNull().default('allocated'),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('ip_allocations_tenant_id_idx').on(table.tenantId),
    index('ip_allocations_pool_id_idx').on(table.poolId),
    index('ip_allocations_address_idx').on(table.address),
    index('ip_allocations_status_idx').on(table.status),
    index('ip_allocations_resource_id_idx').on(table.resourceId),
  ],
);

// ── Load Balancers ──

export const loadBalancers = pgTable(
  'load_balancers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    vpcId: uuid('vpc_id')
      .notNull()
      .references(() => vpcs.id, { onDelete: 'cascade' }),
    status: lbStatusEnum('status').notNull().default('provisioning'),
    protocol: varchar('protocol', { length: 10 }).notNull(), // tcp, http, https
    frontendPort: integer('frontend_port').notNull(),
    backendPort: integer('backend_port').notNull(),
    algorithm: varchar('algorithm', { length: 20 }).notNull().default('roundrobin'),
    publicIpId: uuid('public_ip_id').references(() => ipAllocations.id, { onDelete: 'set null' }),
    backends: jsonb('backends')
      .$type<Array<{ address: string; port: number; weight: number }>>()
      .notNull()
      .default([]),
    healthCheck: jsonb('health_check')
      .$type<{
        protocol: string;
        path?: string;
        intervalSeconds: number;
        timeoutSeconds: number;
        unhealthyThreshold: number;
      } | null>()
      .default(null),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('load_balancers_tenant_id_idx').on(table.tenantId),
    index('load_balancers_vpc_id_idx').on(table.vpcId),
    uniqueIndex('load_balancers_tenant_name_idx').on(table.tenantId, table.name),
  ],
);

// ── K8s Clusters ──

export const k8sClusters = pgTable(
  'k8s_clusters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 20 }).notNull(),
    status: k8sClusterStatusEnum('status').notNull().default('provisioning'),
    controlPlaneCount: smallint('control_plane_count').notNull().default(1),
    workerCount: smallint('worker_count').notNull(),
    controlPlaneSpec: jsonb('control_plane_spec')
      .$type<{ cpus: number; memoryMb: number; diskGb: number }>()
      .notNull(),
    workerSpec: jsonb('worker_spec')
      .$type<{ cpus: number; memoryMb: number; diskGb: number }>()
      .notNull(),
    cniPlugin: varchar('cni_plugin', { length: 20 }).notNull().default('cilium'),
    podCidr: varchar('pod_cidr', { length: 43 }).notNull().default('10.244.0.0/16'),
    serviceCidr: varchar('service_cidr', { length: 43 }).notNull().default('10.96.0.0/12'),
    endpoint: varchar('endpoint', { length: 512 }),
    vpcId: uuid('vpc_id').references(() => vpcs.id, { onDelete: 'set null' }),
    nodeVmIds: jsonb('node_vm_ids')
      .$type<{ controlPlane: string[]; workers: string[] }>()
      .notNull()
      .default({ controlPlane: [], workers: [] }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('k8s_clusters_tenant_id_idx').on(table.tenantId),
    uniqueIndex('k8s_clusters_tenant_name_idx').on(table.tenantId, table.name),
    index('k8s_clusters_status_idx').on(table.status),
  ],
);

// ══════════════════════════════════════════════════════════════════════════════
// Phase 2 — Managed Services (Postgres, MongoDB, Valkey, MinIO)
// ══════════════════════════════════════════════════════════════════════════════

export const managedServiceStatusEnum = pgEnum('managed_service_status', [
  'provisioning',
  'active',
  'updating',
  'backing_up',
  'restoring',
  'failing_over',
  'deleting',
  'deleted',
  'error',
]);

export const valkeyModeEnum = pgEnum('valkey_mode', ['standalone', 'cluster']);
export const valkeyPersistenceEnum = pgEnum('valkey_persistence', [
  'none',
  'rdb',
  'aof',
  'rdb-aof',
]);

export const bucketAccessEnum = pgEnum('bucket_access', [
  'private',
  'public-read',
  'public-read-write',
]);

export const bucketVersioningEnum = pgEnum('bucket_versioning', [
  'enabled',
  'suspended',
  'disabled',
]);

// ── Managed PostgreSQL Instances ──

export const postgresInstances = pgTable(
  'postgres_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 10 }).notNull(),
    size: varchar('size', { length: 20 }).notNull(),
    status: managedServiceStatusEnum('status').notNull().default('provisioning'),
    readReplicas: smallint('read_replicas').notNull().default(0),
    highAvailability: boolean('high_availability').notNull().default(false),
    publicAccess: boolean('public_access').notNull().default(false),
    connectionPooling: boolean('connection_pooling').notNull().default(false),
    storageGb: integer('storage_gb').notNull(),
    connectionEndpoint: varchar('connection_endpoint', { length: 512 }),
    readEndpoint: varchar('read_endpoint', { length: 512 }),
    port: integer('port').notNull().default(5432),
    backupPolicy: jsonb('backup_policy')
      .$type<{
        enabled: boolean;
        scheduleCron?: string;
        retentionDays: number;
        pointInTimeRecovery?: boolean;
      }>()
      .notNull(),
    credentialsSecretRef: varchar('credentials_secret_ref', { length: 512 }),
    vpcId: uuid('vpc_id').references(() => vpcs.id, { onDelete: 'set null' }),
    tags: jsonb('tags').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('postgres_tenant_id_idx').on(table.tenantId),
    uniqueIndex('postgres_tenant_name_idx').on(table.tenantId, table.name),
    index('postgres_status_idx').on(table.status),
  ],
);

// ── Managed MongoDB Instances ──

export const mongodbInstances = pgTable(
  'mongodb_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 10 }).notNull(),
    size: varchar('size', { length: 20 }).notNull(),
    status: managedServiceStatusEnum('status').notNull().default('provisioning'),
    replicaSetSize: smallint('replica_set_size').notNull().default(3),
    publicAccess: boolean('public_access').notNull().default(false),
    storageGb: integer('storage_gb').notNull(),
    connectionUri: varchar('connection_uri', { length: 1024 }),
    port: integer('port').notNull().default(27017),
    backupPolicy: jsonb('backup_policy')
      .$type<{
        enabled: boolean;
        scheduleCron?: string;
        retentionDays: number;
      }>()
      .notNull(),
    credentialsSecretRef: varchar('credentials_secret_ref', { length: 512 }),
    vpcId: uuid('vpc_id').references(() => vpcs.id, { onDelete: 'set null' }),
    tags: jsonb('tags').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('mongodb_tenant_id_idx').on(table.tenantId),
    uniqueIndex('mongodb_tenant_name_idx').on(table.tenantId, table.name),
    index('mongodb_status_idx').on(table.status),
  ],
);

// ── Managed Valkey Instances ──

export const valkeyInstances = pgTable(
  'valkey_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    version: varchar('version', { length: 10 }).notNull(),
    size: varchar('size', { length: 20 }).notNull(),
    status: managedServiceStatusEnum('status').notNull().default('provisioning'),
    mode: valkeyModeEnum('mode').notNull().default('standalone'),
    persistence: valkeyPersistenceEnum('persistence').notNull().default('rdb'),
    evictionPolicy: varchar('eviction_policy', { length: 32 }).notNull().default('noeviction'),
    clusterShards: smallint('cluster_shards').notNull().default(1),
    replicasPerShard: smallint('replicas_per_shard').notNull().default(0),
    memoryMb: integer('memory_mb').notNull(),
    passwordEnabled: boolean('password_enabled').notNull().default(true),
    publicAccess: boolean('public_access').notNull().default(false),
    connectionEndpoint: varchar('connection_endpoint', { length: 512 }),
    port: integer('port').notNull().default(6379),
    credentialsSecretRef: varchar('credentials_secret_ref', { length: 512 }),
    vpcId: uuid('vpc_id').references(() => vpcs.id, { onDelete: 'set null' }),
    tags: jsonb('tags').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('valkey_tenant_id_idx').on(table.tenantId),
    uniqueIndex('valkey_tenant_name_idx').on(table.tenantId, table.name),
    index('valkey_status_idx').on(table.status),
  ],
);

// ── Object Storage (MinIO) Buckets ──

export const buckets = pgTable(
  'buckets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    access: bucketAccessEnum('access').notNull().default('private'),
    versioning: bucketVersioningEnum('versioning').notNull().default('disabled'),
    quotaGb: integer('quota_gb'),
    usedBytes: numeric('used_bytes', { precision: 20, scale: 0 }).notNull().default('0'),
    objectCount: integer('object_count').notNull().default(0),
    lifecycleRules: jsonb('lifecycle_rules')
      .$type<
        Array<{
          id: string;
          enabled: boolean;
          prefix?: string;
          expirationDays?: number;
          transitionDays?: number;
          transitionStorageClass?: string;
        }>
      >()
      .notNull()
      .default([]),
    endpoint: varchar('endpoint', { length: 512 }),
    region: varchar('region', { length: 64 }).notNull().default('us-east-1'),
    status: managedServiceStatusEnum('status').notNull().default('provisioning'),
    tags: jsonb('tags').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('buckets_tenant_id_idx').on(table.tenantId),
    uniqueIndex('buckets_name_idx').on(table.name),
  ],
);

// ── Bucket Access Keys ──

export const bucketAccessKeys = pgTable(
  'bucket_access_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucketId: uuid('bucket_id')
      .notNull()
      .references(() => buckets.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    accessKey: varchar('access_key', { length: 128 }).notNull().unique(),
    secretKeyHash: text('secret_key_hash').notNull(),
    readOnly: boolean('read_only').notNull().default(false),
    prefixRestriction: varchar('prefix_restriction', { length: 512 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bucket_access_keys_bucket_id_idx').on(table.bucketId),
    index('bucket_access_keys_tenant_id_idx').on(table.tenantId),
    index('bucket_access_keys_access_key_idx').on(table.accessKey),
  ],
);

// ── Managed Service Backups ──

export const managedServiceBackups = pgTable(
  'managed_service_backups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceType: varchar('service_type', { length: 20 }).notNull(), // 'postgres' | 'mongodb' | 'valkey'
    instanceId: uuid('instance_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull().default('automated'), // 'automated' | 'manual' | 'pitr'
    sizeBytes: numeric('size_bytes', { precision: 20, scale: 0 }).notNull().default('0'),
    storageLocation: varchar('storage_location', { length: 1024 }),
    status: varchar('status', { length: 20 }).notNull().default('creating'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('backups_tenant_id_idx').on(table.tenantId),
    index('backups_instance_idx').on(table.serviceType, table.instanceId),
    index('backups_created_at_idx').on(table.createdAt),
  ],
);
