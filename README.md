<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: Alpha" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-green" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
  <a href="https://github.com/bsdimer/cloudify/actions"><img src="https://github.com/bsdimer/cloudify/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

# Cloudify

**Open-source cloud platform for ISPs and hosting providers.**

Turn your existing Proxmox infrastructure into a full-featured, multi-tenant cloud with managed services, software-defined networking, billing, and a self-service portal — without building a cloud from scratch.

---

## The Problem

Small and mid-size ISPs and hosting providers own powerful bare-metal infrastructure but lack the software layer to compete with hyperscale clouds. Building an AWS/GCP-like platform internally takes years and massive engineering investment. Existing solutions are either proprietary, prohibitively expensive, or designed for a different scale.

## The Solution

Cloudify sits on top of your Proxmox cluster(s) and turns them into a managed cloud platform your customers can use through APIs and a web portal — just like the big clouds, but on **your** hardware, under **your** control.

```
                ┌─────────────────────────────────┐
                │         YOUR CUSTOMERS           │
                │   Web Portal  ·  API  ·  CLI     │
                └───────────────┬─────────────────┘
                                │
                ┌───────────────┴─────────────────┐
                │      CLOUDIFY CONTROL PLANE      │
                │                                  │
                │  API Gateway · Auth · RBAC       │
                │  Orchestrator · GitOps · Billing │
                │  SDN · DNS · Certs · Secrets     │
                └───────────────┬─────────────────┘
                                │
                ┌───────────────┴─────────────────┐
                │       YOUR INFRASTRUCTURE        │
                │                                  │
                │   Proxmox Cluster(s)             │
                │   Bare Metal · Storage · Network │
                └─────────────────────────────────┘
```

## Key Features

### For Your Customers (Tenants)

- **Managed Kubernetes** — Production-grade K8s clusters with one click. Auto-scaling, version upgrades, and integrated monitoring.
- **Managed Databases** — PostgreSQL, MongoDB, and Valkey (Redis-compatible) with automated backups, replication, and point-in-time recovery.
- **Object Storage** — S3-compatible storage (MinIO) with bucket policies, lifecycle rules, and versioning.
- **Software-Defined Networking** — Private networks per tenant (OVN), firewall rules, floating IPs, load balancers.
- **DNS & SSL/TLS** — Managed DNS zones, automatic Let's Encrypt certificates, custom domain support.
- **Secrets Management** — Vault-backed secrets storage for credentials and API keys.
- **Artifact Registry** — Docker image registry with vulnerability scanning (Harbor).
- **Self-Service Portal** — Modern React dashboard to manage all resources, view costs, and monitor health.

### For You (the Operator)

- **Multi-Tenancy** — Complete isolation between customers: separate networks, quotas, RBAC, and billing.
- **GitOps Model** — Every tenant's infrastructure is stored as OpenTofu (Terraform) code in a Git repo. Full audit trail, easy rollback.
- **Plugin System** — Add new managed services without forking the core. Third-party extensibility built in.
- **Simple Installation** — Day 1: `docker-compose up`. Day 2: graduate to Helm on Kubernetes.
- **Billing & Metering** — Track resource usage, enforce quotas, generate invoices.
- **Hypervisor Abstraction** — Proxmox today, VMware tomorrow. The architecture supports multiple hypervisor backends.

## Architecture

Cloudify follows a **control plane / data plane** separation:

- **Control Plane** runs on dedicated machines (Docker or K8s) and handles orchestration, authentication, billing, and API routing.
- **Data Plane** is your Proxmox cluster(s) where tenant workloads actually run, fully isolated via SDN.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / BGP EDGE                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
│   │ LB Node 1│  │ LB Node 2│  │ LB Node N│   ← HAProxy + VRRP     │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘                         │
│        └──────────┬───┘─────────────┘                               │
└───────────────────┼─────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │    CONTROL PLANE      │
        │                       │
        │  API Gateway (NestJS) │    Auth, rate-limit, OpenAPI
        │  Orchestrator         │    VM, K8s, DB, storage lifecycle
        │  GitOps Engine        │    Per-tenant repos + OpenTofu
        │  Event Bus (NATS)     │    Async inter-service messaging
        │  PostgreSQL + Valkey  │    State store + cache/queues
        │  Gitea · Vault · DNS  │    Git repos, secrets, DNS
        └───────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        │     DATA PLANE        │     Proxmox cluster(s)
        │                       │
        │  ┌─ Tenant A ───────┐ │
        │  │  K8s cluster     │ │     Private SDN, managed DBs,
        │  │  Postgres (mgd)  │ │     object storage, monitoring
        │  │  MinIO bucket    │ │
        │  └──────────────────┘ │
        │                       │
        │  ┌─ Tenant B ───────┐ │
        │  │  K8s cluster     │ │     Complete isolation between
        │  │  MongoDB (mgd)   │ │     tenants by default
        │  └──────────────────┘ │
        └───────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS (TypeScript), microservices architecture |
| **Frontend** | React 18, Vite, Tailwind CSS, Shadcn/ui |
| **Database** | PostgreSQL 16+ (control plane), Drizzle ORM |
| **Cache/Queue** | Valkey (Redis-compatible) |
| **Event Bus** | NATS JetStream |
| **IaC** | OpenTofu (Terraform-compatible) |
| **Git** | Gitea/Forgejo (per-tenant repos) |
| **Secrets** | HashiCorp Vault / OpenBao |
| **SDN** | OVN (Open Virtual Network) |
| **Hypervisor** | Proxmox VE (VMware planned) |
| **Monorepo** | Nx, pnpm workspaces |
| **CI/CD** | GitHub Actions |

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Development Setup

```bash
# Clone the repo
git clone https://github.com/bsdimer/cloudify.git
cd cloudify

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Valkey, Gitea, Vault, NATS)
docker compose -f docker-compose.dev.yml up -d

# Run all services in dev mode
pnpm dev

# Or run individual targets
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm lint       # Lint all packages
```

### Project Structure

```
cloudify/
├── packages/
│   ├── api-gateway/           # NestJS — REST API, auth, WebSocket
│   ├── common/                # Shared types, DTOs, error classes, utils
│   ├── web-portal/            # React — Tenant self-service UI
│   ├── web-admin/             # React — ISP admin dashboard
│   ├── services/
│   │   ├── nats/              # NATS JetStream event bus client
│   │   └── gitops/            # Gitea client + OpenTofu runner
│   └── hypervisor/
│       ├── core/              # Hypervisor abstraction layer
│       └── proxmox/           # Proxmox VE API client & provider
├── infra/
│   └── tenant-template/       # OpenTofu skeleton for new tenants
├── docker-compose.dev.yml     # Local development stack
└── PLAN.md                    # Full implementation plan
```

## Roadmap

Cloudify is being built in phases. Contributions are welcome at every stage.

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Foundations — Auth, RBAC, API gateway, tenant model, event bus, GitOps | :construction: In Progress |
| **Phase 1** | Core Compute & Networking — VM provisioning, managed K8s, SDN, IPAM, load balancers | :white_circle: Planned |
| **Phase 2** | Managed Services — PostgreSQL, MongoDB, Valkey, MinIO object storage | :white_circle: Planned |
| **Phase 3** | Platform Services — DNS, SSL/TLS certificates, secrets, artifact registry | :white_circle: Planned |
| **Phase 4** | Web UI & Self-Service Portal — Tenant dashboard, admin panel | :white_circle: Planned |
| **Phase 5** | Billing, Quotas & Metering — Usage tracking, invoices, payment integration | :white_circle: Planned |
| **Phase 6** | Plugin & Extension System — Third-party managed service plugins | :white_circle: Planned |
| **Phase 7** | Installation & Day-2 Ops — One-command installer, Helm charts, monitoring | :white_circle: Planned |
| **Phase 8** | Hardening — HA, disaster recovery, security audit, performance tuning | :white_circle: Planned |

See [PLAN.md](PLAN.md) for the full implementation plan with detailed specifications for each phase.

## Contributing

We're looking for contributors! Cloudify is an ambitious project and there are many ways to help.

### Areas Where We Need Help

- **Backend Engineers (TypeScript/NestJS)** — Building microservices for compute, networking, storage, and database orchestration
- **Frontend Engineers (React)** — Building the tenant portal and admin dashboard
- **DevOps/Infrastructure** — OpenTofu modules, Helm charts, CI/CD, Docker packaging
- **Proxmox Experts** — Deepening the hypervisor integration, SDN/OVN networking
- **Networking Engineers** — SDN design, OVN integration, IPAM, BGP, load balancing
- **Database Engineers** — Postgres/MongoDB/Valkey operator integration and lifecycle management
- **Security** — Auth hardening, tenant isolation audit, Vault integration
- **Technical Writers** — API documentation, user guides, architecture docs
- **Testers** — Integration tests, E2E tests, chaos testing

### How to Contribute

1. **Check the [PLAN.md](PLAN.md)** — Understand the architecture and find an area that interests you
2. **Look at open issues** — Issues tagged `good first issue` or `help wanted` are great starting points
3. **Fork & branch** — Create a feature branch from `main`
4. **Follow conventions** — TypeScript strict mode, Prettier formatting, conventional commits
5. **Submit a PR** — Reference the relevant PLAN.md section and any related issues

```bash
# Fork the repo, then:
git clone https://github.com/<your-username>/cloudify.git
cd cloudify
pnpm install
git checkout -b feat/your-feature
# ... make changes ...
pnpm test && pnpm lint
git commit -m "feat: your description"
git push origin feat/your-feature
# Open a PR on GitHub
```

### Development Guidelines

- **TypeScript strict mode** everywhere — no `any` unless absolutely necessary
- **Drizzle ORM** for all database access (type-safe, close to SQL)
- **NestJS patterns** — dependency injection, modules, guards, interceptors
- **Test your code** — unit tests with Jest, integration tests where appropriate
- **Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`, etc.
- **Keep PRs focused** — one feature or fix per PR

## Why Cloudify?

| | Hyperscale Clouds (AWS/GCP) | OpenStack | **Cloudify** |
|---|---|---|---|
| **Target audience** | Everyone | Large enterprises | Small/mid ISPs & hosters |
| **Infrastructure** | Their hardware | Your hardware | Your hardware |
| **Complexity** | Managed for you | Very high | Low (Docker Compose → Helm) |
| **Cost** | Pay per use (expensive) | Free but ops-heavy | Free & simple to operate |
| **Multi-tenancy** | Built in | Possible but complex | Built in, isolated by default |
| **Managed services** | Extensive | Limited | Growing (plugin-extensible) |
| **IaC model** | Various | Heat/Terraform | GitOps (OpenTofu + Git) |
| **Extensibility** | No | Limited | Plugin SDK for new services |

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Cloudify is in early development. Star the repo to follow progress!</b>
  <br><br>
  <a href="https://github.com/bsdimer/cloudify">GitHub</a> · <a href="PLAN.md">Implementation Plan</a> · <a href="PROGRESS.md">Progress Tracker</a>
</p>
