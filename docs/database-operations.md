# PeopleOS HRMS — Database Operations & Migration Guide

**Document ID:** `TECH-DB-003`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Database Engine:** PostgreSQL 16  
**ORM Tooling:** Prisma ORM 6.4.1

---

## 1. Database Provisioning & Least-Privilege Roles

The production database strictly separates administrative migration permissions from runtime application access:

```sql
-- 1. Create Dedicated Application Role (Non-Superuser)
CREATE ROLE hrms_app_user WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  PASSWORD 'STRONG_GENERATED_PASSWORD_MIN_24_CHARS';

-- 2. Grant Database & Schema Access
GRANT CONNECT ON DATABASE hrms_production_db TO hrms_app_user;
GRANT USAGE ON SCHEMA public TO hrms_app_user;

-- 3. Grant Explicit Table CRUD Permissions (No DROP TABLE / ALTER TABLE)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrms_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hrms_app_user;
```

---

## 2. Production Migration Execution Protocol

> [!CAUTION]
> Never execute `npx prisma db push` in staging or production. Unreviewed schema alterations can lead to catastrophic data loss. Always deploy migrations using `npx prisma migrate deploy`.

```bash
# Step 1: Pre-Migration Status Inspection
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status

# Step 2: Pre-Migration Database Safety Snapshot
bash infrastructure/scripts/backup-db.sh

# Step 3: Deploy Approved Migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Step 4: Post-Migration Schema Verification
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status
```

---

## 3. Database Maintenance & Index Optimization

The database incorporates optimized composite indexes across key tables:

- `payroll_runs`: `[organizationId, status]`, `[periodId]`, `[parentRunId]`
- `employee_payroll_snapshots`: `[payrollRunId, payslipStatus]`, `[employeeId]`
- `attendance_records`: `[employeeId, date]`, `[organizationId, status]`
- `leave_applications`: `[employeeId, status]`, `[organizationId, startDate]`

Run monthly index optimization:

```sql
VACUUM ANALYZE;
REINDEX DATABASE hrms_production_db;
```
