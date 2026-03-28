-- IAM: New enums
DO $$ BEGIN
  CREATE TYPE "invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "service_account_status" AS ENUM('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Extend audit_action enum with IAM actions
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'role_created';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'role_updated';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'role_deleted';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'user_invited';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'user_role_assigned';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'user_role_revoked';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'user_removed';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'service_account_created';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'service_account_deleted';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'permission_denied';

-- IAM Roles (custom roles per tenant)
CREATE TABLE IF NOT EXISTS "iam_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "description" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "built_in" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "iam_roles_tenant_name_idx" ON "iam_roles" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "iam_roles_tenant_id_idx" ON "iam_roles" USING btree ("tenant_id");

-- User ↔ IAM Role (many-to-many)
CREATE TABLE IF NOT EXISTS "user_iam_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "iam_role_id" uuid NOT NULL REFERENCES "iam_roles"("id") ON DELETE CASCADE,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_iam_roles_user_role_idx" ON "user_iam_roles" USING btree ("user_id", "iam_role_id");
CREATE INDEX IF NOT EXISTS "user_iam_roles_user_id_idx" ON "user_iam_roles" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_iam_roles_role_id_idx" ON "user_iam_roles" USING btree ("iam_role_id");

-- Service Accounts (machine identity per tenant)
CREATE TABLE IF NOT EXISTS "service_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "service_account_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_accounts_tenant_name_idx" ON "service_accounts" USING btree ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "service_accounts_tenant_id_idx" ON "service_accounts" USING btree ("tenant_id");

-- Service Account ↔ IAM Role (many-to-many)
CREATE TABLE IF NOT EXISTS "service_account_iam_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_account_id" uuid NOT NULL REFERENCES "service_accounts"("id") ON DELETE CASCADE,
  "iam_role_id" uuid NOT NULL REFERENCES "iam_roles"("id") ON DELETE CASCADE,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sa_iam_roles_sa_role_idx" ON "service_account_iam_roles" USING btree ("service_account_id", "iam_role_id");
CREATE INDEX IF NOT EXISTS "sa_iam_roles_sa_id_idx" ON "service_account_iam_roles" USING btree ("service_account_id");

-- User Invitations
CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "invited_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "iam_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "invitation_status" DEFAULT 'pending' NOT NULL,
  "token" varchar(255) NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_invitations_tenant_id_idx" ON "user_invitations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "user_invitations_email_idx" ON "user_invitations" USING btree ("email");
CREATE INDEX IF NOT EXISTS "user_invitations_token_idx" ON "user_invitations" USING btree ("token");
CREATE INDEX IF NOT EXISTS "user_invitations_expires_at_idx" ON "user_invitations" USING btree ("expires_at");
