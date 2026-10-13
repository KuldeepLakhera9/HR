# PeopleOS — Enterprise Production-Grade Self-Hosted HRMS Platform

> **Modern, Calm, Professional Human Resource Management for Private Data Centers**

PeopleOS is an enterprise-grade, self-hosted Human Resource Management System (HRMS) built specifically for organizations requiring complete on-premise data sovereignty in private data centers and restricted network environments (including HPC cluster data centers with Network Access Control).

---

## 🌟 Key Functional Modules (Phases 1–18 Complete)

- **Authentication & Session Security**: Argon2 password hashing, short-lived JWT access tokens (15m), secure `httpOnly` refresh cookies (7d), and session revocation.
- **Role-Based Access Control (RBAC)**: Multi-tiered governance with four distinct personas:
  - 👑 **ADMIN**: System administration, organization structure, audit log explorer, and security configuration.
  - 👥 **HR**: Workforce directory, attendance exceptions, leave ledgers, MIS reports, and payroll engine.
  - 👔 **MANAGER**: Team rosters, consolidated approvals inbox, outdoor visit verifications, and performance reviews.
  - 👤 **EMPLOYEE**: Self-service profile, daily check-in, leave applications, WFH requests, and personal payslips.
- **Attendance Engine**: Geofenced office check-in, manager-approved Work-From-Home (WFH), and outdoor Official Visits (OD).
- **Leave Management**: Balance accrual ledger, sandwich rule evaluation, overdraw prevention, and department leave calendars.
- **Performance Management (PMS)**: Quarterly review cycles, employee self-assessment, manager reviews, and goal tracking.
- **Enterprise Payroll Engine**: Component formula evaluation, compensation structures, period orchestration, LOP calculation, locked runs, and in-memory streaming of digital payslips in Indian Rupees (INR) with masked bank/PAN details.
- **Document Storage Vault**: Secure filesystem storage (`0600` POSIX mode), deep magic-byte validation, and path traversal protection.
- **Enterprise MIS & Reports**: Headcount analytics, attendance reconciliation, payroll variance, and SheetJS Excel (XLSX) exports.
- **Data Center DevOps & Disaster Recovery**: Multi-stage non-root Docker builds (`USER node`), Prometheus alerting, automated database backups with SHA-256 verification, and documented DR procedures.

---

## 🏗️ Repository Architecture

```
├── apps/
│   ├── api/                  # NestJS 10 Modular REST API (/api/v1/...)
│   └── web/                  # Next.js 14 App Router SSR & Hydration Frontend
├── packages/
│   ├── config/               # Design tokens, role navigation & brand constants
│   ├── database/             # Prisma 6 schema (26 migrations), seed & composite indexes
│   ├── eslint-config/        # Monorepo linting presets
│   ├── types/                # Domain models, role types, API response envelopes
│   └── ui/                   # Shared accessible component library (@hrms/ui)
├── infrastructure/
│   ├── docker/               # Hardened multi-stage Dockerfiles (Dockerfile.api, Dockerfile.web)
│   ├── monitoring/           # Prometheus scraping & alerting rules
│   ├── nginx/                # Production reverse proxy with TLS hardening & HSTS
│   ├── postgres/             # Database initialization scripts
│   └── scripts/              # Automated backup-db.sh, restore-db.sh, rollback-app.sh
└── docs/
    ├── deployment/           # Phase 17 data-center operational standards (13 documents)
    ├── release/              # Phase 18 UAT, inventory, and release reports (6 documents)
    └── user-guide.md         # End-user guide for Admin, HR, Manager, and Employee
```

---

## 🚀 Quick Start & Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0 (pnpm 12.8.1 recommended)
- PostgreSQL 16 (or Docker Compose)

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/KuldeepLakhera9/HR.git
cd HR

# Install monorepo dependencies
pnpm install
```

### 2. Environment Configuration

```bash
# Copy example environment configuration
cp .env.example .env
```

### 3. Database Setup & Migration

```bash
# Generate Prisma Client
pnpm --filter @hrms/database run generate

# Deploy database migrations
pnpm --filter @hrms/database run db:migrate
```

### 4. Running the Development Server

```bash
# Start all workspace services via Turborepo
pnpm run dev

# Frontend Web Portal: http://localhost:8080
# Backend REST API:    http://localhost:4000/api/v1
# Swagger UI Docs:     http://localhost:4000/api/docs (Development only)
```

### 5. Running Tests & Type Checking

```bash
# Execute full automated test suite (1,133 tests)
pnpm run test

# Run TypeScript compilation checks across all 7 packages
pnpm run typecheck

# Check code formatting
pnpm run format:check
```

---

## 🔒 Production Data-Center Deployment

```bash
# 1. Prepare production environment
sudo cp .env.production.example /etc/hrms/.env.production
sudo chmod 600 /etc/hrms/.env.production

# 2. Launch production containers
docker compose -f docker-compose.prod.yml --env-file /etc/hrms/.env.production up -d --build

# 3. Deploy database migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 4. Verify system health
curl -s http://127.0.0.1:4000/api/v1/health
```

For complete deployment specifications, refer to [docs/deployment/](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment) and [docs/user-guide.md](file:///c:/Kuldeep's%20Work/Projects/HR/docs/user-guide.md).
