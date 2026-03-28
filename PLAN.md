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
15. [Technology Stack Summary](#15-technology-stack-summary)
16. [Risk Register](#16-risk-register)
17. [Open Questions & Future Work](#17-open-questions--future-work)

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
- **Extensibility over monolith.** Every managed service is a plugin. Third parties can
  contribute new service types without forking the core.
- **Simple installation.** Day-1 setup is a single bash script that pulls a
  `docker-compose` stack. Day-2 graduates to Helm on a dedicated management K8s cluster.
- **Open source (Apache-2.0 or similar).** Community-driven, vendor-neutral.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / BGP EDGE                         │
│                                                                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                        │
│   │ LB Node 1│  │ LB Node 2│  │ LB Node N│  ← Keepalived VRRP    │
│   │ (HAProxy)│  │ (HAProxy)│  │ (HAProxy)│    Real IP pool         │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘                        │
│        └──────────┬───┘─────────────┘                              │
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
        │  │ │ Storage Svc  │ │  │  — MinIO, block volumes
        │  │ │ DB Svc       │ │  │  — Postgres, Mongo, Valkey operators
        │  │ │ Certs Svc    │ │  │  — SSL/TLS issuance, ACME, renewal
        │  │ │ Secrets Svc  │ │  │  — Vault / sealed-secrets bridge
        │  │ │ Registry Svc │ │  │  — Artifact registry (Harbor)
        │  │ │ Billing Svc  │ │  │  — Metering, invoices, payments
        │  │ │ GitOps Svc   │ │  │  — Per-tenant repo sync, OpenTofu
        │  │ │ Plugin Host  │ │  │  — Extension runtime
        │  │ └─────────────┘ │  │
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

| Decision                                | Rationale                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Control plane on **separate machines**  | Tenant workload failures or resource spikes cannot degrade the management layer.                                    |
| **NestJS** backend (TypeScript)         | Strong typing, decorator-based DI, built-in microservice transports (NATS, Redis, gRPC), large ecosystem.           |
| **React** frontend                      | Mature component ecosystem, strong community, good fit for complex dashboards.                                      |
| **OpenTofu** for tenant IaC             | Open-source Terraform fork; declarative, plan/apply model, provider ecosystem.                                      |
| **Per-tenant Git repo** (Gitea/Forgejo) | Auditable history, easy rollback via `git revert`, GitOps-friendly.                                                 |
| **Proxmox first**, VMware later         | Proxmox is free, API-rich, KVM-based. VMware adds enterprise compat.                                                |
| **OVN** for SDN                         | Production-grade, supports overlays (Geneve/VXLAN), distributed routing, ACLs, native integration with KVM/Proxmox. |
| **Keepalived + HAProxy** for LB         | Battle-tested HA with VRRP, real IP preservation, L4/L7 capable.                                                    |

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
│   │   ├── storage/                 ← NestJS — MinIO, block volumes
│   │   ├── database/                ← NestJS — Postgres, Mongo, Valkey operators
│   │   ├── certificates/             ← NestJS — SSL/TLS issuance & renewal (ACME)
│   │   ├── secrets/                 ← NestJS — Vault / K8s secrets bridge
│   │   ├── registry/                ← NestJS — Artifact registry management
│   │   ├── billing/                 ← NestJS — Metering, invoices, payments
│   │   └── gitops/                  ← NestJS — Tenant repo sync, OpenTofu runner
│   │
│   ├── plugin-sdk/                  ← TypeScript SDK for extension authors
│   ├── common/                      ← Shared types, DTOs, utils
│   │
│   ├── web-portal/                  ← React — Tenant self-service UI
│   ├── web-admin/                   ← React — ISP admin dashboard
│   │
│   └── cli/                         ← CLI tool (like gcloud / aws cli)
│
├── providers/
│   ├── proxmox/                     ← OpenTofu provider wrapper / API client
│   └── vmware/                      ← Future: VMware provider
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
│   │   └── certificate/
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
- **Resource** — id, tenant_id, type (enum), provider_id, status, spec (JSONB), created_at
- **AuditLog** — id, tenant_id, user_id, action, resource_id, diff (JSONB), timestamp
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
- Request/response logging → audit log
- OpenAPI (Swagger) auto-generation
- WebSocket gateway for real-time resource status updates

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

---

## 5. Phase 1 — Core Compute & Networking

**Goal:** Provision VMs and Kubernetes clusters on Proxmox inside tenant-isolated networks.

**Duration estimate:** 8–12 weeks

### 5.1 Proxmox Integration Layer

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

**Per-tenant (inside SDN):**

- MetalLB or kube-vip inside tenant K8s clusters
- Allocates IPs from tenant's assigned public IP sub-pool
- Integrates with external HAProxy for ingress routing

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

| Consumer                   | How cert is delivered                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Edge HAProxy LBs           | Cert written to shared storage or pushed via HAProxy Data Plane API; HAProxy reloads without downtime (hitless reload) |
| Tenant K8s ingress         | cert-manager CRDs synced via External Secrets Operator, or Cloudify cert controller watches Certificate resources      |
| Managed Postgres           | SSL cert injected into instance config, connection string updated                                                      |
| Managed MinIO              | HTTPS endpoint cert updated, MinIO restarted gracefully                                                                |
| Artifact Registry (Harbor) | Registry endpoint cert updated                                                                                         |

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
- Firewall rules editor (security groups)
- IP address management: allocate, release, assign floating IPs
- Load balancer management: create, configure backends, health checks
- DNS zone editor: visual record management, import zone file

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
│   ├── firewall.tf       ← Security group rules
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

| Object                      | Description                                                |
| --------------------------- | ---------------------------------------------------------- |
| VPC (Virtual Private Cloud) | Logical container for all tenant networks                  |
| Subnet                      | IP range within a VPC, mapped to an OVN logical switch     |
| Router                      | OVN logical router connecting subnets                      |
| Security Group              | Set of ACL rules applied to ports                          |
| Floating IP                 | Public IP DNATed to a private IP                           |
| NAT Gateway                 | SNAT for outbound internet from private subnets            |
| Peering                     | Cross-tenant or cross-VPC route exchange (explicit opt-in) |
| VPN Gateway                 | WireGuard endpoint for site-to-site connectivity (future)  |

### Integration with Proxmox SDN

Proxmox 8+ includes SDN support with OVN as a backend:

- Zones, VNets, and Subnets configurable via Proxmox API
- VMs attach to VNets at creation time
- Cloudify network service uses the Proxmox SDN API to create/manage these objects
- This avoids needing to manage OVN directly in early phases

---

## 15. Technology Stack Summary

### Backend (Control Plane)

| Component                   | Technology                                         |
| --------------------------- | -------------------------------------------------- |
| API Gateway & Services      | NestJS (TypeScript)                                |
| Inter-service communication | NATS or Redis Streams                              |
| Control-plane database      | PostgreSQL 16+                                     |
| Job queue / cache           | Valkey (Redis-compatible)                          |
| IaC engine                  | OpenTofu                                           |
| Git hosting (tenant repos)  | Gitea / Forgejo                                    |
| Secret management           | HashiCorp Vault or OpenBao                         |
| DNS server                  | PowerDNS                                           |
| Certificate management      | ACME v2 (node-acme-client or Lego) + Let's Encrypt |
| Internal PKI                | Vault PKI engine or step-ca                        |
| Object storage              | MinIO                                              |
| Artifact registry           | Harbor                                             |
| Monitoring                  | Prometheus + Grafana                               |
| Logging                     | Loki + Promtail (or ELK)                           |
| Reverse proxy / TLS         | Traefik or Nginx                                   |

### Frontend

| Component         | Technology               |
| ----------------- | ------------------------ |
| Framework         | React 18+ (TypeScript)   |
| Build tool        | Vite                     |
| Styling           | Tailwind CSS             |
| Component library | Shadcn/ui (customized)   |
| State management  | TanStack Query + Zustand |
| Charts            | Recharts or Tremor       |
| Forms             | React Hook Form + Zod    |
| Routing           | React Router v6+         |

### Data Plane

| Component            | Technology                         |
| -------------------- | ---------------------------------- |
| Hypervisor           | Proxmox VE (KVM) → VMware (future) |
| SDN                  | OVN via Proxmox SDN                |
| Kubernetes bootstrap | kubeadm + cloud-init               |
| K8s CNI              | Cilium                             |
| K8s CSI              | Proxmox CSI driver                 |
| K8s ingress          | Nginx Ingress Controller or Envoy  |
| Load balancing       | Keepalived + HAProxy               |
| Managed Postgres     | CloudNativePG operator             |
| Managed MongoDB      | MongoDB Community Operator         |
| Managed Valkey       | Custom operator or Helm-based      |

### DevOps & Tooling

| Component          | Technology                                     |
| ------------------ | ---------------------------------------------- |
| Monorepo           | Nx                                             |
| CI/CD              | GitHub Actions                                 |
| Container registry | GitHub Container Registry (ghcr.io)            |
| Deployment (Day-1) | Docker Compose                                 |
| Deployment (Day-2) | Helm                                           |
| Testing            | Jest (unit), Supertest (API), Playwright (E2E) |
| Documentation      | Docusaurus or MkDocs                           |

---

## 16. Risk Register

| Risk                                                   | Impact   | Likelihood | Mitigation                                                                                                 |
| ------------------------------------------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Scope creep — too many services before core is stable  | High     | High       | Strict phase gates; launch K8s + 1 DB before adding more                                                   |
| OVN/SDN complexity — networking bugs are hard to debug | High     | Medium     | Start with Proxmox SDN (simpler), invest in network integration tests                                      |
| OpenTofu state corruption                              | High     | Low        | State locking (Postgres backend), regular state backups, import/recovery tooling                           |
| Proxmox API gaps — not all operations are API-exposed  | Medium   | Medium     | Audit Proxmox API coverage early; fallback to SSH/CLI wrappers where needed                                |
| Single contributor bottleneck                          | High     | High       | Document everything, modular architecture, encourage community early                                       |
| Security incident (tenant isolation breach)            | Critical | Low        | Defense in depth: SDN isolation + namespace isolation + RBAC + audit logging                               |
| Performance at scale (100+ tenants)                    | Medium   | Medium     | Load test each phase; horizontal scaling for stateless services                                            |
| Let's Encrypt rate limits hit at scale                 | Medium   | Medium     | Track issuance per domain, batch renewals, use multiple ACME accounts, add ZeroSSL/BuyPass as fallback CAs |
| Open-source sustainability                             | Medium   | Medium     | Clear governance, contributor guide, consider sponsorship/support model                                    |

---

## 17. Open Questions & Future Work

### Open Questions

1. **License choice** — Apache-2.0 (permissive) vs AGPL (copyleft, protects SaaS use)?
2. **Multi-region** — Single datacenter initially, but should the data model support
   regions from day one?
3. **VM service** — Should Cloudify also offer raw VMs (not just K8s) as a managed
   resource? (Likely yes, but deprioritized after K8s.)
4. **Terraform state backend** — Postgres (pg backend) vs S3 (MinIO) vs Consul?
5. **Event bus** — NATS (lightweight, built for this) vs Redis Streams (already in stack)?
6. **Hypervisor abstraction** — Build a provider interface from day one (to ease VMware
   addition) or hardcode Proxmox first?
7. **Pricing model** — Should the open-source project include billing, or is that a
   "commercial add-on"?

### Future Work (Post-MVP)

- **VMware support** — Second hypervisor provider
- **Bare-metal provisioning** — MAAS or Tinkerbell integration
- **Serverless / Functions-as-a-Service** — Knative on tenant K8s
- **CI/CD service** — Integrated pipeline runner (Gitea Actions, Tekton)
- **Managed monitoring per tenant** — Prometheus + Grafana stack
- **Multi-datacenter / federation** — Control plane manages resources across sites
- **Marketplace** — Tenant-facing app marketplace (one-click WordPress, etc.)
- **Compliance** — GDPR data residency, SOC2 audit trail
- **Mobile app** — Companion iOS/Android app for alerts and quick actions
- **VPN-as-a-Service** — WireGuard endpoints for tenant site-to-site connectivity

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

_This document is a living plan. Update it as decisions are made and scope evolves._
