# Cloudify — Implementation Progress

> Checklist tracker for the [Implementation Plan](PLAN.md).
> Update statuses as work progresses. Each item maps to a section in `PLAN.md`.

**Legend:**  `[ ]` Not started | `[~]` In progress | `[x]` Complete | `[-]` Skipped/Deferred

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

### 0.6 GitOps Service — Tenant Repo Bootstrapping

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

### 0.7 Event Bus (NATS JetStream)

- [x] NATS server deployment (dev docker-compose + production cluster)
- [x] JetStream configuration (streams, consumers, retention) — `@cloudify/nats` package
- [x] Standardized event envelope schema (event_id, type, tenant_id, correlation_id, payload)
- [x] Core event streams: `cloudify.resources.*`, `cloudify.tenants.*`, `cloudify.billing.*`, `cloudify.audit.*`
- [x] Dead letter queue configuration with retry policy
- [x] NestJS NATS transport integration for all services — via `@cloudify/nats` package
- [x] Event publishing helper (type-safe, auto-envelope) — `createPublisher()`
- [x] Event consumer helper (idempotent processing, error handling) — `consumeEvents()`

### 0.8 Hypervisor Abstraction Layer

- [x] `HypervisorProvider` interface definition (`packages/hypervisor/core`)
- [x] VM lifecycle methods (create, destroy, start, stop, resize, snapshot, restore, migrate)
- [x] Template/image management methods
- [x] Node pool and capacity query methods
- [x] PlacementStrategy interface (spread, pack, affinity)
- [x] StorageProvider abstraction
- [x] Proxmox implementation (`packages/hypervisor/proxmox`) — full Proxmox VE API client + provider
- [x] Provider factory (config-driven selection) — `createProvider()` in hypervisor-core

### 0.9 Common Package

- [x] Shared DTOs and interfaces (`packages/common`)
- [x] Error classes and error codes (`CloudifyError`, `ErrorCode`, specialized error classes)
- [x] Pagination helpers (`normalizePagination()`, `paginate()`)
- [x] Event schemas (typed event definitions for all streams)
- [x] Logger configuration (structured JSON with correlation ID) — `createLogger()`
- [x] Retry/backoff utilities (`retry()`, `RetryPresets`, `calculateBackoff()`)
- [x] Idempotency key utilities (`generateIdempotencyKey()`, `hashRequestBody()`)

---

## Phase 0 Summary

| Section | Status | Items | Done | Progress |
|---------|--------|-------|------|----------|
| 0.1 Developer Environment | ~Complete | 7 | 5 | 71% |
| 0.2 Control-Plane Database | Complete | 15 | 15 | 100% |
| 0.3 Authentication & Authorization | Complete | 9 | 9 | 100% |
| 0.4 API Gateway | Complete | 13 | 12 | 92% |
| 0.5 Tenant Lifecycle | Complete | 8 | 8 | 100% |
| 0.6 GitOps Service | Complete | 12 | 12 | 100% |
| 0.7 Event Bus | Complete | 8 | 8 | 100% |
| 0.8 Hypervisor Abstraction | Complete | 8 | 8 | 100% |
| 0.9 Common Package | Complete | 7 | 7 | 100% |
| **Phase 0 Total** | | **87** | **84** | **97%** |

Remaining Phase 0 items (non-blocking for Phase 1):
- Conventional Commits + semantic-release
- CONTRIBUTING.md

---

## Phase 1 — Core Compute & Networking (Weeks 7–18)

### 1.1 Proxmox Integration Layer (via Hypervisor Abstraction)

- [ ] Proxmox VE REST API client (TypeScript, fully typed)
- [ ] Authentication (API token / ticket)
- [ ] Create QEMU VM
- [ ] Start / stop / restart VM
- [ ] Destroy VM
- [ ] Clone VM from template
- [ ] Resize VM (CPU, RAM, disk)
- [ ] Snapshot VM
- [ ] Restore VM from snapshot
- [ ] Migrate VM between nodes
- [ ] Query node capacity and health
- [ ] LXC container support (optional)
- [ ] Node pool / cluster discovery
- [ ] Placement scheduler (capacity-based, affinity/anti-affinity)
- [ ] VM image catalog (Ubuntu, Debian, etc.)

### 1.2 Managed Kubernetes Service

- [ ] K8s cluster resource definition (API schema)
- [ ] Control plane VM provisioning (1 or 3 for HA)
- [ ] Worker node VM provisioning (N nodes)
- [ ] Cloud-init / Ansible bootstrap scripts (kubeadm)
- [ ] CNI installation (Cilium)
- [ ] CSI driver setup (Proxmox storage)
- [ ] Kubeconfig generation + storage in secrets service
- [ ] Cluster health probe registration
- [ ] Scale nodes (add/remove workers)
- [ ] Upgrade K8s version (rolling upgrade)
- [ ] Delete cluster (full teardown)
- [ ] Multi-version K8s support (version catalog)
- [ ] Node pool concept (different sizes in one cluster)
- [ ] OpenTofu module: `k8s-cluster`

### 1.3 Software-Defined Networking (SDN)

- [ ] OVN/Proxmox SDN integration research & PoC
- [ ] Tenant VPC creation (logical container)
- [ ] Subnet creation (mapped to OVN logical switch)
- [ ] Logical router per tenant
- [ ] Inter-tenant traffic blocked by default
- [ ] NAT gateway per tenant (outbound internet)
- [ ] Security Groups (L3/L4 OVN ACLs) — see also Firewall section below
- [ ] Floating IP (DNAT on logical router)
- [ ] Network peering (cross-tenant, explicit opt-in)
- [ ] Default Cilium network policies for managed K8s clusters
- [ ] OpenTofu module: `sdn-network`

### 1.4 IP Address Management (IPAM)

- [ ] IP pool database schema
- [ ] Pool → subnet → allocation tracking
- [ ] `POST /api/v1/ips/allocate`
- [ ] `POST /api/v1/ips/release`
- [ ] `POST /api/v1/ips/assign` (floating IP → resource)
- [ ] IPv4 support
- [ ] IPv6 prefix delegation support
- [ ] Floating IP lifecycle
- [ ] Ephemeral IP lifecycle

### 1.5 Load Balancers — External (ISP Edge)

- [ ] Keepalived setup (VRRP, virtual IP failover)
- [ ] HAProxy configuration generation
- [ ] HAProxy config push (Data Plane API or file + reload)
- [ ] Real client IP preservation (PROXY protocol)
- [ ] L4 load balancing
- [ ] L7 load balancing (HTTP/HTTPS)
- [ ] Health checks for backends
- [ ] Multi-node HA (Keepalived across LB nodes)
- [ ] Coraza WAF SPOE integration on HAProxy (see Firewall section)
- [ ] CrowdSec agent + bouncer on LB nodes (see Firewall section)

### 1.6 Load Balancers — Per-Tenant (Inside K8s)

- [ ] MetalLB or kube-vip deployment in tenant clusters
- [ ] IP allocation from tenant's public sub-pool
- [ ] Integration with external HAProxy for ingress routing
- [ ] OpenTofu module: `lb-service`

---

*Update this file as tasks are completed. Use `[~]` for in-progress items and `[x]` for done.*
