-- Phase 1: Core Compute & Networking

-- New enums
DO $$ BEGIN
  CREATE TYPE "vpc_status" AS ENUM('active', 'provisioning', 'deleting', 'deleted', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ip_allocation_type" AS ENUM('floating', 'ephemeral', 'private');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ip_allocation_status" AS ENUM('available', 'allocated', 'assigned', 'released');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lb_status" AS ENUM('active', 'provisioning', 'updating', 'deleting', 'deleted', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "k8s_cluster_status" AS ENUM('provisioning', 'active', 'upgrading', 'scaling', 'deleting', 'deleted', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- VPCs
CREATE TABLE IF NOT EXISTS "vpcs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "cidr" varchar(43) NOT NULL,
  "status" "vpc_status" DEFAULT 'provisioning' NOT NULL,
  "router_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "vpcs_tenant_id_idx" ON "vpcs" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vpcs_tenant_name_idx" ON "vpcs" USING btree ("tenant_id", "name");

-- Subnets
CREATE TABLE IF NOT EXISTS "subnets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vpc_id" uuid NOT NULL REFERENCES "vpcs"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "cidr" varchar(43) NOT NULL,
  "gateway" varchar(45),
  "dns_servers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dhcp_enabled" boolean DEFAULT true NOT NULL,
  "switch_id" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "subnets_vpc_id_idx" ON "subnets" USING btree ("vpc_id");
CREATE INDEX IF NOT EXISTS "subnets_tenant_id_idx" ON "subnets" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subnets_vpc_name_idx" ON "subnets" USING btree ("vpc_id", "name");

-- Security Groups
CREATE TABLE IF NOT EXISTS "security_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vpc_id" uuid NOT NULL REFERENCES "vpcs"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "security_groups_tenant_id_idx" ON "security_groups" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "security_groups_vpc_id_idx" ON "security_groups" USING btree ("vpc_id");
CREATE UNIQUE INDEX IF NOT EXISTS "security_groups_vpc_name_idx" ON "security_groups" USING btree ("vpc_id", "name");

-- IP Pools
CREATE TABLE IF NOT EXISTS "ip_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL UNIQUE,
  "cidr" varchar(43) NOT NULL,
  "version" smallint NOT NULL,
  "gateway" varchar(45),
  "description" text,
  "total_ips" integer DEFAULT 0 NOT NULL,
  "allocated_ips" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ip_pools_name_idx" ON "ip_pools" USING btree ("name");

-- IP Allocations
CREATE TABLE IF NOT EXISTS "ip_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "pool_id" uuid NOT NULL REFERENCES "ip_pools"("id") ON DELETE CASCADE,
  "address" inet NOT NULL,
  "version" smallint NOT NULL,
  "type" "ip_allocation_type" NOT NULL,
  "status" "ip_allocation_status" DEFAULT 'allocated' NOT NULL,
  "resource_id" uuid REFERENCES "resources"("id") ON DELETE SET NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ip_allocations_tenant_id_idx" ON "ip_allocations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "ip_allocations_pool_id_idx" ON "ip_allocations" USING btree ("pool_id");
CREATE INDEX IF NOT EXISTS "ip_allocations_address_idx" ON "ip_allocations" USING btree ("address");
CREATE INDEX IF NOT EXISTS "ip_allocations_status_idx" ON "ip_allocations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "ip_allocations_resource_id_idx" ON "ip_allocations" USING btree ("resource_id");

-- Load Balancers
CREATE TABLE IF NOT EXISTS "load_balancers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "vpc_id" uuid NOT NULL REFERENCES "vpcs"("id") ON DELETE CASCADE,
  "status" "lb_status" DEFAULT 'provisioning' NOT NULL,
  "protocol" varchar(10) NOT NULL,
  "frontend_port" integer NOT NULL,
  "backend_port" integer NOT NULL,
  "algorithm" varchar(20) DEFAULT 'roundrobin' NOT NULL,
  "public_ip_id" uuid REFERENCES "ip_allocations"("id") ON DELETE SET NULL,
  "backends" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "health_check" jsonb DEFAULT null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "load_balancers_tenant_id_idx" ON "load_balancers" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "load_balancers_vpc_id_idx" ON "load_balancers" USING btree ("vpc_id");
CREATE UNIQUE INDEX IF NOT EXISTS "load_balancers_tenant_name_idx" ON "load_balancers" USING btree ("tenant_id", "name");

-- K8s Clusters
CREATE TABLE IF NOT EXISTS "k8s_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "version" varchar(20) NOT NULL,
  "status" "k8s_cluster_status" DEFAULT 'provisioning' NOT NULL,
  "control_plane_count" smallint DEFAULT 1 NOT NULL,
  "worker_count" smallint NOT NULL,
  "control_plane_spec" jsonb NOT NULL,
  "worker_spec" jsonb NOT NULL,
  "cni_plugin" varchar(20) DEFAULT 'cilium' NOT NULL,
  "pod_cidr" varchar(43) DEFAULT '10.244.0.0/16' NOT NULL,
  "service_cidr" varchar(43) DEFAULT '10.96.0.0/12' NOT NULL,
  "endpoint" varchar(512),
  "vpc_id" uuid REFERENCES "vpcs"("id") ON DELETE SET NULL,
  "node_vm_ids" jsonb DEFAULT '{"controlPlane":[],"workers":[]}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "k8s_clusters_tenant_id_idx" ON "k8s_clusters" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "k8s_clusters_tenant_name_idx" ON "k8s_clusters" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "k8s_clusters_status_idx" ON "k8s_clusters" USING btree ("status");
