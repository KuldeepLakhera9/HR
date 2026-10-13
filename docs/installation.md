# PeopleOS HRMS — Installation & Setup Guide

**Document ID:** `TECH-INST-001`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Audience:** DevOps Engineers, System Administrators & Developers

---

## 1. System Requirements

### Hardware Requirements:

- **Development / Evaluation:** 2 vCPU, 4 GB RAM, 20 GB Disk Space.
- **Production Data Center (up to 2,500 employees):** 4 vCPU, 16 GB RAM, 100 GB SSD (Enterprise SAN/NAS).
- **Enterprise Data Center (up to 10,000+ employees):** 8 vCPU, 32 GB RAM, 250+ GB NVMe SSD.

### Software Prerequisites:

- **Operating System:** Linux (RHEL 8/9, Rocky Linux 9, Ubuntu 22.04/24.04 LTS) or Windows 11 / Server 2022.
- **Node.js:** `>= 20.0.0` LTS.
- **Package Manager:** `pnpm` version `12.8.1` (or `>= 9.0.0`).
- **Database Engine:** PostgreSQL 16.
- **Container Engine:** Docker Engine `>= 24.0` and Docker Compose `>= 2.20`.

---

## 2. Local Development Installation

```bash
# 1. Clone repository
git clone https://github.com/KuldeepLakhera9/HR.git
cd HR

# 2. Install monorepo dependencies
pnpm install

# 3. Create development environment file
cp .env.example .env

# 4. Generate Prisma ORM client
pnpm --filter @hrms/database run generate

# 5. Start local PostgreSQL (via Docker)
docker compose up -d postgres

# 6. Apply database migrations & seed initial data
pnpm --filter @hrms/database run db:migrate
pnpm --filter @hrms/database run db:seed

# 7. Start development servers
pnpm run dev
```

The services will become available at:

- **Web Portal:** `http://localhost:8080`
- **Backend API:** `http://localhost:4000/api/v1`
- **Swagger Documentation:** `http://localhost:4000/api/docs`

---

## 3. Production Data-Center Installation

```bash
# 1. Prepare persistent storage directories
sudo mkdir -p /var/hrms/storage/documents /var/backups/hrms/postgres /etc/hrms
sudo chown -R 1000:1000 /var/hrms/storage/documents
sudo chmod 700 /var/hrms/storage/documents /var/backups/hrms/postgres

# 2. Configure production secrets
sudo cp .env.production.example /etc/hrms/.env.production
sudo chmod 600 /etc/hrms/.env.production
# Edit /etc/hrms/.env.production to set CSPRNG secrets

# 3. Build and launch hardened containers
docker compose -f docker-compose.prod.yml --env-file /etc/hrms/.env.production up -d --build

# 4. Deploy production database schema migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 5. Verify system health
curl -s http://127.0.0.1:4000/api/v1/health
```
