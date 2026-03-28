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

### 0.3 Authentication & Authorization

- [x] JWT auth module (access + refresh tokens)
- [x] Password hashing (argon2/bcrypt)
- [x] RBAC guard (Owner / Admin / Member / Viewer)
- [x] API key authentication strategy
- [ ] Admin super-role (ISP operator) auth domain
- [x] Auth middleware integration with API gateway
- [x] Token refresh endpoint
- [ ] Logout / token revocation

### 0.4 API Gateway

- [x] NestJS API gateway scaffold (`packages/api-gateway`)
- [x] Versioned routing (`/api/v1/...`)
- [x] Request validation (class-validator or Zod)
- [x] Rate limiting middleware (token bucket via Redis)
- [ ] Request/response audit logging
- [x] OpenAPI / Swagger auto-generation
- [ ] Auto-generate API client SDKs (TS, Python, Go) via openapi-generator in CI
- [x] Idempotency-Key header middleware (store + replay cached responses)
- [x] Request correlation ID (propagated through all services)
- [ ] Circuit breaker per downstream service (opossum)
- [ ] WebSocket gateway for real-time events
- [x] CORS and security headers

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

- [ ] Gitea/Forgejo API client
- [ ] Tenant repo creation on tenant provisioning
- [ ] Tenant template repo (`infra/tenant-template/`)
  - [ ] `main.tf` skeleton
  - [ ] `variables.tf` skeleton
  - [ ] `backend.tf` skeleton
  - [ ] `provider.tf` skeleton
  - [ ] `outputs.tf` skeleton
- [ ] Commit + push to tenant repo on resource changes
- [ ] OpenTofu runner: plan
- [ ] OpenTofu runner: apply (auto-approve for standard ops)
- [ ] OpenTofu runner: plan output storage and logging
- [ ] Repo archival on tenant deletion

### 0.7 Event Bus (NATS JetStream)

- [x] NATS server deployment (dev docker-compose + production cluster)
- [ ] JetStream configuration (streams, consumers, retention)
- [x] Standardized event envelope schema (event_id, type, tenant_id, correlation_id, payload)
- [x] Core event streams: `cloudify.resources.*`, `cloudify.tenants.*`, `cloudify.billing.*`, `cloudify.audit.*`
- [ ] Dead letter queue configuration with retry policy
- [ ] NestJS NATS transport integration for all services
- [ ] Event publishing helper (type-safe, auto-envelope)
- [ ] Event consumer helper (idempotent processing, error handling)

### 0.8 Hypervisor Abstraction Layer

- [x] `HypervisorProvider` interface definition (`packages/hypervisor/core`)
- [x] VM lifecycle methods (create, destroy, start, stop, resize, snapshot, restore, migrate)
- [x] Template/image management methods
- [x] Node pool and capacity query methods
- [x] PlacementStrategy interface (spread, pack, affinity)
- [x] StorageProvider abstraction
- [ ] Proxmox implementation (`packages/hypervisor/proxmox`)
- [ ] Provider factory (config-driven selection)

### 0.9 Common Package

- [x] Shared DTOs and interfaces (`packages/common`)
- [ ] Error classes and error codes
- [ ] Pagination helpers
- [x] Event schemas (typed event definitions for all streams)
- [ ] Logger configuration (structured JSON with correlation ID)
- [ ] Retry/backoff utilities
- [ ] Idempotency key utilities

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

## Phase 2 — Managed Services (Weeks 12–22)

### 2.1 Services Kubernetes Cluster

- [ ] Deploy services K8s cluster (control-plane managed)
- [ ] Namespace-per-tenant isolation
- [ ] NetworkPolicy templates
- [ ] ResourceQuota per tenant namespace
- [ ] PVC provisioning on Proxmox storage

### 2.2 Managed PostgreSQL

- [ ] CloudNativePG or Zalando operator deployment
- [ ] Instance creation API (`POST /api/v1/databases/postgres`)
- [ ] Instance sizes (vCPU, RAM, storage)
- [ ] Automated backups (WAL-G → MinIO)
- [ ] Point-in-time recovery (PITR)
- [ ] Read replicas
- [ ] Connection pooling (PgBouncer sidecar)
- [ ] Monitoring (pg_stat_statements → Prometheus)
- [ ] Automatic failover
- [ ] Credentials generated → secrets service
- [ ] Private SDN IP assignment
- [ ] Optional public endpoint via LB
- [ ] Instance lifecycle (start, stop, resize, delete)
- [ ] OpenTofu module: `postgres-instance`

### 2.3 Managed MongoDB

- [ ] MongoDB Community Operator deployment
- [ ] Instance creation API (`POST /api/v1/databases/mongo`)
- [ ] Replica sets (3-node default)
- [ ] Automated backups (mongodump → MinIO)
- [ ] Monitoring (MongoDB Exporter → Prometheus)
- [ ] Connection string management
- [ ] Private SDN IP + optional public endpoint
- [ ] Instance lifecycle (start, stop, resize, delete)
- [ ] OpenTofu module: `mongo-instance`

### 2.4 Managed Valkey (Redis-Compatible)

- [ ] Valkey operator or Helm deployment
- [ ] Instance creation API (`POST /api/v1/databases/valkey`)
- [ ] Standalone mode
- [ ] Cluster mode
- [ ] Persistence (RDB/AOF)
- [ ] Memory limits and eviction policies
- [ ] Monitoring (Redis Exporter → Prometheus)
- [ ] Instance lifecycle (start, stop, resize, delete)
- [ ] OpenTofu module: `valkey-instance`

### 2.5 Object Storage (MinIO)

- [ ] MinIO cluster deployment (shared multi-tenant)
- [ ] Bucket creation API (`POST /api/v1/storage/buckets`)
- [ ] Tenant isolation (MinIO policies + separate buckets)
- [ ] S3-compatible API endpoint per tenant
- [ ] Access policies (per-bucket, per-key)
- [ ] Lifecycle rules (expiration, transition)
- [ ] Versioning
- [ ] Pre-signed URLs
- [ ] Quota enforcement per tenant
- [ ] OpenTofu module: `minio-bucket`

---

## Phase 3 — Platform Services (Weeks 18–28)

### 3.1 DNS Service

- [ ] PowerDNS deployment (authoritative, Postgres backend)
- [ ] Zone creation API (`POST /api/v1/dns/zones`)
- [ ] Record management API (`POST /api/v1/dns/records`)
- [ ] Supported record types: A, AAAA, CNAME, MX, TXT, SRV, NS
- [ ] Automatic record creation on resource provisioning
- [ ] Custom domain delegation (tenant NS records)
- [ ] DNSSEC support
- [ ] Integration with certificate service (DNS-01 challenges)
- [ ] OpenTofu module: `dns-zone`

### 3.2 SSL/TLS Certificate Management

- [ ] Certificate service scaffold (`packages/services/certificates`)
- [ ] ACME v2 client integration (node-acme-client or Lego)
- [ ] Let's Encrypt account registration
- [ ] DNS-01 challenge solver (auto TXT record via PowerDNS)
- [ ] HTTP-01 challenge solver (via LB/ingress)
- [ ] Manual validation flow (external DNS)
- [ ] Certificate issuance and storage in Vault
- [ ] Wildcard certificate support (`*.domain.com`)
- [ ] Multi-SAN certificate support
- [ ] Automatic renewal (30 days before expiry, background job)
- [ ] Renewal failure alerting (email/webhook)
- [ ] Certificate distribution → HAProxy (edge LBs)
- [ ] Certificate distribution → tenant K8s (cert-manager / External Secrets)
- [ ] Certificate distribution → managed Postgres (SSL)
- [ ] Certificate distribution → MinIO (HTTPS)
- [ ] Certificate distribution → Harbor (registry)
- [ ] Let's Encrypt rate limit tracking and batching
- [ ] Fallback CAs (ZeroSSL, BuyPass)
- [ ] Custom CA upload for internal PKI
- [ ] Control-plane internal PKI (Vault PKI engine or step-ca)
- [ ] `POST /api/v1/certificates`
- [ ] `GET /api/v1/certificates`
- [ ] `GET /api/v1/certificates/:id`
- [ ] `DELETE /api/v1/certificates/:id`
- [ ] `POST /api/v1/certificates/:id/renew`
- [ ] OpenTofu module: `certificate`

### 3.3 Secret Manager

- [ ] Vault or OpenBao deployment
- [ ] Per-tenant secret engine (KV v2)
- [ ] `POST /api/v1/secrets` — create secret
- [ ] `GET /api/v1/secrets` — list secrets
- [ ] `GET /api/v1/secrets/:name` — get secret (with versioning)
- [ ] `PUT /api/v1/secrets/:name` — update secret
- [ ] `DELETE /api/v1/secrets/:name` — delete secret
- [ ] Dynamic secrets (DB credentials)
- [ ] Secret rotation policies
- [ ] Audit logging of all secret access
- [ ] External Secrets Operator on tenant K8s clusters
- [ ] Sync config: which secrets → which K8s namespaces
- [ ] Auto-storage of managed DB passwords, API keys, TLS certs

### 3.4 Artifact Registry

- [ ] Harbor deployment
- [ ] Tenant-scoped project creation
- [ ] Docker image push/pull
- [ ] Vulnerability scanning (Trivy)
- [ ] Image signing (Cosign/Notary)
- [ ] Retention policies (tag expiry, untagged cleanup)
- [ ] Pull-through cache (Docker Hub, ghcr.io)
- [ ] Helm chart repository support
- [ ] npm registry (Verdaccio or OCI)
- [ ] NuGet registry
- [ ] Maven registry
- [ ] Quota enforcement (storage per tenant)
- [ ] Auth integration (OIDC from API gateway → Harbor)

---

## Phase 4 — Web UI & Self-Service Portal (Weeks 6–20, parallel)

### 4.1 Project Setup & Design System

- [ ] React + Vite + TypeScript project (`packages/web-portal`)
- [ ] React + Vite + TypeScript project (`packages/web-admin`)
- [ ] Tailwind CSS configuration
- [ ] Shared component library (Shadcn/ui base)
- [ ] Design tokens (colors, typography, spacing)
- [ ] Dark mode support
- [ ] Responsive layout shell
- [ ] TanStack Query setup
- [ ] Zustand store scaffolding
- [ ] React Router route structure
- [ ] Auth flow (login, register, token management)

### 4.2 Tenant Portal — Dashboard

- [ ] Resource summary cards
- [ ] Cost overview widget (current month)
- [ ] Health status overview
- [ ] Recent activity feed (audit log)

### 4.3 Tenant Portal — Compute (Kubernetes)

- [ ] Cluster list page with health indicators
- [ ] Create cluster wizard (version, node pool, networking)
- [ ] Cluster detail page (nodes, scale, upgrade)
- [ ] Kubeconfig download
- [ ] Kubectl web terminal (WebSocket, optional)

### 4.4 Tenant Portal — Databases

- [ ] Instance list (Postgres, Mongo, Valkey) with status
- [ ] Create instance form (engine, version, size, backup schedule)
- [ ] Instance detail (connection info, metrics)
- [ ] Backup management (list, trigger, restore)

### 4.5 Tenant Portal — Storage

- [ ] Bucket list with usage bars
- [ ] Create bucket + configure policies
- [ ] File browser (list, upload, download, pre-signed URL)
- [ ] Lifecycle rule editor

### 4.6 Tenant Portal — Networking

- [ ] SDN overview (subnets, routing, peering)
- [ ] Firewall rules editor (security groups)
- [ ] IP address management (allocate, release, assign)
- [ ] Load balancer management (create, configure, health checks)
- [ ] DNS zone editor (visual record management)

### 4.7 Tenant Portal — SSL/TLS Certificates

- [ ] Certificate list with status badges
- [ ] Request certificate wizard (domains, validation method)
- [ ] Certificate detail (domains, issuer, expiry, renewal history)
- [ ] Validation progress (real-time ACME challenge status)
- [ ] Renewal log
- [ ] Attach certificate to resource (LB, ingress, service)
- [ ] Expiry alerts configuration
- [ ] Custom CA upload

### 4.8 Tenant Portal — Secrets

- [ ] Secret list with version history
- [ ] Create / update / delete secrets
- [ ] K8s sync configuration

### 4.9 Tenant Portal — Registry

- [ ] Repository list, image tags, vulnerability badges
- [ ] Push instructions / token generation
- [ ] Retention policy configuration

### 4.10 Tenant Portal — Settings

- [ ] Team management (invite, roles)
- [ ] API keys (create, revoke, scopes)
- [ ] Billing (plan, usage, invoices, payment method)
- [ ] Quota dashboard (usage vs limits)
- [ ] Notifications (email, webhook, Slack)

### 4.11 ISP Admin Dashboard

- [ ] Tenant management (list, create, suspend, delete, adjust quotas)
- [ ] Infrastructure view (Proxmox nodes, capacity, VM placement)
- [ ] Resource overview (all services across all tenants)
- [ ] Billing admin (invoices, payments, plan management)
- [ ] Network admin (IP pools, BGP, SDN topology)
- [ ] Certificate admin (ACME accounts, rate limits, CA config, failed renewals)
- [ ] System health (service status, logs, alerts)
- [ ] Audit trail (cross-tenant log search)
- [ ] Plugin management (install, configure, enable/disable)

### 4.12 Shared UI Patterns

- [ ] Resource creation wizard pattern
- [ ] Resource detail page pattern (Status, Spec, Metrics, Logs, Events, Actions)
- [ ] Destructive action confirmation dialog
- [ ] Real-time updates via WebSocket
- [ ] Breadcrumb navigation
- [ ] Global search (`Cmd+K` launcher)

---

## Phase 5 — Billing, Quotas & Metering (Weeks 20–28)

### 5.1 Metering

- [ ] Billing service scaffold (`packages/services/billing`)
- [ ] Usage event bus consumer
- [ ] Compute metering (vCPU-hours, RAM-GB-hours)
- [ ] Storage metering (GB-hours, I/O ops)
- [ ] Database metering (instance-hours, storage, backup storage)
- [ ] Network metering (egress GB, LB hours, public IP hours)
- [ ] Certificate metering (managed cert count)
- [ ] Registry metering (storage GB, bandwidth)
- [ ] Hourly rollup aggregation
- [ ] Daily / monthly aggregation

### 5.2 Pricing Engine

- [ ] Plans: Starter, Pro, Enterprise (with included quotas)
- [ ] Pay-as-you-go pricing (per-resource-hour)
- [ ] Price list DB schema (versioned, admin-editable)
- [ ] Discount rules + promotional credits
- [ ] Currency configuration (per ISP deployment)
- [ ] Reserved capacity pricing (optional)

### 5.3 Quotas & Limits

- [ ] Per-tenant quota definitions by resource type
- [ ] Quota enforcement at API layer
- [ ] Soft limits (warning) vs hard limits (rejection)
- [ ] Admin quota override per tenant
- [ ] Quota usage tracking (real-time)

### 5.4 Invoicing

- [ ] Monthly invoice generation (PDF + structured data)
- [ ] Line items: resource type, quantity, unit price, total
- [ ] Credits and adjustments
- [ ] Invoice history and download API
- [ ] Payment integration (Stripe)
- [ ] Bank transfer support
- [ ] Dunning: overdue notifications → suspension → retention → deletion

---

## Phase 6 — Plugin & Extension System (Weeks 24–32)

### 6.1 Plugin Architecture

- [ ] Plugin host service (`packages/orchestrator` or standalone)
- [ ] Plugin container runtime (Docker-based)
- [ ] Plugin manifest schema (`cloudify-plugin.yaml`)
- [ ] Plugin installation flow (admin pulls image → register)

### 6.2 Plugin SDK

- [ ] `@cloudify/plugin-sdk` npm package scaffold
- [ ] Resource definition API
- [ ] Lifecycle hooks (`onCreate`, `onUpdate`, `onDelete`, `onHealthCheck`)
- [ ] API route registration
- [ ] UI component slot system (React)
- [ ] OpenTofu module registration
- [ ] Billing metric emission
- [ ] Event bus subscription
- [ ] SDK documentation + example plugin

### 6.3 Plugin Distribution

- [ ] Plugin image publishing workflow
- [ ] Plugin manifest validation
- [ ] Plugin marketplace UI (admin dashboard)
- [ ] Plugin enable / disable / uninstall

---

## Phase 7 — Installation & Day-2 Operations (Weeks 28–34)

### 7.1 Day-1 Installation (Docker Compose)

- [ ] `install.sh` script
  - [ ] Prerequisite validation (Docker, Compose, resources)
  - [ ] Interactive configuration prompts
  - [ ] `.env` and config file generation
  - [ ] Docker image pull from ghcr.io
  - [ ] `docker-compose up -d`
  - [ ] DB migration and seed data
  - [ ] Gitea initialization
  - [ ] Vault initialization and unseal
  - [ ] Summary output (URLs, credentials, next steps)
- [ ] Production `docker-compose.yml`
- [ ] All service Dockerfiles (`infra/docker/`)

### 7.2 Day-2 Installation (Helm)

- [ ] Helm chart for full control-plane deployment
- [ ] Values file matching Docker Compose config
- [ ] Horizontal scaling for stateless services
- [ ] HA for stateful services (Postgres, Redis, etcd)
- [ ] Migration guide: Docker Compose → Helm

### 7.3 Operational Tooling

- [ ] Health check endpoints (`/health`, `/ready`) on every service
- [ ] Structured JSON logging (all services)
- [ ] Prometheus metrics exposition (all services)
- [ ] Pre-built Grafana dashboards
- [ ] Pre-configured alerting rules
- [ ] Automated control-plane backups (DB, Vault, Gitea, MinIO)
- [ ] Rolling upgrade procedure documentation
- [ ] `cloudify-admin` CLI tool

---

## Phase 8 — Hardening & Production Readiness (Weeks 30–38)

### 8.1 Security

- [ ] TLS everywhere (CP ↔ DP, inter-service, DB)
- [ ] Secrets encryption at rest
- [ ] Network policies on control-plane K8s
- [ ] Input validation and sanitization audit
- [ ] SQL injection prevention audit
- [ ] Rate limiting and DDoS protection (LB layer)
- [ ] Penetration testing
- [ ] Dependency scanning (Dependabot, Snyk, Trivy)
- [ ] Signed Docker images
- [ ] Audit log tamper-proofing (append-only, hashed chain)

### 8.2 Performance

- [ ] Load test: 100+ tenants, concurrent operations
- [ ] API p95 < 200ms (CRUD), < 5s (provisioning initiation)
- [ ] DB query optimization (indexes, connection pooling)
- [ ] Caching strategy (Redis) for hot data
- [ ] Async processing for long-running operations
- [ ] OpenTofu execution pooling

### 8.3 Documentation

- [ ] Architecture decision records (ADRs)
- [ ] API reference (auto-generated from OpenAPI)
- [ ] User guide: getting started + per-service tutorials
- [ ] Admin guide: installation, configuration, troubleshooting
- [ ] Plugin development guide + example walkthrough
- [ ] Contributing guide (code style, PR process, release)

---

## Cross-Cutting: Reconciliation Engine (Phase 1+)

- [ ] Reconciler service scaffold (`packages/services/reconciler`)
- [ ] Reconciliation loop framework (fetch desired, fetch actual, compare, decide)
- [ ] K8s cluster reconciler
- [ ] Postgres instance reconciler
- [ ] MongoDB instance reconciler
- [ ] Valkey instance reconciler
- [ ] MinIO bucket reconciler
- [ ] Network/SDN reconciler
- [ ] Certificate reconciler
- [ ] Reconciliation policies (auto-heal, alert-only, ignore) per resource
- [ ] Configurable reconciliation interval (default 5 min, jitter)
- [ ] Drift detection events (`resource.drift_detected`) published to NATS
- [ ] Drift dashboard in admin UI

## Cross-Cutting: Webhook & Event Notifications (Phase 3+)

- [ ] Webhook service scaffold (`packages/services/webhooks`)
- [ ] `POST /api/v1/webhooks` — register endpoint
- [ ] `GET /api/v1/webhooks` — list endpoints
- [ ] `PATCH /api/v1/webhooks/:id` — update endpoint
- [ ] `DELETE /api/v1/webhooks/:id` — remove endpoint
- [ ] `GET /api/v1/webhooks/:id/deliveries` — delivery log
- [ ] `POST /api/v1/webhooks/:id/test` — send test event
- [ ] NATS consumer for subscribable events
- [ ] Payload signing (HMAC-SHA256 via webhook secret)
- [ ] Delivery with exponential backoff (10s, 30s, 2min, 10min, 1hr)
- [ ] Max 5 retry attempts, then mark endpoint unhealthy
- [ ] Delivery history retention (30 days)
- [ ] Webhook management UI in tenant portal

## Cross-Cutting: Resource Tagging (Phase 0+)

- [ ] Tag CRUD on all resource endpoints (create, update, delete tags)
- [ ] Filter resources by tag (`GET /api/v1/resources?tag.key=value`)
- [ ] Bulk tag operations (`POST /api/v1/tags/bulk`)
- [ ] Max 50 tags per resource validation
- [ ] System-reserved prefix (`cloudify:`) enforcement
- [ ] Tag-based billing reports (cost allocation)
- [ ] Tag UI in tenant portal (on all resource pages)

## Cross-Cutting: Backup-as-a-Service (Phase 2+)

- [ ] Backup service scaffold (`packages/services/backup`)
- [ ] `POST /api/v1/backups` — trigger on-demand backup
- [ ] `GET /api/v1/backups` — list backups (filterable)
- [ ] `POST /api/v1/backups/:id/restore` — restore from backup
- [ ] `GET /api/v1/backup-policies` — list schedules
- [ ] `PUT /api/v1/backup-policies/:resource_id` — set schedule + retention
- [ ] K8s cluster backup (Velero integration)
- [ ] PostgreSQL backup (WAL-G continuous archiving)
- [ ] MongoDB backup (mongodump)
- [ ] Valkey backup (RDB snapshots)
- [ ] MinIO backup (cross-bucket replication)
- [ ] DNS zone backup (zone file export to Git)
- [ ] Secret backup (Vault snapshot)
- [ ] Configurable retention policies (daily/weekly/monthly)
- [ ] Backup status in tenant portal

## Cross-Cutting: Control-Plane Disaster Recovery (Phase 7+)

- [ ] Automated CP Postgres backup (WAL archiving + hourly base backup)
- [ ] Automated Vault snapshot (every 6 hours)
- [ ] Automated Gitea backup (Git bundles + DB dump, daily)
- [ ] Automated NATS JetStream snapshots (daily)
- [ ] `install.sh --restore` recovery mode
- [ ] Recovery runbook documentation
- [ ] Quarterly DR drill procedure
- [ ] RTO < 2 hours validation test

## Cross-Cutting: Observability-as-a-Service (Phase 2+)

- [ ] Observability service scaffold (`packages/services/observability`)
- [ ] Mimir or Thanos deployment (long-term Prometheus storage, multi-tenant)
- [ ] Loki deployment (multi-tenant log aggregation)
- [ ] Grafana deployment (multi-tenant, org-per-tenant)
- [ ] Per-tenant Prometheus agent on K8s clusters
- [ ] Per-tenant Promtail/Alloy log shipper
- [ ] Pre-built Grafana dashboards per resource type
- [ ] Auto-provision Grafana org + datasources on tenant creation
- [ ] SSO from portal → Grafana (OAuth/proxy auth)
- [ ] Grafana dashboard embedding in tenant portal
- [ ] Tenant-configurable alert rules
- [ ] Alert notification channels (email, webhook, Slack)
- [ ] Retention configurable per plan

## Cross-Cutting: Tenant-Facing Terraform Provider (Phase 3+)

- [ ] `terraform-provider-cloudify` project scaffold (Go)
- [ ] Provider configuration (endpoint, API key)
- [ ] `cloudify_kubernetes_cluster` resource
- [ ] `cloudify_kubernetes_node_pool` resource
- [ ] `cloudify_postgres_instance` resource
- [ ] `cloudify_mongo_instance` resource
- [ ] `cloudify_valkey_instance` resource
- [ ] `cloudify_storage_bucket` resource
- [ ] `cloudify_network` resource
- [ ] `cloudify_subnet` resource
- [ ] `cloudify_security_group` + `_rule` resources
- [ ] `cloudify_floating_ip` resource
- [ ] `cloudify_load_balancer` resource
- [ ] `cloudify_dns_zone` + `_record` resources
- [ ] `cloudify_certificate` resource
- [ ] `cloudify_secret` resource
- [ ] `cloudify_registry_project` resource
- [ ] Data sources (kubernetes_versions, regions, plans)
- [ ] Publish to Terraform Registry
- [ ] Provider documentation + examples

## Cross-Cutting: API Client SDKs (Phase 3+)

- [ ] openapi-generator CI pipeline (triggered on API spec change)
- [ ] TypeScript SDK (`@cloudify/sdk`) — generate, test, publish to npm
- [ ] Python SDK (`cloudify-sdk`) — generate, test, publish to PyPI
- [ ] Go SDK (`cloudify-go-sdk`) — generate, test, publish to Go modules
- [ ] SDK usage examples in documentation

## Cross-Cutting: Firewall, WAF & DDoS Protection (Phase 1+)

### Edge WAF (Coraza)

- [ ] Coraza deployment on LB nodes (HAProxy SPOE integration)
- [ ] OWASP CRS 4.x rule set installation and configuration
- [ ] Per-tenant WAF policy model (mode, paranoia level, rule groups)
- [ ] Custom WAF rule engine (URI/header/body pattern matching)
- [ ] Per-rule exception support (disable specific CRS rules per tenant)
- [ ] IP whitelist per WAF policy
- [ ] Per-endpoint rate limiting via WAF
- [ ] WAF config generation from Firewall Service → HAProxy SPOE reload
- [ ] WAF event logging → tenant observability stack
- [ ] Configurable block response (status code, error page)

### Edge DDoS Protection (CrowdSec)

- [ ] CrowdSec agent deployment on all LB nodes
- [ ] HAProxy bouncer plugin integration
- [ ] CrowdSec Central API enrollment (community threat intel)
- [ ] Per-tenant DDoS profile model (rate limits, geo, bots, IP reputation)
- [ ] Global rate limiting (per-tenant, per-IP, per-endpoint)
- [ ] Geo-blocking (allowlist/blocklist by country)
- [ ] Bot protection (JS challenge, known-bot allow)
- [ ] Custom IP blocklist/allowlist per tenant
- [ ] CrowdSec Local API query for per-tenant threat reports

### L3/L4 Firewall (OVN Security Groups)

- [ ] Firewall service scaffold (`packages/services/firewall`)
- [ ] Security Group CRUD API (`POST/GET/PUT/DELETE /api/v1/firewall/security-groups`)
- [ ] Security Group rule model (direction, protocol, port, CIDR, priority, action)
- [ ] Attach/detach security groups to resources API
- [ ] Stateful rules (OVN conntrack integration)
- [ ] Default SG: deny all inbound, allow all outbound
- [ ] SG-to-SG references (group-based rules)
- [ ] Pre-built rule templates (web-server, database, ssh-restricted, internal-only)
- [ ] OVN ACL translation: SG rules → OVN logical switch port ACLs
- [ ] OpenTofu module: `firewall-policy`

### L7 WAF API & Management

- [ ] WAF policy CRUD API (`POST/GET/PUT/DELETE /api/v1/firewall/waf-policies`)
- [ ] DDoS profile CRUD API (`POST/GET/PUT/DELETE /api/v1/firewall/ddos-profiles`)
- [ ] Unified firewall events API (`GET /api/v1/firewall/events`)
- [ ] Threat summary API (`GET /api/v1/firewall/threats`)
- [ ] Firewall events → NATS (`cloudify.firewall.*`)
- [ ] OpenTofu module: `waf-policy`
- [ ] `cloudify_security_group` Terraform resource
- [ ] `cloudify_waf_policy` Terraform resource
- [ ] `cloudify_ddos_profile` Terraform resource

### Firewall & WAF UI (Tenant Portal)

- [ ] L3/L4 firewall rules editor (security groups, drag-and-drop priority)
- [ ] Pre-built rule template selector
- [ ] WAF policy management page (enable/disable rule groups, mode toggle)
- [ ] Custom WAF rules editor
- [ ] WAF event log viewer (blocked requests, reason, source IP, timestamp)
- [ ] DDoS protection settings page (rate limits, geo-blocking, bot protection)
- [ ] IP reputation management (whitelist/blacklist)
- [ ] Real-time attack dashboard (request rates, block rates, top attackers)

### Firewall & WAF UI (Admin Dashboard)

- [ ] Global WAF rules management
- [ ] CrowdSec console integration
- [ ] Platform-wide threat dashboard
- [ ] IP reputation feed management

---

## CLI Tool (Parallel Track)

- [ ] CLI scaffold (`packages/cli`)
- [ ] Auth (login, token management, API key)
- [ ] Tenant commands (`cloudify tenant list/create/delete`)
- [ ] Compute commands (`cloudify k8s create/list/scale/delete`)
- [ ] Database commands (`cloudify db create/list/delete`)
- [ ] Storage commands (`cloudify storage bucket create/list/delete`)
- [ ] Network commands (`cloudify network/ip/lb/dns`)
- [ ] Firewall commands (`cloudify firewall sg/waf/ddos create/list/update/delete`)
- [ ] Certificate commands (`cloudify cert request/list/renew/delete`)
- [ ] Secret commands (`cloudify secret create/list/get/delete`)
- [ ] Registry commands (`cloudify registry project create/list`)
- [ ] Output formats (table, JSON, YAML)

---

## Summary

| Phase | Status | Items | Done | Progress |
|-------|--------|-------|------|----------|
| Phase 0 — Foundations | In progress | 76 | 47 | 62% |
| Phase 1 — Compute & Networking | Not started | 55 | 0 | 0% |
| Phase 2 — Managed Services | Not started | 44 | 0 | 0% |
| Phase 3 — Platform Services | Not started | 52 | 0 | 0% |
| Phase 4 — Web UI | Not started | 53 | 0 | 0% |
| Phase 5 — Billing & Quotas | Not started | 24 | 0 | 0% |
| Phase 6 — Plugin System | Not started | 16 | 0 | 0% |
| Phase 7 — Installation & Ops | Not started | 20 | 0 | 0% |
| Phase 8 — Hardening & GA | Not started | 22 | 0 | 0% |
| Reconciliation Engine | Not started | 13 | 0 | 0% |
| Webhooks & Notifications | Not started | 13 | 0 | 0% |
| Resource Tagging | Not started | 7 | 0 | 0% |
| Firewall, WAF & DDoS | Not started | 53 | 0 | 0% |
| Backup-as-a-Service | Not started | 15 | 0 | 0% |
| Control-Plane DR | Not started | 8 | 0 | 0% |
| Observability-as-a-Service | Not started | 14 | 0 | 0% |
| Tenant Terraform Provider | Not started | 21 | 0 | 0% |
| API Client SDKs | Not started | 5 | 0 | 0% |
| CLI Tool | Not started | 13 | 0 | 0% |
| **Total** | | **524** | **47** | **9%** |

---

*Update this file as tasks are completed. Use `[~]` for in-progress items and `[x]` for done.*
