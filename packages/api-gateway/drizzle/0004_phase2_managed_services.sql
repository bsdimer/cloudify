-- Phase 2: Managed Services (Postgres, MongoDB, Valkey, MinIO)

-- Enums
DO $$ BEGIN
  CREATE TYPE "managed_service_status" AS ENUM(
    'provisioning', 'active', 'updating', 'backing_up', 'restoring',
    'failing_over', 'deleting', 'deleted', 'error'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "valkey_mode" AS ENUM('standalone', 'cluster');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "valkey_persistence" AS ENUM('none', 'rdb', 'aof', 'rdb-aof');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "bucket_access" AS ENUM('private', 'public-read', 'public-read-write');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "bucket_versioning" AS ENUM('enabled', 'suspended', 'disabled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Managed PostgreSQL
CREATE TABLE IF NOT EXISTS "postgres_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "version" varchar(10) NOT NULL,
  "size" varchar(20) NOT NULL,
  "status" "managed_service_status" DEFAULT 'provisioning' NOT NULL,
  "read_replicas" smallint DEFAULT 0 NOT NULL,
  "high_availability" boolean DEFAULT false NOT NULL,
  "public_access" boolean DEFAULT false NOT NULL,
  "connection_pooling" boolean DEFAULT false NOT NULL,
  "storage_gb" integer NOT NULL,
  "connection_endpoint" varchar(512),
  "read_endpoint" varchar(512),
  "port" integer DEFAULT 5432 NOT NULL,
  "backup_policy" jsonb NOT NULL,
  "credentials_secret_ref" varchar(512),
  "vpc_id" uuid REFERENCES "vpcs"("id") ON DELETE SET NULL,
  "tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "postgres_tenant_id_idx" ON "postgres_instances" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "postgres_tenant_name_idx" ON "postgres_instances" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "postgres_status_idx" ON "postgres_instances" USING btree ("status");

-- Managed MongoDB
CREATE TABLE IF NOT EXISTS "mongodb_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "version" varchar(10) NOT NULL,
  "size" varchar(20) NOT NULL,
  "status" "managed_service_status" DEFAULT 'provisioning' NOT NULL,
  "replica_set_size" smallint DEFAULT 3 NOT NULL,
  "public_access" boolean DEFAULT false NOT NULL,
  "storage_gb" integer NOT NULL,
  "connection_uri" varchar(1024),
  "port" integer DEFAULT 27017 NOT NULL,
  "backup_policy" jsonb NOT NULL,
  "credentials_secret_ref" varchar(512),
  "vpc_id" uuid REFERENCES "vpcs"("id") ON DELETE SET NULL,
  "tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "mongodb_tenant_id_idx" ON "mongodb_instances" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mongodb_tenant_name_idx" ON "mongodb_instances" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "mongodb_status_idx" ON "mongodb_instances" USING btree ("status");

-- Managed Valkey
CREATE TABLE IF NOT EXISTS "valkey_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "version" varchar(10) NOT NULL,
  "size" varchar(20) NOT NULL,
  "status" "managed_service_status" DEFAULT 'provisioning' NOT NULL,
  "mode" "valkey_mode" DEFAULT 'standalone' NOT NULL,
  "persistence" "valkey_persistence" DEFAULT 'rdb' NOT NULL,
  "eviction_policy" varchar(32) DEFAULT 'noeviction' NOT NULL,
  "cluster_shards" smallint DEFAULT 1 NOT NULL,
  "replicas_per_shard" smallint DEFAULT 0 NOT NULL,
  "memory_mb" integer NOT NULL,
  "password_enabled" boolean DEFAULT true NOT NULL,
  "public_access" boolean DEFAULT false NOT NULL,
  "connection_endpoint" varchar(512),
  "port" integer DEFAULT 6379 NOT NULL,
  "credentials_secret_ref" varchar(512),
  "vpc_id" uuid REFERENCES "vpcs"("id") ON DELETE SET NULL,
  "tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "valkey_tenant_id_idx" ON "valkey_instances" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "valkey_tenant_name_idx" ON "valkey_instances" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "valkey_status_idx" ON "valkey_instances" USING btree ("status");

-- Object Storage (MinIO) Buckets
CREATE TABLE IF NOT EXISTS "buckets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "access" "bucket_access" DEFAULT 'private' NOT NULL,
  "versioning" "bucket_versioning" DEFAULT 'disabled' NOT NULL,
  "quota_gb" integer,
  "used_bytes" numeric(20, 0) DEFAULT '0' NOT NULL,
  "object_count" integer DEFAULT 0 NOT NULL,
  "lifecycle_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "endpoint" varchar(512),
  "region" varchar(64) DEFAULT 'us-east-1' NOT NULL,
  "status" "managed_service_status" DEFAULT 'provisioning' NOT NULL,
  "tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "buckets_tenant_id_idx" ON "buckets" USING btree ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "buckets_name_idx" ON "buckets" USING btree ("name");

-- Bucket Access Keys
CREATE TABLE IF NOT EXISTS "bucket_access_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket_id" uuid NOT NULL REFERENCES "buckets"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "access_key" varchar(128) NOT NULL UNIQUE,
  "secret_key_hash" text NOT NULL,
  "read_only" boolean DEFAULT false NOT NULL,
  "prefix_restriction" varchar(512),
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "bucket_access_keys_bucket_id_idx" ON "bucket_access_keys" USING btree ("bucket_id");
CREATE INDEX IF NOT EXISTS "bucket_access_keys_tenant_id_idx" ON "bucket_access_keys" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "bucket_access_keys_access_key_idx" ON "bucket_access_keys" USING btree ("access_key");

-- Managed Service Backups
CREATE TABLE IF NOT EXISTS "managed_service_backups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "service_type" varchar(20) NOT NULL,
  "instance_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "type" varchar(20) DEFAULT 'automated' NOT NULL,
  "size_bytes" numeric(20, 0) DEFAULT '0' NOT NULL,
  "storage_location" varchar(1024),
  "status" varchar(20) DEFAULT 'creating' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "backups_tenant_id_idx" ON "managed_service_backups" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "backups_instance_idx" ON "managed_service_backups" USING btree ("service_type", "instance_id");
CREATE INDEX IF NOT EXISTS "backups_created_at_idx" ON "managed_service_backups" USING btree ("created_at");
