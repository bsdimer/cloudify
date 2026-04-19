# Cloudify — Implementation Progress

> Checklist tracker for the [Implementation Plan](PLAN.md).
> Update statuses as work progresses. Each item maps to a section in `PLAN.md`.

**Legend:** `[ ]` Not started | `[~]` In progress | `[x]` Complete | `[-]` Skipped/Deferred

**Last updated:** 2026-03-28

---

## Phase 0 — Foundations (Weeks 1–6)

### 0.1 Developer Environment

- [x] Initialize Nx monorepo (NestJS + React)
- [x] Configure TypeScript strict mode across all packages
- [x] Configure ESLint + Prettier (shared config)
- [x] Set up GitHub Actions CI pipeline (lint, test, build, Docker push)
- [ ] Conventional Commits + semantic-release
- [x] Create `docker-compose.dev.yml` (Postgres, Valkey, Gitea, Vault, NATS)
- [ ] Write contributing guide (`CONTRIBUTING.md`)

### 0.2 Control-Plane Database

- [x] Design and finalize schema (ERD)
- [x] Tenant entity + migrations
- [x] User entity + migrations
- [x] ApiKey entity + migrations
- [x] Resource entity (generic, JSONB spec, desired/actual state hashes) + migrations
- [x] ResourceTag entity + migrations
- [x] IdempotencyKey entity + migrations
- [x] WebhookEndpoint entity + migrations
- [x] WebhookDelivery entity + migrations
- [x] AuditLog entity (with correlation_id) + migrations
- [x] BillingAccount entity + migrations
- [x] UsageRecord entity + migrations
- [x] Quota entity + migrations
- [x] Seed data (default plans, admin user)
- [x] RevokedTokens entity + migrations (for logout/token revocation)

### 0.3 Authentication & Authorization

- [x] JWT auth module (access + refresh tokens)
- [x] Password hashing (argon2/bcrypt)
- [x] RBAC guard (Owner / Admin / Member / Viewer / SuperAdmin)
- [x] API key authentication strategy (passport-custom)
- [x] Admin super-role (ISP operator) auth domain
- [x] Auth middleware integration with API gateway
- [x] Token refresh endpoint (with token rotation)
- [x] Logout / token revocation (revoked_tokens table + JTI tracking)
- [x] Tenant isolation guard

### 0.4 API Gateway

- [x] NestJS API gateway scaffold (`packages/api-gateway`)
- [x] Versioned routing (`/api/v1/...`)
- [x] Request validation (class-validator or Zod)
- [x] Rate limiting middleware (token bucket via Redis)
- [x] Request/response audit logging (AuditLogInterceptor)
- [x] OpenAPI / Swagger auto-generation
- [-] Auto-generate API client SDKs (TS, Python, Go) via openapi-generator in CI — deferred to Phase 3+
- [x] Idempotency-Key header middleware (store + replay cached responses)
- [x] Request correlation ID (propagated through all services)
- [x] Circuit breaker per downstream service (custom implementation)
- [x] WebSocket gateway for real-time events (Socket.IO)
- [x] CORS and security headers
- [x] Global exception filter (consistent error responses with CloudifyError)

### 0.5 Tenant Lifecycle

- [x] `POST /api/v1/tenants` — create tenant
- [x] `GET /api/v1/tenants` — list tenants (admin)
- [x] `GET /api/v1/tenants/:id` — get tenant details
- [x] `PATCH /api/v1/tenants/:id` — update tenant
- [x] `DELETE /api/v1/tenants/:id` — decommission tenant
- [x] Tenant suspension / reactivation
- [x] Default quota assignment on creation
- [x] Tenant slug uniqueness validation

### 0.6 Tenant IAM (Identity & Access Management)

- [x] Permission model design (`resource:action` convention)
- [x] IAM permission constants and enums (`packages/common`)
- [x] `iam_roles` table (custom roles per tenant with JSONB permissions)
- [x] `user_iam_roles` junction table (user ↔ role many-to-many)
- [x] `service_accounts` table (machine identity per tenant)
- [x] `service_account_iam_roles` junction table
- [x] `user_invitations` table (invite flow with token + expiry)
- [x] Built-in role definitions (tenant-admin, developer, billing-admin, read-only)
- [x] IAM audit action enums (role_created, role_updated, user_invited, etc.)
- [x] IAM event types for NATS stream
- [x] IAM permission guard (evaluate user roles → permissions on each request)
- [x] `POST /api/v1/iam/roles` — create custom role
- [x] `GET /api/v1/iam/roles` — list roles for tenant
- [x] `PATCH /api/v1/iam/roles/:id` — update role permissions
- [x] `DELETE /api/v1/iam/roles/:id` — delete custom role (not built-in)
- [x] `POST /api/v1/iam/users/invite` — invite user to tenant
- [x] `GET /api/v1/iam/users` — list tenant users with roles
- [x] `PATCH /api/v1/iam/users/:id/roles` — assign/revoke roles
- [x] `DELETE /api/v1/iam/users/:id` — remove user from tenant
- [x] `POST /api/v1/iam/service-accounts` — create service account
- [x] `GET /api/v1/iam/service-accounts` — list service accounts
- [x] `POST /api/v1/iam/service-accounts/:id/keys` — issue API key for service account
- [x] `DELETE /api/v1/iam/service-accounts/:id` — delete service account
- [x] Seed built-in roles on tenant creation
- [x] JWT `permissions` claim (cached permission set in token)

### 0.7 GitOps Service — Tenant Repo Bootstrapping

- [x] Gitea/Forgejo API client (`packages/services/gitops`)
- [x] Tenant repo creation on tenant provisioning
- [x] Tenant template repo (`infra/tenant-template/`)
  - [x] `main.tf` skeleton
  - [x] `variables.tf` skeleton
  - [x] `backend.tf` skeleton
  - [x] `provider.tf` skeleton
  - [x] `outputs.tf` skeleton
- [x] Commit + push to tenant repo on resource changes
- [x] OpenTofu runner: plan
- [x] OpenTofu runner: apply (auto-approve for standard ops)
- [x] OpenTofu runner: plan output storage and logging
- [x] Repo archival on tenant deletion

### 0.8 Event Bus (NATS JetStream)

- [x] NATS server deployment (dev docker-compose + production cluster)
- [x] JetStream configuration (streams, consumers, retention) — `@cloudify/nats` package
- [x] Standardized event envelope schema (event_id, type, tenant_id, correlation_id, payload)
- [x] Core event streams: `cloudify.resources.*`, `cloudify.tenants.*`, `cloudify.billing.*`, `cloudify.audit.*`
- [x] Dead letter queue configuration with retry policy
- [x] NestJS NATS transport integration for all services — via `@cloudify/nats` package
- [x] Event publishing helper (type-safe, auto-envelope) — `createPublisher()`
- [x] Event consumer helper (idempotent processing, error handling) — `consumeEvents()`

### 0.9 Hypervisor Abstraction Layer

- [x] `HypervisorProvider` interface definition (`packages/hypervisor/core`)
- [x] VM lifecycle methods (create, destroy, start, stop, resize, snapshot, restore, migrate)
- [x] Template/image management methods
- [x] Node pool and capacity query methods
- [x] PlacementStrategy interface (spread, pack, affinity)
- [x] StorageProvider abstraction
- [x] Proxmox implementation (`packages/hypervisor/proxmox`) — full Proxmox VE API client + provider
- [x] Provider factory (config-driven selection) — `createProvider()` in hypervisor-core

### 0.10 Common Package

- [x] Shared DTOs and interfaces (`packages/common`)
- [x] Error classes and error codes (`CloudifyError`, `ErrorCode`, specialized error classes)
- [x] Pagination helpers (`normalizePagination()`, `paginate()`)
- [x] Event schemas (typed event definitions for all streams)
- [x] Logger configuration (structured JSON with correlation ID) — `createLogger()`
- [x] Retry/backoff utilities (`retry()`, `RetryPresets`, `calculateBackoff()`)
- [x] Idempotency key utilities (`generateIdempotencyKey()`, `hashRequestBody()`)

---

## Phase 0 Summary

| Section                            | Status    | Items   | Done    | Progress |
| ---------------------------------- | --------- | ------- | ------- | -------- |
| 0.1 Developer Environment          | ~Complete | 7       | 5       | 71%      |
| 0.2 Control-Plane Database         | Complete  | 15      | 15      | 100%     |
| 0.3 Authentication & Authorization | Complete  | 9       | 9       | 100%     |
| 0.4 API Gateway                    | Complete  | 13      | 12      | 92%      |
| 0.5 Tenant Lifecycle               | Complete  | 8       | 8       | 100%     |
| 0.6 Tenant IAM                     | Complete  | 24      | 24      | 100%     |
| 0.7 GitOps Service                 | Complete  | 12      | 12      | 100%     |
| 0.8 Event Bus                      | Complete  | 8       | 8       | 100%     |
| 0.9 Hypervisor Abstraction         | Complete  | 8       | 8       | 100%     |
| 0.10 Common Package                | Complete  | 7       | 7       | 100%     |
| **Phase 0 Total**                  |           | **111** | **108** | **97%**  |

Remaining Phase 0 items (non-blocking for Phase 1):

- Conventional Commits + semantic-release
- CONTRIBUTING.md

---

## Phase 1 — Core Compute & Networking (Weeks 7–18)

### 1.1 Proxmox Integration Layer (via Hypervisor Abstraction)

- [x] Proxmox VE REST API client (TypeScript, fully typed) — completed in Phase 0
- [x] Authentication (API token / ticket) — completed in Phase 0
- [x] Create QEMU VM — completed in Phase 0
- [x] Start / stop / restart VM — completed in Phase 0
- [x] Destroy VM — completed in Phase 0
- [x] Clone VM from template — completed in Phase 0
- [x] Resize VM (CPU, RAM, disk) — completed in Phase 0
- [x] Snapshot VM — completed in Phase 0
- [x] Restore VM from snapshot — completed in Phase 0
- [x] Migrate VM between nodes — completed in Phase 0
- [x] Query node capacity and health — completed in Phase 0
- [-] LXC container support (optional) — deferred
- [x] Node pool / cluster discovery — completed in Phase 0
- [x] Placement scheduler (capacity-based, affinity/anti-affinity) — completed in Phase 0
- [x] VM image catalog (Ubuntu, Debian, etc.) — `DEFAULT_VM_IMAGES` in common package

### 1.2 Compute Service (VM Orchestration)

- [x] VM resource CRUD via REST API (`POST/GET/PATCH/DELETE /compute/vms`)
- [x] VM actions endpoint (start/stop/restart) — `POST /compute/vms/:id/action`
- [x] VM resize endpoint — `PATCH /compute/vms/:id/resize`
- [x] VM snapshot create/restore endpoints
- [x] Quota enforcement on VM creation
- [x] Audit logging for all VM operations
- [x] IAM permission integration (`compute:create`, `compute:read`, etc.)

### 1.3 Managed Kubernetes Service

- [x] K8s cluster resource definition (API schema + DB table)
- [x] `k8s_clusters` database table with full cluster metadata
- [x] K8s version catalog (`SUPPORTED_K8S_VERSIONS`)
- [x] Create cluster endpoint — `POST /kubernetes/clusters`
- [x] List/get cluster endpoints
- [x] Scale nodes (add/remove workers) — `PATCH /kubernetes/clusters/:id/scale`
- [x] Upgrade K8s version — `PATCH /kubernetes/clusters/:id/upgrade`
- [x] Delete cluster — `DELETE /kubernetes/clusters/:id`
- [x] Quota enforcement and audit logging
- [ ] Control plane VM provisioning (1 or 3 for HA) — async via event bus
- [ ] Worker node VM provisioning (N nodes) — async via event bus
- [ ] Cloud-init / Ansible bootstrap scripts (kubeadm)
- [ ] CNI installation (Cilium)
- [ ] CSI driver setup (Proxmox storage)
- [ ] Kubeconfig generation + storage in secrets service
- [ ] Cluster health probe registration
- [ ] Multi-version K8s support (tested images per version)
- [ ] Node pool concept (different sizes in one cluster)
- [ ] OpenTofu module: `k8s-cluster`

### 1.4 Software-Defined Networking (SDN)

- [x] VPC database schema + CRUD API (`POST/GET/DELETE /networking/vpcs`)
- [x] Subnet database schema + CRUD API (`POST/GET/DELETE /networking/subnets`)
- [x] Security Groups with rule management (`POST/GET/PATCH/DELETE /networking/security-groups`)
- [x] CIDR validation and subnet-within-VPC validation
- [x] IAM permission integration (`network:create`, `network:read`, etc.)
- [x] Audit logging for all networking operations
- [ ] OVN/Proxmox SDN integration (logical router/switch creation)
- [ ] NAT gateway per tenant (outbound internet)
- [ ] Floating IP (DNAT on logical router)
- [ ] Network peering (cross-tenant, explicit opt-in)
- [ ] Default Cilium network policies for managed K8s clusters
- [ ] OpenTofu module: `sdn-network`

### 1.5 IP Address Management (IPAM)

- [x] IP pool database schema + admin CRUD API
- [x] IP allocation tracking (pool → tenant → resource)
- [x] `POST /ips/allocate` — allocate IP from pool
- [x] `POST /ips/release/:id` — release allocated IP
- [x] `POST /ips/assign/:id` — assign floating IP to resource
- [x] IPv4 support with CIDR-based allocation
- [x] Floating IP lifecycle (allocate → assign → release)
- [x] Ephemeral IP lifecycle
- [ ] IPv6 prefix delegation support

### 1.6 Load Balancers — External (ISP Edge)

- [x] Load balancer database schema + CRUD API (`POST/GET/PATCH/DELETE /load-balancers`)
- [x] HAProxy configuration generation (`generateHaproxyConfig()`)
- [x] L4 load balancing (TCP mode)
- [x] L7 load balancing (HTTP/HTTPS mode)
- [x] Health checks for backends (TCP and HTTP)
- [x] Backend management (add/remove/update backends)
- [x] Load balancing algorithms (roundrobin, leastconn, source)
- [x] IAM permission integration and audit logging
- [ ] Keepalived setup (VRRP, virtual IP failover)
- [ ] HAProxy config push (Data Plane API or file + reload)
- [ ] Real client IP preservation (PROXY protocol)
- [ ] Multi-node HA (Keepalived across LB nodes)
- [ ] Coraza WAF SPOE integration on HAProxy
- [ ] CrowdSec agent + bouncer on LB nodes

### 1.7 Load Balancers — Per-Tenant (Inside K8s)

- [ ] MetalLB or kube-vip deployment in tenant clusters
- [ ] IP allocation from tenant's public sub-pool
- [ ] Integration with external HAProxy for ingress routing
- [ ] OpenTofu module: `lb-service`

---

## Phase 1 Summary

| Section                 | Status      | Items  | Done   | Progress |
| ----------------------- | ----------- | ------ | ------ | -------- |
| 1.1 Proxmox Integration | Complete    | 15     | 14     | 93%      |
| 1.2 Compute Service     | Complete    | 7      | 7      | 100%     |
| 1.3 Managed Kubernetes  | In Progress | 19     | 9      | 47%      |
| 1.4 SDN/Networking      | In Progress | 12     | 6      | 50%      |
| 1.5 IPAM                | ~Complete   | 9      | 8      | 89%      |
| 1.6 LB — External       | In Progress | 14     | 8      | 57%      |
| 1.7 LB — Per-Tenant     | Not Started | 4      | 0      | 0%       |
| **Phase 1 Total**       |             | **80** | **52** | **65%**  |

Remaining Phase 1 items (require infrastructure — Proxmox, OVN, K8s clusters):

- K8s cluster VM provisioning + kubeadm bootstrap (async workers)
- OVN integration for SDN (logical routers, switches, NAT)
- HAProxy Data Plane API push and Keepalived setup
- IPv6 prefix delegation
- MetalLB/kube-vip deployment

---

## Phase 2 — Managed Services (Weeks 19–28)

### 2.1 Managed PostgreSQL

- [x] Postgres instance database schema (`postgres_instances` table)
- [x] Version catalog (`SUPPORTED_POSTGRES_VERSIONS`: 16, 15, 14, 13)
- [x] Instance size catalog (`INSTANCE_SIZES`: nano → xxlarge)
- [x] Create/list/get instance endpoints (`POST/GET /databases/postgres`)
- [x] Scale instance (size, read replicas, storage) — `PATCH /databases/postgres/:id/scale`
- [x] Backup policy configuration (schedule, retention, PITR)
- [x] Manual backup creation — `POST /databases/postgres/:id/backups`
- [x] List backups — `GET /databases/postgres/:id/backups`
- [x] Restore from backup — `POST /databases/postgres/:id/restore`
- [x] Delete instance — `DELETE /databases/postgres/:id`
- [x] IAM integration (`database:*` permissions)
- [x] Audit logging for all operations
- [x] Read replica configuration (0–5)
- [x] High availability flag
- [x] Connection pooling (PgBouncer) flag
- [x] VPC attachment (private network)
- [ ] CloudNativePG operator integration (async worker)
- [ ] Kubeconfig/credentials stored in secrets service
- [ ] WAL-G backup to MinIO/S3 integration
- [ ] Prometheus monitoring integration
- [ ] Patroni failover configuration

### 2.2 Managed MongoDB

- [x] MongoDB instance database schema (`mongodb_instances` table)
- [x] Version catalog (`SUPPORTED_MONGODB_VERSIONS`: 7.0, 6.0, 5.0)
- [x] Replica set size validation (1, 3, 5)
- [x] Create/list/get/delete endpoints
- [x] Backup creation and listing (`managed_service_backups` unified table)
- [x] Backup policy configuration
- [x] IAM integration and audit logging
- [x] VPC attachment
- [ ] MongoDB Community Operator integration (async worker)
- [ ] mongodump → MinIO backup pipeline
- [ ] MongoDB Exporter → Prometheus integration

### 2.3 Managed Valkey (Redis-Compatible)

- [x] Valkey instance database schema (`valkey_instances` table)
- [x] Version catalog (`SUPPORTED_VALKEY_VERSIONS`: 8.0, 7.2)
- [x] Mode: standalone / cluster
- [x] Persistence: none / rdb / aof / rdb-aof
- [x] 8 eviction policies supported
- [x] Cluster shards and replica configuration
- [x] Create/list/get/delete endpoints
- [x] Update config endpoint (eviction policy, persistence)
- [x] Password auth enable/disable flag
- [x] VPC attachment
- [x] IAM integration and audit logging
- [ ] Valkey operator/Helm deployment (async worker)
- [ ] Persistent volume provisioning on K8s
- [ ] Redis Exporter → Prometheus integration
- [ ] LXC container mode for small instances

### 2.4 Object Storage (MinIO)

- [x] Bucket database schema (`buckets` table, globally unique names)
- [x] S3-compatible bucket name validation (RFC 1123)
- [x] Access levels: private / public-read / public-read-write
- [x] Versioning: enabled / suspended / disabled
- [x] Lifecycle rules with expiration and transition
- [x] Quota per-bucket configuration
- [x] CRUD endpoints (`POST/GET/PATCH/DELETE /object-storage/buckets`)
- [x] Update bucket access/versioning/lifecycle endpoints
- [x] Access keys (S3 credentials) — create/list/delete
- [x] Access key scoping (read-only, prefix restriction, expiry)
- [x] Presigned URL generation (GET/PUT/DELETE, 1m–7d expiry)
- [x] IAM integration (`storage:*` permissions)
- [x] Audit logging for bucket and key operations
- [ ] MinIO cluster provisioning (operator or direct)
- [ ] Tenant isolation via MinIO policies
- [ ] Ceph/direct-attached storage backend integration
- [ ] Per-tenant endpoint routing (`https://<tenant>.storage.cloudify.example.com`)

### 2.5 Services Kubernetes Cluster

- [ ] Services K8s cluster bootstrap (separate from tenant clusters)
- [ ] Operator installation (CloudNativePG, MongoDB, Valkey)
- [ ] Namespace-per-tenant provisioning
- [ ] NetworkPolicy for tenant SDN isolation
- [ ] ResourceQuota per tenant
- [ ] PVC provisioning from storage backend
- [ ] Operator → tenant resource mapping

---

## Phase 2 Summary

| Section                  | Status      | Items  | Done   | Progress |
| ------------------------ | ----------- | ------ | ------ | -------- |
| 2.1 Managed PostgreSQL   | Mostly Done | 21     | 16     | 76%      |
| 2.2 Managed MongoDB      | In Progress | 11     | 8      | 73%      |
| 2.3 Managed Valkey       | Mostly Done | 15     | 11     | 73%      |
| 2.4 Object Storage       | Mostly Done | 20     | 16     | 80%      |
| 2.5 Services K8s Cluster | Not Started | 7      | 0      | 0%       |
| **Phase 2 Total**        |             | **74** | **51** | **69%**  |

Remaining Phase 2 items require live infrastructure (K8s services cluster, operators,
MinIO cluster, Ceph storage) and will be completed by async workers consuming NATS
events from the API gateway provisioning endpoints.

---

_Update this file as tasks are completed. Use `[~]` for in-progress items and `[x]` for done._
