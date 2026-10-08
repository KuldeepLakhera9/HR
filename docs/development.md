# PeopleOS HRMS — Local Development Guide

## 1. Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0 (Recommended: 12.8.x)
- Docker & Docker Compose
- PostgreSQL 16 (or run via Docker)

## 2. Initial Setup

1. Clone the repository and navigate to the project directory:

   ```bash
   cd HR
   ```

2. Copy environment file:

   ```bash
   cp .env.example .env
   ```

3. Install monorepo dependencies:

   ```bash
   pnpm install
   ```

4. Generate Prisma client:
   ```bash
   pnpm --filter @hrms/database run generate
   ```

## 3. Running Services

### Option A: Local Dev Server (Recommended)

```bash
# Start frontend and backend concurrently via Turborepo
pnpm dev
```

- Web Application: `http://localhost:3000`
- API Application: `http://localhost:4000/api/v1`
- Swagger Docs: `http://localhost:4000/api/docs`
- Health Endpoint: `http://localhost:4000/api/v1/health`

### Option B: Run Database in Docker

```bash
docker compose up -d postgres
pnpm --filter @hrms/database run db:push
pnpm --filter @hrms/database run db:seed
```

## 4. Quality & Verification Commands

```bash
# Type check all workspaces
pnpm typecheck

# Lint all code
pnpm lint

# Format code
pnpm format
```
