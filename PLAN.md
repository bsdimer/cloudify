# Cloudify — Implementation Plan

> An open-source, extensible cloud platform for small ISPs and hosting providers.
> Turn existing Proxmox (and later VMware) infrastructure into a full-featured,
> multi-tenant cloud with managed services, SDN, billing, and self-service.

---

## Table of Contents

1. [Vision & Principles](#1-vision--principles)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Repository & Project Structure](#3-repository--project-structure)
4. [Phase 0 — Foundations](#4-phase-0--foundations)
5. [Phase 1 — Core Compute & Networking](#5-phase-1--core-compute--networking)
6. [Phase 2 — Managed Services](#6-phase-2--managed-services)
7. [Phase 3 — Platform Services](#7-phase-3--platform-services)
8. [Phase 4 — Web UI & Self-Service Portal](#8-phase-4--web-ui--self-service-portal)
9. [Phase 5 — Billing, Quotas & Metering](#9-phase-5--billing-quotas--metering)
10. [Phase 6 — Plugin & Extension System](#10-phase-6--plugin--extension-system)
11. [Phase 7 — Installation & Day-2 Operations](#11-phase-7--installation--day-2-operations)
12. [Phase 8 — Hardening & Production Readiness](#12-phase-8--hardening--production-readiness)
13. [Infrastructure as Code — Tenant GitOps Model](#13-infrastructure-as-code--tenant-gitops-model)
14. [Software-Defined Networking (SDN)](#14-software-defined-networking-sdn)
15. [Event-Driven Architecture & Service Communication](#15-event-driven-architecture--service-communication)
16. [Hypervisor Abstraction Layer](#16-hypervisor-abstraction-layer)
17. [Reconciliation Engine & Self-Healing](#17-reconciliation-engine--self-healing)
18. [Tenant-Facing Terraform Provider & API SDKs](#18-tenant-facing-terraform-provider--api-sdks)
19. [Webhook & Event Notification System](#19-webhook--event-notification-system)
20. [Resource Tagging & Labeling](#20-resource-tagging--labeling)
21. [Backup-as-a-Service & Disaster Recovery](#21-backup-as-a-service--disaster-recovery)
22. [Observability-as-a-Service](#22-observability-as-a-service)
23. [API Resilience Patterns](#23-api-resilience-patterns)
24. [Firewall, WAF & DDoS Protection](#24-firewall-waf--ddos-protection)
25. [Technology Stack Summary](#25-technology-stack-summary)
26. [Risk Register](#26-risk-register)
27. [Open Questions & Future Work](#27-open-questions--future-work)

---

## 1. Vision & Principles

### Vision

Cloudify enables any ISP or hosting provider with bare-metal or Proxmox infrastructure
to offer AWS/GCP-grade managed services (Kubernetes, Postgres, MongoDB, object storage,
Valkey, DNS, load balancers, artifact registries, secrets management) through a
self-service portal — without building a cloud from scratch.

### Guiding Principles

- **Separation of control and data planes.** The orchestration infrastructure (control
  plane) runs on dedicated machines, fully isolated from tenant workloads.
- **Tenant isolation by default.** Every tenant's resources live inside a private SDN
  realm. No cross-tenant traffic unless explicitly peered.
- **Infrastructure as Code first.** Every tenant's desired state is an OpenTofu
  configuration stored in a per-tenant Git repository, enabling auditable rollback.
- **Event-driven by design.** Every state mutation emits a domain event. Services
  communicate asynchronously via an event bus. Synchronous calls are the exception.
- **Reconciliation over orchestration.** Desired state is declared; a control loop
  continuously reconciles actual state to match — surviving crashes, drift, and
  partial failures.
- **Extensibility over monolith.** Every managed service is a plugin. Third parties can
  contribute new service types without forking the core.
- **Idempotency everywhere.** Every API operation and every internal handler must be
  safely retryable. Network failures, timeouts, and duplicates are the norm.
- **Simple installation.** Day-1 setup is a single bash script that pulls a
  `docker-compose` stack. Day-2 graduates to Helm on a dedicated management K8s cluster.
- **Open source (Apache-2.0 or similar).** Community-driven, vendor-neutral.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / BGP EDGE                         │
│                                                                    │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│   │  LB Node 1   │ │  LB Node 2   │ │  LB Node N   │ ← VRRP     │
│   │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │             │
│   │ │ HAProxy  │ │ │ │ HAProxy  │ │ │ │ HAProxy  │ │             │
│   │ │ + Coraza │ │ │ │ + Coraza │ │ │ │ + Coraza │ │ ← WAF      │
│   │ │ + CrowdSec│ │ │ + CrowdSec│ │ │ + CrowdSec│ │ ← DDoS     │
│   │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │             │
│   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
│          └────────────┬────┘───────────────┘                      │
└───────────────────┼────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │   CONTROL PLANE       │  ← Dedicated machines (Docker → K8s)
        │                       │
        │  ┌─────────────────┐  │
        │  │  API Gateway    │  │  (NestJS, rate-limit, auth)
        │  └────────┬────────┘  │
        │           │           │
        │  ┌────────┴────────┐  │
        │  │ Orchestrator    │  │  (NestJS microservices)
        │  │ ┌─────────────┐ │  │
        │  │ │ Tenant Mgr  │ │  │  — CRUD tenants, quotas, RBAC
        │  │ │ Compute Svc  │ │  │  — VM/K8s lifecycle via Proxmox API
        │  │ │ Network Svc  │ │  │  — SDN, LB, DNS, IP allocation
        │  │ │ Firewall Svc │ │  │  — L3/L4 rules, WAF, DDoS, CrowdSec
        │  │ │ Storage Svc  │ │  │  — MinIO, block volumes
        │  │ │ DB Svc       │ │  │  — Postgres, Mongo, Valkey operators
        │  │ │ Certs Svc    │ │  │  — SSL/TLS issuance, ACME, renewal
        │  │ │ Secrets Svc  │ │  │  — Vault / sealed-secrets bridge
        │  │ │ Registry Svc │ │  │  — Artifact registry (Harbor)
        │  │ │ Billing Svc  │ │  │  — Metering, invoices, payments
        │  │ │ GitOps Svc   │ │  │  — Per-tenant repo sync, OpenTofu
        │  │ │ Reconciler   │ │  │  — Drift detection, self-healing
        │  │ │ Webhook Svc  │ │  │  — Tenant event notifications
        │  │ │ Backup Svc   │ │  │  — Unified backup & restore
        │  │ │ Observ. Svc  │ │  │  — Per-tenant monitoring stacks
        │  │ │ Plugin Host  │ │  │  — Extension runtime
        │  │ └─────────────┘ │  │
        │  └────────┬────────┘  │
        │           │           │
        │  ┌────────┴────────┐  │
        │  │ Event Bus       │  │  (NATS JetStream)
        │  └────────┬────────┘  │
        │           │           │
        │  ┌────────┴────────┐  │
        │  │ State Stores    │  │
        │  │  Postgres (CP)  │  │  — Orchestrator DB
        │  │  Redis / Valkey │  │  — Job queues, caching
        │  │  Gitea / Forgejo│  │  — Per-tenant IaC repos
        │  │  Vault          │  │  — Control-plane secrets
        │  └─────────────────┘  │
        └───────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        │   DATA PLANE          │  ← Proxmox cluster(s)
        │                       │
        │  ┌─ Tenant A ───────┐ │
        │  │  Private SDN     │ │
        │  │  K8s cluster     │ │
        │  │  Postgres (mgd)  │ │
        │  │  MinIO bucket    │ │
        │  │  Valkey instance │ │
        │  └──────────────────┘ │
        │                       │
        │  ┌─ Tenant B ───────┐ │
        │  │  Private SDN     │ │
        │  │  K8s cluster     │ │
        │  │  MongoDB (mgd)   │ │
        │  └──────────────────┘ │
        │         ...           │
        └───────────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Control plane on **separate machines** | Tenant workload failures or resource spikes cannot degrade the management layer. |
| **NestJS** backend (TypeScript) | Strong typing, decorator-based DI, built-in microservice transports (NATS, Redis, gRPC), large ecosystem. |
| **React** frontend | Mature component ecosystem, strong community, good fit for complex dashboards. |
| **OpenTofu** for tenant IaC | Open-source Terraform fork; declarative, plan/apply model, provider ecosystem. |
| **Per-tenant Git repo** (Gitea/Forgejo) | Auditable history, easy rollback via `git revert`, GitOps-friendly. |
| **Proxmox first**, VMware later | Proxmox is free, API-rich, KVM-based. VMware adds enterprise compat. |
| **Hypervisor abstraction from day one** | Provider interface decouples services from Proxmox specifics; VMware becomes a second implementation, not a rewrite. |
| **NATS JetStream** for event bus | Lightweight, at-least-once delivery, persistent streams, built for cloud-native. Already proven in CNCF ecosystem. Resolves the "NATS vs Redis Streams" open question decisively. |
| **Reconciliation loops** over fire-and-forget | Every resource type has a controller that periodically compares desired vs actual state and self-heals. Inspired by Kubernetes controller pattern. |
| **OVN** for SDN | Production-grade, supports overlays (Geneve/VXLAN), distributed routing, ACLs, native integration with KVM/Proxmox. |
| **Keepalived + HAProxy** for LB | Battle-tested HA with VRRP, real IP preservation, L4/L7 capable. |
| **Idempotency keys** on all mutating APIs | Clients can safely retry any operation. Critical for unreliable networks and async workflows. |

---

## 3. Repository & Project Structure

Monorepo with clear package boundaries (Nx or Turborepo for orchestration):

```
cloudify/
├── PLAN.md                          ← This document
├── README.md
├── LICENSE
├── docker-compose.yml               ← Dev / Day-1 installer stack
├── install.sh                       ← One-liner installer script
│
├── packages/
│   ├── api-gateway/                 ← NestJS — public API, auth, rate-limit
│   ├── orchestrator/                ← NestJS — core orchestration microservice
│   ├── services/
│   │   ├── compute/                 ← NestJS — VM & K8s lifecycle
│   │   ├── network/                 ← NestJS — SDN, LB, DNS, IP mgmt
│   │   ├── firewall/                ← NestJS — L3/L4 firewall, WAF rules, DDoS
│   │   ├── storage/                 ← NestJS — MinIO, block volumes
│   │   ├── database/                ← NestJS — Postgres, Mongo, Valkey operators
│   │   ├── certificates/             ← NestJS — SSL/TLS issuance & renewal (ACME)
│   │   ├── secrets/                 ← NestJS — Vault / K8s secrets bridge
│   │   ├── registry/                ← NestJS — Artifact registry management
│   │   ├── billing/                 ← NestJS — Metering, invoices, payments
│   │   ├── gitops/                  ← NestJS — Tenant repo sync, OpenTofu runner
│   │   ├── reconciler/              ← NestJS — Drift detection, self-healing loops
│   │   ├── webhooks/                ← NestJS — Tenant event notifications
│   │   ├── backup/                  ← NestJS — Unified backup & restore
│   │   └── observability/           ← NestJS — Per-tenant monitoring stacks
│   │
│   ├── hypervisor/                  ← Hypervisor abstraction layer (interface + impls)
│   │   ├── core/                    ← Abstract interfaces (HypervisorProvider)
│   │   ├── proxmox/                 ← Proxmox VE implementation
│   │   └── vmware/                  ← VMware vSphere implementation (future)
│   │
│   ├── plugin-sdk/                  ← TypeScript SDK for extension authors
│   ├── common/                      ← Shared types, DTOs, utils, event schemas
│   │
│   ├── web-portal/                  ← React — Tenant self-service UI
│   ├── web-admin/                   ← React — ISP admin dashboard
│   │
│   ├── cli/                         ← CLI tool (like gcloud / aws cli)
│   └── sdk/                         ← Auto-generated API client SDKs (TS, Python, Go)
│
├── providers/
│   └── terraform-provider-cloudify/ ← Tenant-facing OpenTofu/Terraform provider
│
├── infra/
│   ├── docker/                      ← Dockerfiles for every service
│   ├── helm/                        ← Helm charts (Phase 2+ of deployment)
│   ├── terraform-modules/           ← Reusable OpenTofu modules
│   │   ├── k8s-cluster/
│   │   ├── postgres-instance/
│   │   ├── mongo-instance/
│   │   ├── minio-bucket/
│   │   ├── valkey-instance/
│   │   ├── sdn-network/
│   │   ├── lb-service/
│   │   ├── dns-zone/
│   │   ├── certificate/
│   │   ├── firewall-policy/
│   │   └── waf-policy/
│   └── tenant-template/             ← Skeleton repo for new tenants
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── user-guide/
│   └── plugin-development/
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## 4. Phase 0 — Foundations

**Goal:** Bootable control plane, authentication, tenant model, and developer toolchain.

**Duration estimate:** 4–6 weeks

### 4.1 Developer Environment

- [ ] Initialize monorepo (Nx recommended for NestJS + React)
- [ ] Configure TypeScript, ESLint, Prettier across all packages
- [ ] Set up CI pipeline (GitHub Actions): lint, test, build, Docker image push
- [ ] Conventional Commits + semantic versioning
- [ ] `docker-compose.dev.yml` for local development (Postgres, Redis, Gitea, Vault)

### 4.2 Control-Plane Database Schema (Postgres)

Core entities:

- **Tenant** — id, name, slug, owner, plan, status, quotas, created_at
- **User** — id, email, password_hash, tenant_id, role, mfa_secret
- **ApiKey** — id, user_id, tenant_id, key_hash, scopes, expires_at
- **Resource** — id, tenant_id, type (enum), provider_id, status, spec (JSONB), desired_state_hash, actual_state_hash, last_reconciled_at, created_at
- **ResourceTag** — resource_id, key, value (indexed; max 50 tags per resource)
- **IdempotencyKey** — key (unique), tenant_id, request_hash, response, expires_at
- **WebhookEndpoint** — id, tenant_id, url, secret_hash, events (text[]), active
- **WebhookDelivery** — id, endpoint_id, event_type, payload, status, attempts, next_retry_at
- **AuditLog** — id, tenant_id, user_id, action, resource_id, diff (JSONB), timestamp (partitioned by month)
- **BillingAccount** — id, tenant_id, payment_method, balance
- **UsageRecord** — id, tenant_id, resource_id, metric, value, timestamp
- **Quota** — id, tenant_id, resource_type, limit, current_usage

### 4.3 Authentication & Authorization

- JWT-based auth (access + refresh tokens)
- RBAC model: **Owner → Admin → Member → Viewer** per tenant
- API key authentication for programmatic access & CLI
- Optional OIDC/SAML federation for enterprise tenants (later phase)
- Admin super-role for ISP operators (separate auth domain)

### 4.4 API Gateway (NestJS)

- Public-facing REST API (versioned: `/api/v1/...`)
- Request validation (class-validator / Zod)
- Rate limiting per tenant/API key (token bucket via Redis)
- **Idempotency-Key header** on all POST/PUT/PATCH — stored in DB with TTL, returns
  cached response on replay
- Request/response logging → audit log
- OpenAPI (Swagger) auto-generation → **auto-generate client SDKs** (TypeScript, Python, Go)
  via `openapi-generator` in CI
- WebSocket gateway for real-time resource status updates
- Circuit breaker per downstream service (prevent cascade failures)
- Request correlation ID (propagated through all services for distributed tracing)

### 4.5 Tenant Lifecycle

- `POST /api/v1/tenants` — Create tenant → provisions: DB schema row, Git repo (Gitea), SDN namespace, default quotas
- `DELETE /api/v1/tenants/:id` — Decommission → tears down all resources, archives Git repo
- Tenant suspension (non-payment, abuse) — resources stopped but not deleted

### 4.6 GitOps Service — Tenant Repo Bootstrapping

- On tenant creation, GitOps service creates a new repo in Gitea/Forgejo
- Repo is initialized from `infra/tenant-template/` with:
  - `main.tf` — OpenTofu root module
  - `variables.tf` — Tenant-specific variables
  - `backend.tf` — State backend config (Postgres or S3)
  - `README.md`
- The orchestrator writes to this repo; OpenTofu plans and applies from it
- Every resource change = Git commit → OpenTofu plan → approval (auto or manual) → apply

### 4.7 Event Bus (NATS JetStream)

- NATS server deployed as part of control-plane stack
- JetStream enabled for persistent, at-least-once delivery
- Standardized event envelope:
  - `event_id` (UUID), `event_type`, `tenant_id`, `resource_id`, `timestamp`
  - `payload` (JSONB), `correlation_id`, `caused_by` (parent event)
- Core event streams:
  - `cloudify.resources.*` — all resource state changes (created, updated, deleted, failed)
  - `cloudify.tenants.*` — tenant lifecycle events
  - `cloudify.billing.*` — usage events for metering
  - `cloudify.audit.*` — audit trail events
  - `cloudify.webhooks.*` — events queued for external delivery
- Every service publishes events; consumers are decoupled and independently scalable
- Dead letter queue for failed processing (with retry policy)

### 4.8 Hypervisor Abstraction Layer

Built from day one in `packages/hypervisor/`:

```typescript
interface HypervisorProvider {
  // VM lifecycle
  createVM(spec: VMSpec): Promise<VMHandle>;
  destroyVM(id: string): Promise<void>;
  startVM(id: string): Promise<void>;
  stopVM(id: string): Promise<void>;
  resizeVM(id: string, spec: Partial<VMSpec>): Promise<void>;
  snapshotVM(id: string, name: string): Promise<SnapshotHandle>;
  restoreSnapshot(id: string, snapshotId: string): Promise<void>;
  migrateVM(id: string, targetNode: string): Promise<void>;

  // Templates & images
  listTemplates(): Promise<VMTemplate[]>;
  cloneTemplate(templateId: string, spec: VMSpec): Promise<VMHandle>;

  // Node management
  listNodes(): Promise<NodeInfo[]>;
  getNodeCapacity(nodeId: string): Promise<NodeCapacity>;

  // Introspection
  getVMStatus(id: string): Promise<VMStatus>;
  getVMMetrics(id: string): Promise<VMMetrics>;
}
```

- `packages/hypervisor/proxmox/` — Proxmox VE implementation (first)
- `packages/hypervisor/vmware/` — vSphere implementation (future)
- All compute/K8s services depend on this interface, never on Proxmox directly
- Provider selected via config (`HYPERVISOR_PROVIDER=proxmox`)

---

## 5. Phase 1 — Core Compute & Networking

**Goal:** Provision VMs and Kubernetes clusters on Proxmox inside tenant-isolated networks.

**Duration estimate:** 8–12 weeks

### 5.1 Proxmox Integration Layer (via Hypervisor Abstraction)

- Implements `HypervisorProvider` interface for Proxmox VE
- Proxmox VE REST API client (TypeScript, fully typed)
- Operations:
  - Create/start/stop/destroy QEMU VMs
  - Create/manage LXC containers (optional, for lightweight workloads)
  - Clone from VM templates (pre-baked images: Ubuntu, Debian, etc.)
  - Resize CPU/RAM/disk
  - Snapshot and restore
  - Migrate VMs between Proxmox nodes
  - Query node capacity and health
- Node pool / cluster discovery — control plane knows all Proxmox nodes and their capacity
- Placement scheduler: decides which Proxmox node gets the next VM based on available resources, affinity rules, and anti-affinity (spread tenant VMs across hosts)

### 5.2 Managed Kubernetes Service

This is the flagship service — similar to GKE/EKS.

**Architecture per tenant K8s cluster:**

```
Tenant K8s Cluster
├── Control Plane VMs (1 or 3 for HA)
│   ├── kube-apiserver
│   ├── etcd
│   ├── kube-scheduler
│   └── kube-controller-manager
├── Worker Node VMs (N, auto-scalable)
│   ├── kubelet
│   ├── kube-proxy / Cilium
│   └── Container runtime (containerd)
└── Attached Resources
    ├── Tenant SDN (overlay network for pods)
    ├── LoadBalancer integration (real IP from pool)
    └── CSI driver (for persistent volumes on Proxmox storage)
```

- Provisioning flow:
  1. User requests K8s cluster via API/UI (version, node count, node size)
  2. Orchestrator writes cluster spec to tenant Git repo
  3. GitOps service runs OpenTofu → creates VMs on Proxmox
  4. Cloud-init / Ansible bootstraps K8s (kubeadm-based)
  5. CNI plugin installed (Cilium preferred — eBPF, network policies, observability)
  6. CSI driver configured for Proxmox storage (Ceph, local-lvm, NFS)
  7. Kubeconfig generated and stored in secrets service
  8. Cluster health probe registered in monitoring
- Cluster lifecycle: upgrade K8s version (rolling), scale nodes, delete cluster
- Multi-version support: maintain a catalog of supported K8s versions with tested images

### 5.3 Software-Defined Networking (SDN) — Overview

(Detailed in [Section 14](#14-software-defined-networking-sdn))

- Each tenant gets a private network realm (isolated L2/L3 domain)
- Overlay network using OVN (Open Virtual Network) on top of Proxmox hosts
- Tenant subnets, routing, firewall rules, NAT egress
- Peering between tenant networks only if explicitly configured
- Integration with Proxmox SDN module (Proxmox 8+ has built-in SDN/OVN support)

### 5.4 IP Address Management (IPAM)

- ISP provides a pool of public IPv4 addresses (and IPv6 prefixes)
- IPAM database tracks: pool → subnet → allocation → tenant → resource
- Allocation types:
  - **Floating IP** — assignable to any resource, survives resource replacement
  - **Ephemeral IP** — tied to resource lifecycle
  - **Private IP** — from tenant's SDN subnet (RFC 1918 / ULA for v6)
- API: `POST /api/v1/ips/allocate`, `POST /api/v1/ips/release`, `POST /api/v1/ips/assign`

### 5.5 Load Balancers

**External (ISP edge):**

- Keepalived for VRRP — virtual IP floats between LB nodes
- HAProxy for L4/L7 load balancing
- Real client IP preservation (PROXY protocol or X-Forwarded-For)
- LB nodes are dedicated machines (not Proxmox VMs) for reliability
- Config generated by network service, pushed to HAProxy via API/reload
- **Coraza WAF** integrated via HAProxy SPOE — per-tenant L7 rules enforced at the edge
- **CrowdSec** agent on each LB node — collaborative DDoS/bot/abuse protection
- See [Section 24](#24-firewall-waf--ddos-protection) for full details

**Per-tenant (inside SDN):**

- MetalLB or kube-vip inside tenant K8s clusters
- Allocates IPs from tenant's assigned public IP sub-pool
- Integrates with external HAProxy for ingress routing
- Cilium network policies enforce L3/L4 rules within the cluster

---

## 6. Phase 2 — Managed Services

**Goal:** Offer managed databases, object storage, and caching as self-service resources.

**Duration estimate:** 8–10 weeks

### 6.1 Managed PostgreSQL

- Provisioning: dedicated VM (or container on K8s with operator) per instance
- Operator approach (recommended): deploy [CloudNativePG](https://cloudnative-pg.io/) or
  [Zalando Postgres Operator](https://github.com/zalando/postgres-operator) on a
  shared "services K8s cluster" managed by the control plane
- Features:
  - Instance sizes (vCPU, RAM, storage)
  - Automated backups (WAL-G → MinIO/S3)
  - Point-in-time recovery (PITR)
  - Read replicas
  - Connection pooling (PgBouncer sidecar)
  - Monitoring (pg_stat_statements → Prometheus)
  - Automatic failover (patroni-based or operator-managed)
- Networking: instance gets a private IP on tenant SDN + optional public endpoint via LB
- Credentials generated and stored in secrets service

### 6.2 Managed MongoDB

- Similar pattern: [MongoDB Community Operator](https://github.com/mongodb/mongodb-kubernetes-operator) on services K8s cluster
- Features:
  - Replica sets (3-node default)
  - Automated backups (mongodump → MinIO)
  - Monitoring (MongoDB Exporter → Prometheus)
  - Connection string management
- Networking: private SDN IP, optional public endpoint

### 6.3 Managed Valkey (Redis-Compatible)

- [Valkey](https://valkey.io/) deployed via operator or Helm on services cluster
- Features:
  - Standalone and cluster modes
  - Persistence (RDB/AOF on persistent volumes)
  - Memory limits and eviction policies
  - Monitoring (Redis Exporter → Prometheus)
- Lightweight — can also run as a container directly on Proxmox LXC for smaller instances

### 6.4 Object Storage (MinIO)

- Shared multi-tenant MinIO cluster managed by control plane
  **OR** per-tenant MinIO instances (depends on scale)
- Recommended: shared cluster with tenant isolation via MinIO policies + separate buckets
- Features:
  - S3-compatible API (vast ecosystem of tools works out of the box)
  - Bucket creation/deletion
  - Access policies (per-bucket, per-key)
  - Lifecycle rules (expiration, transition)
  - Versioning
  - Pre-signed URLs
  - Quota enforcement per tenant
- Storage backend: Proxmox Ceph cluster or direct-attached storage
- Endpoint: `https://<tenant>.storage.cloudify.example.com`

### 6.5 Services Kubernetes Cluster

To run managed service operators (Postgres, Mongo, Valkey), the control plane maintains
one or more **services K8s clusters** — these are NOT tenant-facing but host the
operator-managed instances:

```
Services K8s Cluster (managed by control plane)
├── Namespace: tenant-a-postgres
│   └── CloudNativePG cluster (3 pods)
├── Namespace: tenant-a-valkey
│   └── Valkey StatefulSet (1 pod)
├── Namespace: tenant-b-mongo
│   └── MongoDB ReplicaSet (3 pods)
└── ...
```

Each tenant's managed service runs in an isolated namespace with:
- NetworkPolicy restricting traffic to the tenant's SDN
- ResourceQuota matching the tenant's plan
- Separate PVCs on the storage backend

---

## 7. Phase 3 — Platform Services

**Goal:** DNS, SSL/TLS certificate management, secrets management, artifact registry.

**Duration estimate:** 8–10 weeks

### 7.1 DNS Service

- Backend: PowerDNS (authoritative) with PostgreSQL storage
  **OR** CoreDNS with custom plugin + API
- Features:
  - Zone management per tenant (`tenant.cloudify.example.com` or custom domains)
  - Record types: A, AAAA, CNAME, MX, TXT, SRV, NS
  - API-driven: `POST /api/v1/dns/zones`, `POST /api/v1/dns/records`
  - Automatic record creation when resources are provisioned (K8s ingress, LB, etc.)
  - DNSSEC support (optional)
  - Delegation: tenant brings their own domain → NS records point to Cloudify DNS
- Integration with certificate service (Section 7.2) for automatic TLS on custom domains

### 7.2 SSL/TLS Certificate Management

Fully managed certificate lifecycle for tenant domains — similar to AWS Certificate
Manager (ACM) or GCP Managed Certificates.

**Architecture:**

```
Tenant requests certificate (API / UI)
        │
        ▼
Certificate Service (NestJS)
        │
        ├── Validates domain ownership
        │   ├── DNS-01 challenge (preferred — works for wildcards)
        │   │   └── Automatically creates TXT record via DNS Service (PowerDNS)
        │   ├── HTTP-01 challenge (fallback)
        │   │   └── Provisions /.well-known/acme-challenge/ via LB/ingress
        │   └── Manual validation (for external DNS — tenant adds TXT record)
        │
        ├── Issues certificate via ACME protocol
        │   └── Let's Encrypt (primary) / ZeroSSL / BuyPass (fallback CAs)
        │
        ├── Stores cert + private key in Secrets Service (Vault)
        │
        ├── Distributes to consumers:
        │   ├── HAProxy (edge LB) — for tenant custom domains
        │   ├── Tenant K8s cluster — via cert-manager + External Secrets
        │   └── Managed services — Postgres SSL, MinIO HTTPS, etc.
        │
        └── Schedules renewal (30 days before expiry)
```

**Core library:** [acme-client](https://github.com/publishlab/node-acme-client)
(Node.js ACME v2 protocol implementation) or shell out to
[Lego](https://github.com/go-acme/lego) (Go ACME client supporting 100+ DNS providers).

**Features:**

- **Automatic issuance**: tenant adds a custom domain → Cloudify automatically issues a
  Let's Encrypt certificate
- **DNS-01 challenge automation**: for domains using Cloudify DNS, the challenge TXT
  record is created and cleaned up automatically (no tenant action required)
- **HTTP-01 challenge**: for domains pointing to Cloudify LBs but using external DNS
- **Wildcard certificates**: supported via DNS-01 (`*.app.tenant.com`)
- **Multi-SAN certificates**: multiple domains on a single cert
- **Automatic renewal**: background job checks expiry dates, renews 30 days before
  expiration, re-distributes the new cert to all consumers
- **Renewal failure alerting**: if renewal fails (DNS changed, domain expired),
  notify tenant via email/webhook with clear instructions
- **Certificate transparency logging**: all issued certs logged for auditability
- **Custom CA support**: ISPs that have their own CA or need internal PKI can
  upload custom CA certs and issue from them (for internal/private domains)
- **Let's Encrypt rate limit awareness**: track issuance counts per registered
  domain, warn when approaching limits, batch renewals intelligently
- **API**: 
  - `POST /api/v1/certificates` — request a new certificate
  - `GET /api/v1/certificates` — list all certs for tenant
  - `GET /api/v1/certificates/:id` — cert detail (expiry, domains, status)
  - `DELETE /api/v1/certificates/:id` — revoke and delete
  - `POST /api/v1/certificates/:id/renew` — force early renewal

**Certificate lifecycle states:**

```
Pending → Validating → Issuing → Active → Renewing → Active
                                      ↘ Expiring (30d warning)
                                           ↘ Expired
           ↘ ValidationFailed
           ↘ IssuanceFailed
```

**Integration points:**

| Consumer | How cert is delivered |
|----------|---------------------|
| Edge HAProxy LBs | Cert written to shared storage or pushed via HAProxy Data Plane API; HAProxy reloads without downtime (hitless reload) |
| Tenant K8s ingress | cert-manager CRDs synced via External Secrets Operator, or Cloudify cert controller watches Certificate resources |
| Managed Postgres | SSL cert injected into instance config, connection string updated |
| Managed MinIO | HTTPS endpoint cert updated, MinIO restarted gracefully |
| Artifact Registry (Harbor) | Registry endpoint cert updated |

**Control-plane internal PKI:**

- Separate from tenant certificates
- Internal CA (Vault PKI secrets engine or step-ca) for mTLS between control-plane services
- Automatic rotation of inter-service certificates
- Not exposed to tenants

### 7.3 Secret Manager

- Backend: [HashiCorp Vault](https://www.vaultproject.io/) (BSL-licensed but widely used)
  **OR** consider [OpenBao](https://openbao.org/) (true open-source Vault fork)
- Per-tenant secret engine (KV v2)
- Features:
  - Key-value secrets with versioning
  - Dynamic secrets (DB credentials, cloud tokens)
  - Secret rotation policies
  - Audit logging of all access
  - API: `POST /api/v1/secrets`, `GET /api/v1/secrets/:name`
- K8s integration:
  - [External Secrets Operator](https://external-secrets.io/) installed on tenant K8s clusters
  - Syncs secrets from Cloudify Vault → K8s Secrets
  - Tenant configures which secrets to mount, on which namespaces
- Credential delivery: managed DB passwords, API keys, TLS certs are auto-stored here

### 7.4 Artifact Registry

- Backend: [Harbor](https://goharbor.io/) — CNCF graduated, supports Docker, Helm, and
  OCI artifacts
- Extend with [Verdaccio](https://verdaccio.org/) for npm
  and [BaGet](https://github.com/loic-sharma/BaGet) or Nexus-lite for NuGet/Maven
  **OR** use Harbor's OCI support for all artifact types where possible
- Features:
  - Docker image push/pull with tenant-scoped projects
  - Vulnerability scanning (Trivy, built into Harbor)
  - Image signing (Cosign/Notary)
  - Retention policies (tag expiry, untagged cleanup)
  - Replication (pull-through cache from Docker Hub, ghcr.io, etc.)
  - npm, NuGet, Maven registries (via proxy or dedicated service)
  - Quota enforcement (storage per tenant)
- Endpoint: `registry.cloudify.example.com/<tenant>/<repo>`
- Auth: integrated with Cloudify identity (OIDC from API gateway → Harbor)

---

## 8. Phase 4 — Web UI & Self-Service Portal

**Goal:** Full-featured web interface for tenants and ISP administrators.

**Duration estimate:** 10–14 weeks (parallel with backend phases)

### 8.1 Technology & Design System

- **React 18+** with TypeScript
- **Vite** for build tooling
- **TanStack Query (React Query)** for server state management
- **Zustand** or **Redux Toolkit** for client state
- **React Router** for navigation
- **Tailwind CSS** + custom component library (or Shadcn/ui as a starting point)
- **Recharts** or **Tremor** for dashboards and metrics visualization
- Design tokens and a component library shared between portal and admin
- Responsive design (desktop-first, but usable on tablet)
- Dark mode support

### 8.2 Tenant Self-Service Portal (`web-portal`)

#### Dashboard
- Resource summary (K8s clusters, DBs, storage, etc.)
- Cost overview (current month spend, burn rate)
- Health status of all resources
- Recent activity feed (audit log)

#### Compute — Kubernetes
- Cluster list with health indicators
- Create cluster wizard (version, node pool config, networking)
- Cluster detail: node list, scale controls, upgrade button
- Kubeconfig download
- Kubectl web terminal (optional, via WebSocket)

#### Databases
- Instance list (Postgres, Mongo, Valkey) with status
- Create instance form (engine, version, size, backup schedule)
- Instance detail: connection info, metrics (CPU, memory, connections, queries/sec)
- Backup management: list backups, trigger manual backup, restore

#### Storage
- Bucket list with usage bars
- Create bucket, configure policies
- File browser (list objects, upload/download, generate pre-signed URL)
- Lifecycle rule editor

#### Networking
- SDN overview: subnets, routing table, peering
- IP address management: allocate, release, assign floating IPs
- Load balancer management: create, configure backends, health checks
- DNS zone editor: visual record management, import zone file

#### Firewall & WAF
- L3/L4 firewall rules editor (security groups): protocol, port, CIDR, allow/deny
- Rule priority ordering with drag-and-drop
- Pre-built rule templates (e.g., "Allow HTTP/HTTPS only", "Allow SSH from my IP")
- WAF policy management: enable/disable OWASP CRS rule groups per service
- WAF mode toggle: Detection (log-only) vs Prevention (block)
- Custom WAF rules: pattern-based request matching (URI, headers, body)
- WAF event log: blocked requests with reason, source IP, timestamp
- DDoS protection settings: rate limits per endpoint, geo-blocking, bot score threshold
- IP reputation lists: whitelist/blacklist per tenant
- Real-time attack dashboard: request rates, block rates, top attackers, threat map

#### SSL/TLS Certificates
- Certificate list with status badges (Active, Expiring, Expired, Pending)
- Request certificate wizard: enter domain(s), choose validation method (auto DNS vs manual)
- Certificate detail: domains covered, issuer, expiry date, renewal history
- Validation status: real-time progress of ACME challenge (pending → validated → issued)
- Renewal log: history of all renewals with success/failure details
- Attach certificate to resource: assign cert to LB, K8s ingress, managed service
- Expiry alerts configuration: notification channels and thresholds
- Custom CA upload (for private/internal certificates)

#### Secrets
- Secret list with version history
- Create/update/delete secrets
- K8s sync configuration (which clusters, which namespaces)

#### Registry
- Repository list, image tags with vulnerability badges
- Push instructions / token generation
- Retention policy configuration

#### Settings
- Team management: invite users, assign roles
- API keys: create, revoke, scope management
- Billing: current plan, usage, invoices, payment method
- Quota dashboard: usage vs limits per resource type
- Notifications: email, webhook, Slack integration

### 8.3 ISP Admin Dashboard (`web-admin`)

- **Tenant management**: list, create, suspend, delete tenants; adjust quotas
- **Infrastructure view**: Proxmox node health, capacity utilization, VM placement
- **Resource overview**: all managed services across all tenants
- **Billing admin**: invoice generation, payment tracking, plan management
- **Network admin**: IP pool management, BGP session status, SDN topology
- **Firewall/WAF admin**: global WAF rules, CrowdSec console, platform-wide threat dashboard, IP reputation feeds
- **Certificate admin**: ACME account management, rate limit dashboard, CA configuration, failed renewals queue
- **System health**: control-plane service status, logs, alerts
- **Audit trail**: cross-tenant audit log search
- **Plugin management**: install, configure, enable/disable extensions

### 8.4 Shared UI Patterns

- **Resource creation** follows a consistent wizard pattern: Configure → Review → Create
- **Resource detail** pages always show: Status, Spec, Metrics, Logs, Events, Actions
- **Destructive actions** require confirmation with resource name typed out
- **Real-time updates** via WebSocket (resource status changes, provisioning progress)
- **Breadcrumb navigation** for deep resource hierarchies
- **Global search** across all resource types (`Cmd+K` launcher)

---

## 9. Phase 5 — Billing, Quotas & Metering

**Goal:** Usage-based billing with transparent pricing, quotas, and invoice generation.

**Duration estimate:** 6–8 weeks

### 9.1 Metering

- Every billable resource emits usage events to the billing service
- Metrics collected:
  - **Compute**: vCPU-hours, RAM-GB-hours per VM/node
  - **Storage**: GB-hours (block, object), I/O operations
  - **Database**: instance-hours by size, storage, backup storage
  - **Network**: egress GB, LB hours, public IP hours
  - **Certificates**: managed cert count (free tier possible, or per-cert pricing)
  - **Firewall/WAF**: WAF inspected requests (per 10K), custom rule count
  - **Registry**: storage GB, bandwidth
- Collection: lightweight agent on resources → event bus (NATS or Redis Streams) → billing service aggregator
- Granularity: per-minute sampling, hourly rollup, daily/monthly aggregation

### 9.2 Pricing Engine

- **Plans**: predefined bundles (Starter, Pro, Enterprise) with included quotas
- **Pay-as-you-go**: per-resource-hour pricing for overage or standalone
- **Reserved capacity**: discounted pricing for committed usage (optional)
- Price list stored in DB, versioned, admin-editable
- Currency support (single currency per ISP deployment, configurable)
- Discount rules, promotional credits

### 9.3 Quotas & Limits

- Per-tenant quotas by resource type:
  - Max K8s clusters, max nodes per cluster
  - Max DB instances, max storage per instance
  - Max MinIO storage
  - Max public IPs
  - Max DNS zones/records
- Quota enforcement at the API layer (reject requests that exceed limits)
- Soft limits (warning) vs hard limits (rejection)
- Admin can override quotas per tenant

### 9.4 Invoicing

- Monthly invoice generation (PDF + structured data)
- Line items: resource type, quantity, unit price, total
- Credits and adjustments
- Invoice history and download
- Payment integration: Stripe (for card payments), bank transfer support
- Dunning: overdue notifications → suspension → data retention period → deletion

---

## 10. Phase 6 — Plugin & Extension System

**Goal:** Allow third-party developers to add new managed service types and integrations.

**Duration estimate:** 6–8 weeks

### 10.1 Plugin Architecture

```
┌─────────────────────────────────────────────────┐
│                Plugin Host (NestJS)              │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Plugin A │  │ Plugin B │  │ Plugin C │  ... │
│  │ (Docker) │  │ (Docker) │  │ (Docker) │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       └──────────┬───┘─────────────┘             │
│                  │                                │
│  ┌───────────────┴────────────────┐              │
│  │     Plugin SDK (TypeScript)    │              │
│  │                                │              │
│  │  - Resource lifecycle hooks    │              │
│  │  - API route registration      │              │
│  │  - UI component slots          │              │
│  │  - OpenTofu module registration│              │
│  │  - Billing metric emission     │              │
│  │  - Event bus subscription      │              │
│  └────────────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

### 10.2 Plugin SDK

Published as `@cloudify/plugin-sdk` npm package:

- **Resource Definition**: declare resource types, schemas, default configs
- **Lifecycle Hooks**: `onCreate`, `onUpdate`, `onDelete`, `onHealthCheck`
- **API Extension**: register new REST routes under `/api/v1/plugins/<name>/`
- **UI Extension**: export React components that render in designated UI slots
- **IaC Module**: provide OpenTofu modules for the resource type
- **Billing**: declare billable metrics and pricing dimensions
- **Events**: subscribe to platform events (tenant created, resource provisioned, etc.)

### 10.3 Plugin Distribution

- Plugins are Docker images published to a registry
- Plugin manifest (`cloudify-plugin.yaml`) describes capabilities, required permissions
- Plugin marketplace (later phase): browsable catalog in admin UI
- Installation: admin installs plugin → control plane pulls image → registers routes/hooks

### 10.4 Example Plugin Ideas

- Managed Elasticsearch/OpenSearch
- Managed RabbitMQ / NATS
- Managed Redis Cluster (as alternative to Valkey)
- CI/CD service (Gitea Actions runner pool)
- Managed monitoring stack (Prometheus + Grafana per tenant)
- Managed email service (Postfix + DKIM)
- Backup-as-a-Service (cross-region replication)

---

## 11. Phase 7 — Installation & Day-2 Operations

**Goal:** One-command installation for ISPs, and operational tooling for ongoing management.

**Duration estimate:** 4–6 weeks

### 11.1 Day-1 Installation (Docker Compose)

`install.sh` performs:

1. Validate prerequisites (Docker, Docker Compose, minimum system resources)
2. Prompt for configuration:
   - Domain name for the control plane
   - Proxmox cluster API endpoint + credentials
   - Public IP pool for tenant allocation
   - Admin email / initial password
   - TLS certificate for control plane (or auto-provision via Let's Encrypt)
   - ACME account email for tenant certificate issuance
3. Generate `.env` and config files from answers
4. Pull Docker images from GitHub Container Registry (ghcr.io)
5. Run `docker-compose up -d`
6. Run initialization jobs (DB migrations, seed data, Gitea setup, Vault init)
7. Print summary: URLs, admin credentials, next steps

Docker Compose stack includes:
- API Gateway
- Orchestrator + all service modules
- PostgreSQL (control plane DB)
- Redis / Valkey (queues, caching)
- Gitea (tenant Git repos)
- Vault / OpenBao (secrets)
- MinIO (control-plane artifact storage + tenant object storage)
- Harbor (artifact registry)
- PowerDNS (DNS service)
- Certificate service (ACME client for Let's Encrypt / ZeroSSL)
- Nginx / Traefik (reverse proxy with TLS termination)
- Prometheus + Grafana (control-plane monitoring)

### 11.2 Day-2 Installation (Helm on K8s)

When the ISP is ready to move to production-grade:

- Helm chart for deploying the entire control plane on a dedicated K8s cluster
- Values file mirrors the Docker Compose config
- Horizontal scaling for stateless services (API gateway, orchestrator)
- HA for stateful services (Postgres with patroni, Redis sentinel, etcd)
- Migration guide: Docker Compose → Helm (data export/import)

### 11.3 Operational Tooling

- **Health checks**: each service exposes `/health` and `/ready` endpoints
- **Logging**: structured JSON logs, shipped to Loki or ELK (ISP's choice)
- **Monitoring**: Prometheus metrics from every service, pre-built Grafana dashboards
- **Alerting**: pre-configured alerts (service down, disk full, tenant quota breach, etc.)
- **Backup**: automated backup of control-plane DB, Vault, Gitea repos, MinIO data
- **Upgrade**: rolling upgrade procedure (pull new images, migrate DB, restart)
- **CLI**: `cloudify-admin` CLI for ISP operators (inspect state, force-reconcile, etc.)

---

## 12. Phase 8 — Hardening & Production Readiness

**Goal:** Security hardening, performance optimization, and documentation for GA.

**Duration estimate:** 6–8 weeks

### 12.1 Security

- [ ] TLS everywhere (control plane ↔ data plane, inter-service, DB connections)
- [ ] Secrets encryption at rest (Vault auto-unseal, DB encryption)
- [ ] Network policies on control-plane K8s (when on Helm deployment)
- [ ] Input validation and sanitization on all API endpoints
- [ ] SQL injection prevention (parameterized queries, ORM-only access)
- [ ] Rate limiting and DDoS protection at the LB layer
- [ ] Penetration testing and vulnerability assessment
- [ ] Dependency scanning (Dependabot, Snyk, Trivy)
- [ ] Signed Docker images for all control-plane components
- [ ] Audit log tamper-proofing (append-only, hashed chain)

### 12.2 Performance

- [ ] Load testing: simulate 100+ tenants with concurrent resource operations
- [ ] API response time targets: < 200ms p95 for CRUD, < 5s for provisioning initiation
- [ ] Database query optimization (indexes, connection pooling, read replicas for CP DB)
- [ ] Caching strategy (Redis) for frequently accessed data (tenant config, quotas, etc.)
- [ ] Event-driven architecture: async processing for long-running operations
- [ ] OpenTofu execution pooling (limit concurrent applies to prevent resource contention)

### 12.3 Documentation

- [ ] Architecture decision records (ADRs) for all major choices
- [ ] API reference (auto-generated from OpenAPI spec)
- [ ] User guide: getting started, tutorials for each service
- [ ] Admin guide: installation, configuration, troubleshooting
- [ ] Plugin development guide: SDK reference, example plugin walkthrough
- [ ] Contributing guide: code style, PR process, release process

---

## 13. Infrastructure as Code — Tenant GitOps Model

### How tenant configuration flows

```
User Action (API / UI)
        │
        ▼
Orchestrator validates request against quotas, RBAC
        │
        ▼
GitOps Service writes changes to tenant Git repo
        │  (e.g., adds k8s-cluster resource block to main.tf)
        │
        ▼
OpenTofu Runner picks up change
        │
        ├── tofu plan  → diff stored, logged
        │
        ├── Auto-approve (for standard operations)
        │   OR manual approve (for destructive operations)
        │
        └── tofu apply → Proxmox API calls / K8s operations
                │
                ▼
        Resource provisioned on data plane
                │
                ▼
        Status callback → Orchestrator updates resource state
                │
                ▼
        WebSocket notification → UI updates in real-time
```

### Tenant Repo Structure

```
tenant-<slug>/
├── main.tf               ← Root module, imports all resources
├── variables.tf          ← Tenant-specific variables (plan, quotas)
├── backend.tf            ← OpenTofu state backend configuration
├── provider.tf           ← Cloudify provider configuration
├── outputs.tf            ← Exposed outputs (endpoints, IPs, etc.)
│
├── compute/
│   ├── k8s-cluster-1.tf  ← Kubernetes cluster definition
│   └── k8s-cluster-2.tf
│
├── databases/
│   ├── postgres-main.tf  ← Managed Postgres instance
│   ├── mongo-app.tf      ← Managed MongoDB instance
│   └── valkey-cache.tf   ← Managed Valkey instance
│
├── storage/
│   └── buckets.tf        ← MinIO bucket definitions
│
├── network/
│   ├── sdn.tf            ← Private network, subnets
│   ├── firewall.tf       ← L3/L4 security group rules
│   ├── waf.tf            ← L7 WAF policies and custom rules
│   ├── ddos.tf           ← DDoS protection profiles
│   ├── lb.tf             ← Load balancer definitions
│   └── dns.tf            ← DNS zones and records
│
├── certificates/
│   └── certs.tf          ← SSL/TLS certificate requests & domain bindings
│
├── secrets/
│   └── secrets.tf        ← Secret references (not values!)
│
└── registry/
    └── projects.tf       ← Artifact registry projects
```

### Rollback Model

- Every change is a Git commit with a meaningful message
- To rollback: `git revert <commit>` → triggers OpenTofu plan → apply destroys/reverts
- Branches for "draft" configurations (optional)
- Tags for "known good" states
- The orchestrator never modifies state directly — always through Git

### Custom OpenTofu Provider

We will need a custom OpenTofu provider (`terraform-provider-cloudify`) that translates
HCL resource definitions into Cloudify API calls. This provider:

- Wraps Proxmox API for compute resources
- Manages OVN networks for SDN resources
- Calls Kubernetes operators for managed services
- Registers resources in the control-plane database

---

## 14. Software-Defined Networking (SDN)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OVN Central (on Control Plane)               │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ OVN Northd  │  │ ovsdb-server│  │ ovsdb-server           │  │
│  │             │  │ (Northbound)│  │ (Southbound)           │  │
│  └─────────────┘  └─────────────┘  └────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────┴──────┐ ┌──────┴────────┐ ┌─────┴──────────┐
│ Proxmox Node 1 │ │ Proxmox Node 2│ │ Proxmox Node N │
│                │ │               │ │                │
│ OVS + OVN     │ │ OVS + OVN    │ │ OVS + OVN     │
│ Controller    │ │ Controller   │ │ Controller    │
│                │ │               │ │                │
│ ┌─Tenant A──┐ │ │ ┌─Tenant B─┐ │ │ ┌─Tenant A──┐ │
│ │ VM1  VM2  │ │ │ │ VM1  VM2 │ │ │ │ VM3  VM4  │ │
│ │ (vnet-a)  │ │ │ │(vnet-b)  │ │ │ │ (vnet-a)  │ │
│ └───────────┘ │ │ └──────────┘ │ │ └───────────┘ │
└───────────────┘ └──────────────┘ └───────────────┘
```

### Tenant Network Isolation

- Each tenant gets one or more **logical switches** (L2 segments) in OVN
- Logical switches are connected via a **logical router** per tenant
- Inter-tenant traffic is **blocked by default** (no routes between tenant routers)
- NAT gateway per tenant for outbound internet access
- Floating IPs implemented as DNAT rules on the tenant's logical router
- Firewall rules implemented as OVN ACLs on logical switch ports

### Network Objects per Tenant

| Object | Description |
|--------|------------|
| VPC (Virtual Private Cloud) | Logical container for all tenant networks |
| Subnet | IP range within a VPC, mapped to an OVN logical switch |
| Router | OVN logical router connecting subnets |
| Security Group | L3/L4 ACL rules applied to ports (OVN ACLs) — see [Section 24](#24-firewall-waf--ddos-protection) |
| WAF Policy | L7 web application firewall rules (Coraza/OWASP CRS) — see [Section 24](#24-firewall-waf--ddos-protection) |
| DDoS Profile | Rate limits, geo-blocking, bot protection (CrowdSec) — see [Section 24](#24-firewall-waf--ddos-protection) |
| Floating IP | Public IP DNATed to a private IP |
| NAT Gateway | SNAT for outbound internet from private subnets |
| Peering | Cross-tenant or cross-VPC route exchange (explicit opt-in) |
| VPN Gateway | WireGuard endpoint for site-to-site connectivity (future) |

### Integration with Proxmox SDN

Proxmox 8+ includes SDN support with OVN as a backend:
- Zones, VNets, and Subnets configurable via Proxmox API
- VMs attach to VNets at creation time
- Cloudify network service uses the Proxmox SDN API to create/manage these objects
- This avoids needing to manage OVN directly in early phases

---

## 15. Event-Driven Architecture & Service Communication

### Why This Is Foundational

Without a formalized event bus, services fall into synchronous HTTP call chains:
`API → Orchestrator → Compute → Network → GitOps`. One slow or failed service blocks
everything upstream. With event-driven architecture, each service reacts independently
to events, retries on failure, and scales horizontally.

### Event Flow Model

```
Producer Service                     NATS JetStream                    Consumer Services
     │                                    │                                    │
     ├── resource.requested ──────────────┼── ► Orchestrator validates ────────┤
     │                                    │                                    │
     ├── resource.provisioning ───────────┼── ► GitOps writes to tenant repo ─┤
     │                                    │                                    │
     ├── resource.created ────────────────┼── ► Billing starts metering ──────┤
     │                                    │── ► Webhook service delivers ─────┤
     │                                    │── ► Reconciler registers watch ───┤
     │                                    │── ► Audit log records event ──────┤
     │                                    │                                    │
     ├── resource.health_changed ─────────┼── ► Reconciler evaluates ─────────┤
     │                                    │── ► Webhook if subscribed ────────┤
     │                                    │                                    │
     └── resource.deleted ────────────────┼── ► Billing stops metering ───────┤
                                          │── ► Cleanup handlers fire ────────┤
```

### Event Categories

| Stream | Events | Consumers |
|--------|--------|-----------|
| `cloudify.resources` | requested, provisioning, created, updated, deleted, failed, health_changed | Orchestrator, Billing, Webhooks, Reconciler, Audit |
| `cloudify.tenants` | created, updated, suspended, reactivated, deleted | GitOps, Network, Billing, Webhooks |
| `cloudify.network` | subnet.created, ip.allocated, ip.released, lb.configured | Compute, DNS, Certificates |
| `cloudify.certificates` | requested, issued, renewed, expiring, expired, failed | Network (HAProxy), Webhooks |
| `cloudify.billing` | usage.recorded, invoice.generated, payment.received, payment.failed | Tenant Mgr (suspension), Webhooks |
| `cloudify.gitops` | commit.pushed, plan.completed, apply.started, apply.completed, apply.failed | Orchestrator, Webhooks |

### Communication Patterns

| Pattern | When to Use | Implementation |
|---------|------------|----------------|
| **Event (fire-and-forget)** | State changes, notifications | NATS publish to stream |
| **Request-Reply** | Synchronous queries (e.g., "get VM status now") | NATS request-reply (with timeout) |
| **Command Queue** | Long-running tasks (provision VM, run tofu apply) | NATS queue group (competing consumers) |
| **Saga** | Multi-step workflows (create K8s cluster = 8 steps) | Orchestrator saga with compensation on failure |

### Saga Pattern for Complex Provisioning

```
Create K8s Cluster Saga:
  1. Reserve IPs (IPAM)         ← compensate: release IPs
  2. Create SDN subnet          ← compensate: delete subnet
  3. Create control-plane VMs   ← compensate: destroy VMs
  4. Bootstrap kubeadm          ← compensate: destroy VMs
  5. Install CNI (Cilium)       ← compensate: destroy VMs
  6. Create worker VMs          ← compensate: destroy workers
  7. Join workers to cluster    ← compensate: destroy workers
  8. Register health probe      ← compensate: deregister
  
  On any step failure → run compensations in reverse order.
```

---

## 16. Hypervisor Abstraction Layer

### Design

All compute operations go through a provider interface defined in
`packages/hypervisor/core/`. Services never import Proxmox or VMware modules directly.

```
┌──────────────────────────────────┐
│       Compute / K8s Service      │
│     (depends on interface only)  │
└──────────┬───────────────────────┘
           │
┌──────────┴───────────────────────┐
│    HypervisorProvider Interface   │
│    (packages/hypervisor/core)     │
└──┬───────────────────────────┬───┘
   │                           │
┌──┴──────────────┐  ┌────────┴─────────┐
│ ProxmoxProvider │  │ VMwareProvider   │
│ (KVM/QEMU)      │  │ (vSphere/ESXi)  │
└─────────────────┘  └─────────────────┘
```

### Interface Contract

Key abstractions beyond raw VM operations:

- **NodePool**: collection of hypervisor nodes with shared characteristics (storage type, CPU generation, network zone)
- **PlacementStrategy**: pluggable strategy interface (spread, pack, affinity-based)
- **StorageProvider**: abstract block/shared storage behind the hypervisor (local-lvm, Ceph, NFS, VMFS)
- **NetworkBridge**: abstract the hypervisor's network bridge configuration for SDN integration

### Registration

```typescript
// In the NestJS module system
@Module({
  providers: [
    {
      provide: HYPERVISOR_PROVIDER,
      useFactory: (config: ConfigService) => {
        switch (config.get('HYPERVISOR_PROVIDER')) {
          case 'proxmox': return new ProxmoxProvider(config);
          case 'vmware':  return new VMwareProvider(config);
          default: throw new Error('Unknown hypervisor provider');
        }
      },
    },
  ],
})
```

### Why Day-One

The cost of adding this interface now is ~2 days of work. The cost of retrofitting it
after 50+ call sites directly reference Proxmox is weeks of refactoring and regression
risk. Every cloud platform that supports multiple backends (Terraform, Kubernetes,
Crossplane) uses this pattern.

---

## 17. Reconciliation Engine & Self-Healing

### Problem

The GitOps flow (user action → Git commit → tofu apply) handles the happy path. But:
- What if someone modifies a VM directly in Proxmox?
- What if a node crashes and VMs are lost?
- What if a managed DB pod is evicted and doesn't reschedule?
- What if an OpenTofu apply partially fails?

### Solution: Controller Pattern

Inspired by Kubernetes controllers, each resource type has a **reconciler** that
periodically compares desired state (from Git/DB) with actual state (from hypervisor/K8s)
and takes corrective action.

```
┌─────────────────────────────────────────────────┐
│              Reconciliation Engine                │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ K8s Cluster  │  │ Postgres     │             │
│  │ Reconciler   │  │ Reconciler   │  ...        │
│  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                     │
│   ┌─────┴─────┐     ┌─────┴─────┐               │
│   │ Desired   │     │ Desired   │               │
│   │ State     │     │ State     │   (Git / DB)  │
│   └─────┬─────┘     └─────┬─────┘               │
│         │ compare          │ compare             │
│   ┌─────┴─────┐     ┌─────┴─────┐               │
│   │ Actual    │     │ Actual    │               │
│   │ State     │     │ State     │   (Proxmox /  │
│   └───────────┘     └───────────┘    K8s API)   │
│                                                  │
│   If drift detected:                             │
│     1. Log drift event                           │
│     2. Emit resource.drift_detected event        │
│     3. Auto-remediate (if policy allows)         │
│     4. Alert operator (if manual intervention)   │
└─────────────────────────────────────────────────┘
```

### Reconciliation Loop

For each resource type:

1. **Fetch desired state** from control-plane DB (or tenant Git repo)
2. **Fetch actual state** from the data plane (Proxmox API, K8s API, etc.)
3. **Compare** — compute diff (hash comparison for fast path, deep diff for details)
4. **Decide**:
   - No drift → update `last_reconciled_at`, sleep
   - Drift detected, auto-remediable → apply correction, emit event
   - Drift detected, manual only → alert operator, emit event
   - Resource missing → re-provision or mark as failed
5. **Rate limit** — don't hammer data plane APIs; exponential backoff on errors

### Reconciliation Policies (per resource type)

| Policy | Behavior |
|--------|----------|
| `auto-heal` | Automatically correct drift (default for managed services) |
| `alert-only` | Log and alert, don't modify (for tenant K8s clusters where user may have customized) |
| `ignore` | Don't reconcile (for resources the tenant explicitly manages) |

### Scheduling

- Default interval: every 5 minutes per resource
- Jitter to prevent thundering herd
- Immediate reconciliation on event (e.g., node failure detected)
- Configurable per resource type and per tenant

---

## 18. Tenant-Facing Terraform Provider & API SDKs

### Tenant-Facing Terraform/OpenTofu Provider

Just as AWS has `terraform-provider-aws` for their customers, Cloudify provides
`terraform-provider-cloudify` so tenants can manage their resources via IaC:

```hcl
terraform {
  required_providers {
    cloudify = {
      source  = "bsdimer/cloudify"
      version = "~> 1.0"
    }
  }
}

provider "cloudify" {
  endpoint = "https://api.cloud.example.com"
  api_key  = var.cloudify_api_key
}

resource "cloudify_kubernetes_cluster" "production" {
  name    = "prod-cluster"
  version = "1.30"

  node_pool {
    name       = "default"
    node_count = 3
    cpu        = 4
    memory_gb  = 16
    disk_gb    = 100
  }

  tags = {
    environment = "production"
    team        = "platform"
  }
}

resource "cloudify_postgres_instance" "main_db" {
  name       = "main-db"
  version    = "16"
  size       = "medium"
  storage_gb = 50
  backup_schedule = "0 2 * * *"

  tags = {
    environment = "production"
  }
}

resource "cloudify_dns_record" "api" {
  zone_id = cloudify_dns_zone.main.id
  name    = "api"
  type    = "A"
  value   = cloudify_kubernetes_cluster.production.ingress_ip
}

resource "cloudify_certificate" "api_cert" {
  domains = ["api.example.com"]
  auto_renew = true
}
```

**Implementation:** Written in Go (standard for Terraform providers), wraps the Cloudify
REST API. Published to the Terraform Registry.

**Resource types to support:**
- `cloudify_kubernetes_cluster`, `cloudify_kubernetes_node_pool`
- `cloudify_postgres_instance`, `cloudify_mongo_instance`, `cloudify_valkey_instance`
- `cloudify_storage_bucket`
- `cloudify_network`, `cloudify_subnet`, `cloudify_security_group`, `cloudify_security_group_rule`
- `cloudify_waf_policy`, `cloudify_ddos_profile`
- `cloudify_floating_ip`, `cloudify_load_balancer`
- `cloudify_dns_zone`, `cloudify_dns_record`
- `cloudify_certificate`
- `cloudify_secret`
- `cloudify_registry_project`

**Data sources:** `cloudify_kubernetes_versions`, `cloudify_regions`, `cloudify_plans`, etc.

### Auto-Generated API Client SDKs

From the OpenAPI spec, generate and publish client SDKs:

| Language | Package | Use Case |
|----------|---------|----------|
| TypeScript | `@cloudify/sdk` | Web apps, Node.js backends, CLI |
| Python | `cloudify-sdk` | Data science, automation scripts |
| Go | `cloudify-go-sdk` | Infrastructure tooling, Terraform provider |

Generated via `openapi-generator` in CI on every API change. Published to npm/PyPI/Go modules.

---

## 19. Webhook & Event Notification System

### How It Works

Tenants register webhook endpoints and subscribe to specific event types. When matching
events occur, the webhook service delivers HTTP POST requests to the registered URLs.

```
Event Bus (NATS)                 Webhook Service                  Tenant Endpoint
     │                                │                                │
     │  resource.created  ──────────► │                                │
     │                                ├── Match against subscriptions  │
     │                                ├── Sign payload (HMAC-SHA256)   │
     │                                ├── POST to tenant URL ─────────►│
     │                                │                                │
     │                                │   (if 2xx) ◄──── 200 OK ──────┤
     │                                │   Mark delivered               │
     │                                │                                │
     │                                │   (if 5xx or timeout)          │
     │                                │   Retry with exponential       │
     │                                │   backoff (max 5 attempts)     │
```

### Webhook API

- `POST /api/v1/webhooks` — register endpoint (URL, events, secret)
- `GET /api/v1/webhooks` — list endpoints
- `PATCH /api/v1/webhooks/:id` — update endpoint
- `DELETE /api/v1/webhooks/:id` — remove endpoint
- `GET /api/v1/webhooks/:id/deliveries` — delivery log (with payloads and status)
- `POST /api/v1/webhooks/:id/test` — send test event

### Payload Format

```json
{
  "id": "evt_abc123",
  "type": "resource.created",
  "timestamp": "2026-03-28T12:00:00Z",
  "tenant_id": "tenant_xyz",
  "data": {
    "resource_id": "k8s_cluster_456",
    "resource_type": "kubernetes_cluster",
    "name": "prod-cluster",
    "status": "running"
  }
}
```

**Signature:** `X-Cloudify-Signature: sha256=<HMAC of payload using webhook secret>`

### Subscribable Event Types

- `resource.*` — any resource lifecycle event
- `resource.created`, `resource.deleted`, `resource.failed`, `resource.health_changed`
- `certificate.issued`, `certificate.expiring`, `certificate.renewed`, `certificate.failed`
- `billing.invoice.generated`, `billing.payment.failed`
- `backup.completed`, `backup.failed`
- `firewall.blocked`, `firewall.threat_detected`, `firewall.waf_triggered`
- `security.login`, `security.api_key_created`

### Delivery Guarantees

- At-least-once delivery (tenants must handle duplicates via `event.id`)
- Exponential backoff: 10s, 30s, 2min, 10min, 1hr
- After 5 failed attempts → mark endpoint as unhealthy, alert tenant
- Delivery history retained for 30 days

---

## 20. Resource Tagging & Labeling

### Design

Every Cloudify resource supports user-defined key-value tags, similar to AWS tags or
GCP labels. Tags enable resource organization, cost allocation, and automation.

### Schema

```
ResourceTag
├── resource_id  (FK → Resource.id)
├── key          (varchar 128, lowercase alphanumeric + dashes)
├── value        (varchar 256)
└── (resource_id, key) = UNIQUE
```

- Max 50 tags per resource
- Keys are case-insensitive, stored lowercase
- System-reserved prefix: `cloudify:` (e.g., `cloudify:managed-by`, `cloudify:tenant`)

### API

- Tags are part of every resource's create/update payload:
  ```json
  { "name": "prod-cluster", "tags": { "environment": "production", "team": "backend" } }
  ```
- Filter resources by tag: `GET /api/v1/resources?tag.environment=production`
- Bulk tag operations: `POST /api/v1/tags/bulk` (add/remove tags across multiple resources)

### Use Cases

| Use Case | Example |
|----------|---------|
| Cost allocation | `cost-center: engineering` → filter billing by tag |
| Environment separation | `environment: staging` vs `environment: production` |
| Automation | Webhook triggers based on tag presence |
| Access control (future) | Tag-based policies: "team X can only manage resources tagged `team: x`" |
| Plugin metadata | Plugins can attach metadata via tags |

---

## 21. Backup-as-a-Service & Disaster Recovery

### Tenant Resource Backup

Unified backup service that orchestrates backups across all resource types:

| Resource Type | Backup Method | Storage Target |
|---------------|--------------|----------------|
| K8s cluster | Velero (cluster state + PVs) | MinIO |
| PostgreSQL | WAL-G continuous archiving + base backups | MinIO |
| MongoDB | mongodump (logical) + filesystem snapshots | MinIO |
| Valkey | RDB snapshots | MinIO |
| MinIO buckets | Cross-bucket replication + versioning | Secondary MinIO / remote |
| DNS zones | Zone file export | Git (tenant repo) |
| Secrets | Vault snapshot | Encrypted MinIO |
| Certificates | Cert + key export (encrypted) | Vault |

### Backup API

- `POST /api/v1/backups` — trigger on-demand backup for a resource
- `GET /api/v1/backups` — list backups (filterable by resource, date, status)
- `POST /api/v1/backups/:id/restore` — restore from backup
- `GET /api/v1/backup-policies` — list backup schedules
- `PUT /api/v1/backup-policies/:resource_id` — set backup schedule and retention

### Backup Policies

- **RPO (Recovery Point Objective)**: configurable per resource (e.g., 1 hour, 24 hours)
- **Retention**: configurable (e.g., keep 7 daily + 4 weekly + 12 monthly)
- **Cross-site replication** (future): replicate backups to a remote MinIO cluster

### Control-Plane Disaster Recovery

**This is critical.** If the control plane is lost, the entire platform is unrecoverable
without a DR plan.

**Control-plane components to back up:**

| Component | Backup Strategy | Frequency |
|-----------|----------------|-----------|
| Postgres (CP DB) | pg_basebackup + WAL archiving to external storage | Continuous WAL, hourly base |
| Vault | `vault operator raft snapshot` | Every 6 hours |
| Gitea | Git bundle of all repos + Gitea DB dump | Daily |
| NATS JetStream | Stream snapshots | Daily |
| Certificates (internal PKI) | Vault backup covers this | Via Vault |
| Configuration files | Versioned in Git (infra repo) | On change |

**Recovery procedure (documented and tested quarterly):**

1. Provision fresh control-plane machines
2. Run `install.sh` with `--restore` flag
3. Restore Postgres from backup
4. Restore Vault from snapshot, unseal
5. Restore Gitea repos from bundles
6. Restore NATS streams
7. Reconciler detects all resources and validates state against data plane
8. Platform operational

**RTO target:** < 2 hours for full control-plane recovery

---

## 22. Observability-as-a-Service

### Why This Is Table Stakes

Every cloud platform (AWS CloudWatch, GCP Cloud Monitoring) provides per-tenant
observability. Without it, tenants are blind — they'll open support tickets for every
issue instead of self-diagnosing.

### Architecture

```
Tenant K8s Cluster / Managed Services
     │
     ├── Prometheus (per-tenant, lightweight)
     │   └── Scrapes: pods, services, node-exporter, DB exporters
     │
     ├── Promtail / Alloy (log shipper)
     │   └── Ships to: Loki (multi-tenant, label-based isolation)
     │
     └── OpenTelemetry Collector (optional, for traces)
         └── Ships to: Tempo (multi-tenant)

                    ▼

Shared Observability Stack (Control Plane)
├── Mimir or Thanos (long-term Prometheus storage, multi-tenant)
├── Loki (log aggregation, multi-tenant)
├── Tempo (distributed tracing, multi-tenant, optional)
└── Grafana (multi-tenant, org-per-tenant, embedded in portal)
```

### Features

- **Metrics**: CPU, memory, disk, network for all resources; DB-specific metrics
  (queries/sec, connections, replication lag); K8s metrics (pod status, resource usage)
- **Logs**: Container logs, system logs, managed service logs — searchable, filterable
- **Dashboards**: Pre-built Grafana dashboards per resource type, embedded in web portal
  via iframe or Grafana embedding API
- **Alerts**: Tenant-configurable alert rules (e.g., "CPU > 80% for 5 min") with
  notification channels (email, webhook, Slack)
- **Retention**: Configurable per plan (e.g., 7 days on Starter, 90 days on Enterprise)

### Integration with Web Portal

The tenant portal embeds Grafana dashboards directly:
- Each tenant gets a Grafana organization (auto-provisioned)
- SSO from portal → Grafana via OAuth/proxy auth
- Datasources pre-configured (tenant's Prometheus, Loki)
- Dashboards auto-provisioned per resource type

---

## 23. API Resilience Patterns

### Idempotency

All mutating API endpoints accept an `Idempotency-Key` header:

1. Client sends `POST /api/v1/clusters` with `Idempotency-Key: <uuid>`
2. API gateway checks `IdempotencyKey` table — if found, return cached response
3. If not found, process request, store response with key (TTL: 24 hours)
4. On retry (same key), return cached response without re-executing

This is **mandatory** for all resource creation and mutation endpoints.

### Circuit Breaker

Each service-to-service call (and external API call) is wrapped in a circuit breaker:

```
States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)

CLOSED:  Requests flow normally. Failures are counted.
         If failure rate > threshold (50%) in window (30s) → OPEN

OPEN:    All requests immediately fail with 503.
         After timeout (60s) → HALF_OPEN

HALF_OPEN: Allow 1 probe request.
           If success → CLOSED
           If failure → OPEN
```

Implementation: `opossum` (Node.js circuit breaker library) or custom NestJS interceptor.

### Retry with Backoff

For transient failures (network timeout, 502/503/504):

- Max 3 retries
- Exponential backoff: 100ms, 500ms, 2s (with jitter)
- Only retry idempotent operations (GET, or POST with idempotency key)

### Bulkhead

Isolate resource pools per service to prevent cascade:

- Separate connection pools: Postgres, Redis, NATS, HTTP clients
- Per-tenant rate limiting at the service level (not just API gateway)
- Timeout on every external call (no unbounded waits)

### Health Checks

Every service exposes:

- `GET /health` — liveness (process is running)
- `GET /ready` — readiness (can serve traffic — DB connected, NATS connected, etc.)
- Dependencies checked: DB ping, NATS connection, Vault reachable, Proxmox API reachable

### Graceful Degradation

If a non-critical service is down, the platform should degrade gracefully:

| Failing Service | Impact | Degradation |
|----------------|--------|-------------|
| Billing | No new invoices | Resource operations continue; billing catches up on recovery |
| Webhooks | No notifications | Events queue in NATS; delivered when service recovers |
| Certificates | No new certs / renewals | Existing certs work; renewal retries on recovery |
| Observability | No new metrics/logs | Resources continue operating; monitoring backfills |
| Reconciler | No drift detection | Resources work but drift isn't caught until recovery |
| DNS | No record updates | Existing records serve; updates queue until recovery |

---

## 24. Firewall, WAF & DDoS Protection

### Overview

Cloudify provides **three layers of protection** for tenant services, managed
centrally via the Firewall Service and configurable per-tenant through API and UI:

```
                        INTERNET
                           │
                           ▼
            ┌──────────────────────────┐
            │  LAYER 1: Edge (LB Nodes)│
            │                          │
            │  CrowdSec ── DDoS, bots, │
            │              IP reputation│
            │              geo-blocking │
            │                          │
            │  Coraza WAF ── OWASP CRS,│
            │               custom L7  │
            │               rules      │
            │                          │
            │  HAProxy ── L4 ACLs,     │
            │             rate limits  │
            └────────────┬─────────────┘
                         │
            ┌────────────┴─────────────┐
            │  LAYER 2: SDN (OVN)      │
            │                          │
            │  Security Groups ──      │
            │    L3/L4 ACLs per port   │
            │    (protocol, port, CIDR)│
            │                          │
            │  Applied at VM/container │
            │  network interface level │
            └────────────┬─────────────┘
                         │
            ┌────────────┴─────────────┐
            │  LAYER 3: K8s (Cilium)   │
            │                          │
            │  NetworkPolicy ──        │
            │    Pod-to-pod L3/L4      │
            │    Namespace isolation   │
            │                          │
            │  CiliumNetworkPolicy ──  │
            │    L7 rules (HTTP path,  │
            │    method, header match) │
            │    DNS-aware policies    │
            └──────────────────────────┘
```

### Layer 1: Edge Protection (HAProxy + Coraza + CrowdSec)

The **first line of defense** — runs on the dedicated LB nodes, before traffic
reaches any tenant infrastructure.

#### Coraza WAF (L7 Web Application Firewall)

[Coraza](https://coraza.io/) is a modern, high-performance, open-source WAF engine:
- Written in Go, Apache-2.0 licensed
- Fully compatible with OWASP Core Rule Set (CRS) 4.x
- Runs as an HAProxy SPOE (Stream Processing Offload Engine) filter — inspects
  requests in-band without adding a separate proxy hop
- Sub-millisecond evaluation for most rules

**Per-tenant WAF configuration:**

```
WAF Policy
├── mode: "detection" | "prevention"         ← Log-only vs active blocking
├── paranoia_level: 1-4                      ← OWASP CRS sensitivity (1=low FP, 4=strict)
├── enabled_rule_groups:
│   ├── REQUEST-920-PROTOCOL-ENFORCEMENT     ← Protocol violations
│   ├── REQUEST-930-APPLICATION-ATTACK-LFI   ← Local file inclusion
│   ├── REQUEST-931-APPLICATION-ATTACK-RFI   ← Remote file inclusion
│   ├── REQUEST-932-APPLICATION-ATTACK-RCE   ← Remote code execution
│   ├── REQUEST-933-APPLICATION-ATTACK-PHP   ← PHP injection
│   ├── REQUEST-941-APPLICATION-ATTACK-XSS   ← Cross-site scripting
│   ├── REQUEST-942-APPLICATION-ATTACK-SQLI  ← SQL injection
│   ├── REQUEST-943-APPLICATION-ATTACK-FIXATION ← Session fixation
│   └── REQUEST-944-APPLICATION-ATTACK-JAVA  ← Java-specific attacks
├── disabled_rules: [942100, 942200]         ← Per-rule exceptions (reduce FPs)
├── custom_rules:                            ← Tenant-defined rules
│   └── { match: "URI contains /admin",
│         action: "deny",
│         source: "!10.0.0.0/8" }
├── ip_whitelist: ["203.0.113.0/24"]         ← Skip WAF for trusted sources
└── rate_limits:                             ← Per-endpoint rate limiting
    └── { path: "/api/login", limit: "10/minute", action: "block" }
```

**How per-tenant rules are enforced at the edge:**

1. Firewall Service generates Coraza config snippets per tenant
2. HAProxy routes traffic based on tenant domain/SNI
3. SPOE filter loads the tenant-specific Coraza config
4. Request evaluated: allow / log / block
5. Blocked requests return 403 with configurable error page
6. All decisions logged and shipped to tenant's observability stack

#### CrowdSec (DDoS & Threat Intelligence)

[CrowdSec](https://www.crowdsec.net/) provides collaborative, real-time threat
detection:
- Open-source (MIT), lightweight agent + central API
- Community-driven IP reputation database (millions of malicious IPs)
- Behavioral detection: brute force, credential stuffing, scanning, DDoS patterns
- Runs on each LB node, shares decisions across the cluster

**Per-tenant DDoS profile:**

```
DDoS Profile
├── rate_limits:
│   ├── global: 10000 req/min                ← Total request rate per tenant
│   ├── per_ip: 500 req/min                  ← Per source IP
│   └── per_endpoint: { "/api/*": 100/min }  ← Per path pattern
├── geo_blocking:
│   ├── mode: "allowlist" | "blocklist"
│   └── countries: ["CN", "RU"]              ← ISO 3166-1 alpha-2
├── bot_protection:
│   ├── mode: "detection" | "prevention"
│   ├── challenge_type: "js_challenge"       ← JavaScript challenge for suspicious clients
│   └── known_bots: "allow"                  ← Allow Googlebot, etc.
├── ip_reputation:
│   ├── crowdsec_blocklist: true             ← Auto-block known-bad IPs
│   └── custom_blocklist: ["198.51.100.0/24"]
└── response:
    ├── block_status: 429                    ← HTTP status for rate-limited requests
    └── captcha_page: "<custom HTML>"        ← Optional CAPTCHA challenge page
```

**CrowdSec integration flow:**

1. CrowdSec agent on LB nodes analyzes access logs in real-time
2. Detects attack patterns (volumetric, credential stuffing, path scanning)
3. Shares decisions with local bouncer (HAProxy plugin) — blocks at L4/L7
4. Reports to CrowdSec Central API — shares intelligence with community
5. Receives community block decisions — preemptive protection
6. Firewall Service queries CrowdSec Local API for per-tenant threat reports

### Layer 2: Network Firewall (OVN Security Groups)

L3/L4 firewall at the SDN level — applied to every VM and container network port.

**Security Group model:**

```
Security Group
├── id, name, tenant_id, description
├── default_policy: "deny-all" | "allow-all"   ← Default: deny all inbound
└── rules:
    ├── Rule 1: { direction: "inbound",  protocol: "tcp", port: 443,
    │             source: "0.0.0.0/0",   action: "allow", priority: 100 }
    ├── Rule 2: { direction: "inbound",  protocol: "tcp", port: 22,
    │             source: "10.0.1.0/24", action: "allow", priority: 200 }
    ├── Rule 3: { direction: "outbound", protocol: "any", port: "any",
    │             dest: "0.0.0.0/0",     action: "allow", priority: 100 }
    └── Rule N: ...
```

- **Applied at**: OVN logical switch port level (per-VM, per-container)
- **Stateful**: OVN conntrack — return traffic automatically allowed
- **Default**: deny all inbound, allow all outbound (like AWS default SG)
- **Multiple SGs per resource**: rules merge with most-permissive-wins for allow
- **Reference other SGs**: "allow inbound from SG `db-clients`" (group-based rules)

**API:**

- `POST /api/v1/firewall/security-groups` — create security group
- `GET /api/v1/firewall/security-groups` — list security groups
- `PUT /api/v1/firewall/security-groups/:id` — update (add/remove rules)
- `DELETE /api/v1/firewall/security-groups/:id` — delete
- `POST /api/v1/firewall/security-groups/:id/attach` — attach to resource
- `POST /api/v1/firewall/security-groups/:id/detach` — detach from resource

**Pre-built templates:**

| Template | Description |
|----------|------------|
| `web-server` | Allow 80, 443 inbound from anywhere |
| `database` | Allow 5432/3306/27017 inbound from private subnets only |
| `ssh-restricted` | Allow 22 inbound from a specific CIDR |
| `internal-only` | Allow all inbound from tenant's VPC, deny public |
| `allow-all` | Allow all (for development environments) |

### Layer 3: In-Cluster Network Policies (Cilium)

For tenant Kubernetes clusters, Cilium provides pod-level network policies:

- **Standard K8s NetworkPolicy**: L3/L4 pod-to-pod rules (namespace, label selectors)
- **CiliumNetworkPolicy** (extended): L7 rules — HTTP method, path, header matching;
  DNS-aware policies (allow egress only to `*.example.com`); identity-based policies
- Cilium manages these natively — tenants configure via K8s YAML in their clusters
- Cloudify pre-installs **default policies** on managed K8s clusters:
  - Deny all inter-namespace traffic by default
  - Allow DNS (kube-dns) from all pods
  - Allow egress to tenant's managed services (Postgres, Mongo, Valkey, MinIO)

### Firewall Service API — Unified Interface

The Firewall Service (`packages/services/firewall`) provides a single API that manages
rules across all three layers:

```
POST /api/v1/firewall/security-groups          ← L3/L4 (OVN ACLs)
POST /api/v1/firewall/waf-policies             ← L7 WAF (Coraza rules)
POST /api/v1/firewall/ddos-profiles            ← DDoS / rate / geo (CrowdSec)
GET  /api/v1/firewall/events                   ← Unified log of all blocked requests
GET  /api/v1/firewall/threats                  ← Active threats & attack summary
```

**Firewall events** are emitted to NATS (`cloudify.firewall.*`) and available:
- In the tenant's observability dashboard (Grafana)
- Via webhooks (if subscribed to `firewall.blocked`, `firewall.threat_detected`)
- In the audit log

### Tenant-Facing Terraform Resources

```hcl
resource "cloudify_security_group" "web" {
  name = "web-servers"

  rule {
    direction = "inbound"
    protocol  = "tcp"
    port      = 443
    source    = "0.0.0.0/0"
    action    = "allow"
  }
}

resource "cloudify_waf_policy" "main" {
  name           = "production-waf"
  mode           = "prevention"
  paranoia_level = 2

  enabled_rule_groups = [
    "REQUEST-941-APPLICATION-ATTACK-XSS",
    "REQUEST-942-APPLICATION-ATTACK-SQLI",
    "REQUEST-932-APPLICATION-ATTACK-RCE",
  ]

  custom_rule {
    description = "Block admin panel from public"
    match       = "URI beginsWith /admin"
    source      = "!10.0.0.0/8"
    action      = "deny"
  }
}

resource "cloudify_ddos_profile" "main" {
  name = "production-ddos"

  rate_limit {
    global = 10000
    per_ip = 500
  }

  geo_blocking {
    mode      = "blocklist"
    countries = ["CN", "RU"]
  }

  bot_protection {
    mode = "prevention"
  }
}
```

### Billing for Firewall & WAF

| Feature | Pricing Model |
|---------|--------------|
| L3/L4 Security Groups | Free (included with all resources) |
| WAF (OWASP CRS basic) | Included in Pro/Enterprise plans |
| WAF (custom rules) | Per-rule or per-policy pricing |
| DDoS protection (basic rate limiting) | Included in all plans |
| DDoS protection (advanced: geo, bot challenge) | Enterprise plan or add-on |
| WAF request inspection | Metered: per 10K inspected requests (optional) |

---

## 25. Technology Stack Summary

### Backend (Control Plane)

| Component | Technology |
|-----------|-----------|
| API Gateway & Services | NestJS (TypeScript) |
| Inter-service communication | NATS JetStream (events, commands, request-reply) |
| Control-plane database | PostgreSQL 16+ |
| Job queue / cache | Valkey (Redis-compatible) |
| IaC engine | OpenTofu |
| Git hosting (tenant repos) | Gitea / Forgejo |
| Secret management | HashiCorp Vault or OpenBao |
| DNS server | PowerDNS |
| Certificate management | ACME v2 (node-acme-client or Lego) + Let's Encrypt |
| Internal PKI | Vault PKI engine or step-ca |
| Object storage | MinIO |
| Artifact registry | Harbor |
| Monitoring | Prometheus + Grafana + Mimir (long-term) |
| Logging | Loki + Promtail / Grafana Alloy |
| Tracing (optional) | Tempo (OpenTelemetry) |
| Circuit breaker | opossum (Node.js) |
| Reverse proxy / TLS | Traefik or Nginx |
| Tenant-facing IaC | terraform-provider-cloudify (Go) |
| API SDK generation | openapi-generator (TS, Python, Go) |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 18+ (TypeScript) |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Component library | Shadcn/ui (customized) |
| State management | TanStack Query + Zustand |
| Charts | Recharts or Tremor |
| Forms | React Hook Form + Zod |
| Routing | React Router v6+ |

### Data Plane

| Component | Technology |
|-----------|-----------|
| Hypervisor abstraction | HypervisorProvider interface (packages/hypervisor) |
| Hypervisor (primary) | Proxmox VE (KVM) |
| Hypervisor (future) | VMware vSphere |
| SDN | OVN via Proxmox SDN |
| Kubernetes bootstrap | kubeadm + cloud-init |
| K8s CNI | Cilium |
| K8s CSI | Proxmox CSI driver |
| K8s ingress | Nginx Ingress Controller or Envoy |
| Load balancing | Keepalived + HAProxy |
| WAF (L7) | Coraza (OWASP CRS) via HAProxy SPOE |
| DDoS / threat intel | CrowdSec (agent + bouncer on LB nodes) |
| L3/L4 firewall | OVN ACLs (Security Groups) |
| In-cluster L3-L7 | Cilium NetworkPolicy + CiliumNetworkPolicy |
| Managed Postgres | CloudNativePG operator |
| Managed MongoDB | MongoDB Community Operator |
| Managed Valkey | Custom operator or Helm-based |
| Tenant backups (K8s) | Velero |
| Tenant observability | Prometheus + Loki + Grafana (per-tenant org) |

### DevOps & Tooling

| Component | Technology |
|-----------|-----------|
| Monorepo | Nx |
| CI/CD | GitHub Actions |
| Container registry | GitHub Container Registry (ghcr.io) |
| Deployment (Day-1) | Docker Compose |
| Deployment (Day-2) | Helm |
| Testing | Jest (unit), Supertest (API), Playwright (E2E) |
| Documentation | Docusaurus or MkDocs |

---

## 26. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Scope creep — too many services before core is stable | High | High | Strict phase gates; launch K8s + 1 DB before adding more |
| OVN/SDN complexity — networking bugs are hard to debug | High | Medium | Start with Proxmox SDN (simpler), invest in network integration tests |
| OpenTofu state corruption | High | Low | State locking (Postgres backend), regular state backups, import/recovery tooling |
| Proxmox API gaps — not all operations are API-exposed | Medium | Medium | Audit Proxmox API coverage early; fallback to SSH/CLI wrappers where needed |
| Single contributor bottleneck | High | High | Document everything, modular architecture, encourage community early |
| Security incident (tenant isolation breach) | Critical | Low | Defense in depth: SDN isolation + namespace isolation + RBAC + audit logging |
| Performance at scale (100+ tenants) | Medium | Medium | Load test each phase; horizontal scaling for stateless services |
| Let's Encrypt rate limits hit at scale | Medium | Medium | Track issuance per domain, batch renewals, use multiple ACME accounts, add ZeroSSL/BuyPass as fallback CAs |
| Event bus becomes SPOF | High | Low | NATS JetStream clustering (3-node), persistent storage, fallback to Redis Streams for degraded mode |
| Control-plane total loss with no DR | Critical | Low | Automated backups every 6h, documented recovery runbook, quarterly DR drills |
| Open-source sustainability | Medium | Medium | Clear governance, contributor guide, consider sponsorship/support model |

---

## 27. Open Questions & Future Work

### Open Questions

1. **License choice** — Apache-2.0 (permissive) vs AGPL (copyleft, protects SaaS use)?
2. **Multi-region** — Single datacenter initially, but should the data model support
   regions from day one? (Recommendation: yes — add `region` column to Resource table now,
   default to a single region. Cost is one column; cost of retrofitting is a migration.)
3. **VM service** — Should Cloudify also offer raw VMs (not just K8s) as a managed
   resource? (Likely yes, but deprioritized after K8s.)
4. **Terraform state backend** — Postgres (pg backend) vs S3 (MinIO) vs Consul?
5. ~~**Event bus** — NATS vs Redis Streams?~~ **RESOLVED:** NATS JetStream. See
   [Section 15](#15-event-driven-architecture--service-communication).
6. ~~**Hypervisor abstraction** — Build from day one or hardcode Proxmox?~~ **RESOLVED:**
   Day one. See [Section 16](#16-hypervisor-abstraction-layer).
7. **Pricing model** — Should the open-source project include billing, or is that a
   "commercial add-on"?

### Future Work (Post-MVP)

- **VMware support** — Second hypervisor provider (interface already exists)
- **Bare-metal provisioning** — MAAS or Tinkerbell integration
- **Serverless / Functions-as-a-Service** — Knative on tenant K8s
- **CI/CD service** — Integrated pipeline runner (Gitea Actions, Tekton)
- **Multi-datacenter / federation** — Control plane manages resources across sites
- **Marketplace** — Tenant-facing app marketplace (one-click WordPress, etc.)
- **Compliance module** — GDPR data residency tracking, SOC2 audit trail, data
  classification labels on resources
- **Tag-based access control** — ABAC policies: "users with role X can only manage
  resources tagged `team: Y`"
- **Mobile app** — Companion iOS/Android app for alerts and quick actions
- **VPN-as-a-Service** — WireGuard endpoints for tenant site-to-site connectivity
- **gRPC API** — High-performance programmatic access alongside REST
- **Multi-tenancy within tenants** — Sub-accounts / projects (like GCP projects within
  an organization)
- **FinOps features** — Cost anomaly detection, budget alerts, right-sizing recommendations

---

## Phase Roadmap Summary

```
Phase 0 — Foundations                    [Weeks 1–6]
  Monorepo, auth, tenant model, DB schema, GitOps skeleton

Phase 1 — Core Compute & Networking     [Weeks 7–18]
  Proxmox integration, managed K8s, SDN, IPAM, load balancers

Phase 2 — Managed Services              [Weeks 12–22]  (overlaps with Phase 1)
  Postgres, MongoDB, Valkey, MinIO (object storage)

Phase 3 — Platform Services             [Weeks 18–28]
  DNS, SSL/TLS certificates (Let's Encrypt), secret manager, artifact registry

Phase 4 — Web UI                        [Weeks 6–20]   (parallel track from Phase 0)
  Tenant portal, admin dashboard, real-time updates

Phase 5 — Billing & Quotas              [Weeks 20–28]
  Metering, pricing engine, invoicing, quota enforcement

Phase 6 — Plugin System                 [Weeks 24–32]
  SDK, plugin host, extension points, example plugins

Phase 7 — Installation & Operations     [Weeks 28–34]
  install.sh, Docker Compose stack, monitoring, backup

Phase 8 — Hardening & GA                [Weeks 30–38]
  Security audit, perf testing, documentation, release

                                         ─────────────
                                         ~9–10 months to MVP
```

> **Note:** Phases overlap significantly. The UI track runs in parallel with backend
> work. Some phases (like billing) can start earlier in simplified form. A single
> experienced developer can realistically deliver Phase 0 + Phase 1 (partial) + Phase 4
> (skeleton) in 3–4 months. Community contributions accelerate everything after that.

---

*This document is a living plan. Update it as decisions are made and scope evolves.*
