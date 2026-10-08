# PeopleOS — Production-Grade Self-Hosted HRMS Platform

> **Modern, Calm, Professional Human Resource Management for Private Datacenters**

PeopleOS is an enterprise HRMS designed for organizations that require complete on-premise data sovereignty without mandatory monthly SaaS subscriptions. Built with a modular monolith architecture, PeopleOS supports clean boundaries that can scale or split into microservices in future phases.

---

## 🌟 Key Features (Phase 1 Foundation)

- **Monorepo Architecture**: Powered by pnpm workspaces and Turborepo.
- **Modern Web App**: Next.js 14 (App Router), Tailwind CSS, Lucide icons, and Recharts.
- **Warm Professional Design System**: Cohesive design tokens inspired by modern HR SaaS (amber/gold primary, warm ivory background, crisp white surfaces, and semantic status indicators).
- **Four Core Role Dashboards**:
  - 👑 **ADMIN**: Organization health, branches, audit logs, and system governance.
  - 👥 **HR**: Workforce directory, attendance overview, leave approvals, and employee enablement.
  - 👔 **MANAGER**: Squad attendance, leave/outdoor duty approvals, and sprint deliverables.
  - 👤 **EMPLOYEE**: Check-in status, punch in/out, leave balances, upcoming leaves, and notices.
- **Architectural Attendance Modes (Prepared for Phase 2)**:
  - 🏢 **OFFICE**: Geofenced GPS validation.
  - 💼 **OFFICIAL VISIT (OD)**: Outdoor duty trips with authorized geofence bypass.
  - 🏠 **WORK FROM HOME (WFH)**: Remote attendance workflows.
- **Modular NestJS Backend**: REST API with global validation, exception filters, logging, consistent response envelopes, and Swagger/OpenAPI docs.
- **PostgreSQL Database with Prisma**: 11 foundational entities with relations, indexes, timestamps, and soft deletes.
- **Self-Hosted Infrastructure**: Docker Compose with PostgreSQL, NestJS API, Next.js Web, and Nginx reverse proxy.

---

## 🏗️ Repository Structure

```
├── apps/
│   ├── api/                  # NestJS 10 REST API (/api/v1/...)
│   └── web/                  # Next.js 14 App Router Frontend
├── packages/
│   ├── config/               # Design tokens, role navigation & brand constants
│   ├── database/             # Prisma schema (11 entities), migrations & seed
│   ├── eslint-config/        # Monorepo linting presets
│   ├── types/                # Domain models, role types, API envelopes
│   └── ui/                   # Reusable HRMS component library (30+ components)
├── infrastructure/
│   ├── docker/               # Multi-stage Dockerfiles & Docker Compose
│   ├── monitoring/           # Prometheus scraping config
│   ├── nginx/                # Reverse proxy configuration
│   └── postgres/             # Database initialization scripts
└── docs/                     # Technical architecture documentation
```

---

## 🚀 Quick Start & Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose (optional for local PostgreSQL)

### 1. Installation

```bash
# Install all dependencies across the monorepo
pnpm install

# Generate Prisma Client
pnpm --filter @hrms/database run generate
```

### 2. Environment Variables

Create `.env` from template:

```bash
cp .env.example .env
```

| Variable              | Description                  | Default                                                                     |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string | `postgresql://hrms_user:hrms_password@localhost:5432/hrms_db?schema=public` |
| `PORT`                | API server port              | `4000`                                                                      |
| `API_PREFIX`          | REST API route prefix        | `api/v1`                                                                    |
| `NEXT_PUBLIC_API_URL` | Frontend API client base URL | `http://localhost:4000/api/v1`                                              |

### 3. Run Development Servers

```bash
# Run both Next.js and NestJS concurrently via Turborepo
pnpm dev
```

- **Web Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)
- **API Swagger Docs**: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- **Health Check**: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

## 🐳 Docker Deployment

To launch the full self-hosted stack in Docker:

```bash
# Build and start PostgreSQL, API, Web, and Nginx
docker compose up -d --build

# Check status
docker compose ps
```

The application will be accessible at `http://localhost` via the Nginx reverse proxy.

---

## 🧪 Verification & Quality

```bash
# Run TypeScript type check across all packages and apps
pnpm typecheck

# Check formatting
pnpm format:check
```

---

## 📄 License

Private & Proprietary. All rights reserved.
