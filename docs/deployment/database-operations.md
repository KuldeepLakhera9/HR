# PeopleOS HRMS — Database Production Operations & Readiness

**Document ID:** `DB-OPS-004`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Engine:** PostgreSQL 16 Enterprise Relational Database  
**ORM Tooling:** Prisma ORM 6.4.1  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Database Architecture & Provisioning

The PeopleOS HRMS utilizes PostgreSQL 16 as its authoritative relational database engine. To protect sensitive workforce records, organizational hierarchies, attendance logs, and financial payroll snapshots, database operations adhere to strict separation of duties, least privilege, and deterministic migration execution.

---

## 2. Least-Privilege Role Segmentation

The production database uses two distinct database roles to prevent runtime application compromise from escalating to schema destruction:

1. **`hrms_dba` (Database Administrator Role):**
   - Owns schemas, tables, views, and functions.
   - Applied strictly during automated CI/CD migration deployment (`prisma migrate deploy`).
   - Disallowed from general application runtime connections.
2. **`hrms_app_user` (Runtime Application Account):**
   - Used exclusively by the `hrms_api` service containers.
   - Granted **only** `CONNECT` to database and `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables in the `public` schema.
   - Strictly stripped of `DROP TABLE`, `ALTER TABLE`, `CREATE TABLE`, `TRUNCATE`, and superuser privileges.

### 2.1 Database & Account Initialization Script (`init-db.sql`)

```sql
-- Execute as PostgreSQL superuser (postgres) during initial host/VM provisioning:

-- 1. Create Database
CREATE DATABASE hrms_production_db
  WITH ENCODING 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       CONNECTION LIMIT = 150;

-- 2. Connect to Database
\c hrms_production_db;

-- 3. Create Dedicated Application Runtime Role
CREATE ROLE hrms_app_user WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  PASSWORD 'STRONG_GENERATED_PASSWORD_MIN_24_CHARS';

-- 4. Grant Schema Privileges
GRANT CONNECT ON DATABASE hrms_production_db TO hrms_app_user;
GRANT USAGE ON SCHEMA public TO hrms_app_user;

-- 5. Grant CRUD Permissions on Tables and Sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrms_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hrms_app_user;

-- 6. Enforce Connection Limits
ALTER ROLE hrms_app_user CONNECTION LIMIT 100;
```

---

## 3. Schema Migration Deployment Workflow

> [!CAUTION]
> The command `npx prisma db push` is strictly prohibited in staging and production environments. It performs unreviewed schema mutations and can cause irreversible data loss. All migrations must be deployed using `npx prisma migrate deploy`.

### 3.1 Controlled Migration Execution Protocol

```bash
# Step 1: Pre-Migration Health & Migration Status Check
# Verify pending migrations without modifying schema:
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status

# Step 2: Create Mandatory Pre-Migration Safety Snapshot
bash infrastructure/scripts/backup-db.sh

# Step 3: Apply Reviewed Migrations
# Executes all unapplied migrations in chronological sequence atomically:
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Step 4: Post-Migration Schema Verification
docker compose -f docker-compose.prod.yml exec api npx prisma migrate status
# Expected output: "Database schema is up to date!"
```

---

## 4. Secure Initial Administrator Provisioning

Production systems must not contain hardcoded default passwords (e.g., `admin123` or `password`). Initial administrative accounts are provisioned via a dedicated, secure one-time CLI script executed inside the secure application container.

### 4.1 CLI Bootstrap Procedure

```bash
# Execute initial admin bootstrap within the API container:
docker compose -f docker-compose.prod.yml exec api node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const crypto = require('crypto');

async function bootstrapAdmin() {
  const prisma = new PrismaClient();
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@internal.corp';
  const temporaryPassword = crypto.randomBytes(16).toString('base64');
  const passwordHash = await argon2.hash(temporaryPassword);

  console.log('Provisioning Initial Enterprise Administrator...');
  // Logic to find or create default Organization, System Admin Role, and User
  // Outputs randomly generated one-time credentials securely to console stdout
  console.log('----------------------------------------------------');
  console.log('ADMIN CREATED SUCCESSFULLY');
  console.log('EMAIL: ' + email);
  console.log('ONE-TIME PASSWORD: ' + temporaryPassword);
  console.log('----------------------------------------------------');
  console.log('NOTE: User must change password immediately upon first login.');
  await prisma.\$disconnect();
}
bootstrapAdmin().catch(console.error);
"
```

---

## 5. PostgreSQL Performance Tuning for Data-Center Hardware

For a dedicated database server or VM with 8 vCPU and 32 GB RAM:

```ini
# /etc/postgresql/16/main/postgresql.conf (or postgresql.auto.conf)

# Connectivity & Memory Allocation
max_connections = 120
shared_buffers = 8GB                  # 25% of total RAM
effective_cache_size = 24GB           # 75% of total RAM
maintenance_work_mem = 2GB
work_mem = 64MB                       # Sized for complex payroll aggregation queries
min_wal_size = 2GB
max_wal_size = 16GB
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min

# Disk I/O & SSD Optimizations
random_page_cost = 1.1               # NVMe / Enterprise SSD
effective_io_concurrency = 200

# Background Writer & WAL
wal_buffers = 16MB
wal_compression = on
synchronous_commit = on

# Logging & Auditing
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_min_duration_statement = 250     # Log queries taking longer than 250ms
log_line_prefix = '%m [%p] %q%u@%d '
log_lock_waits = on
log_temp_files = 0
```

---

## 6. Connectivity Verification & Validation Queries

To verify database health and schema integrity without impacting production traffic:

```bash
# Check database liveness and active connection count:
docker exec hrms_postgres psql -U hrms_user -d hrms_db -c "
SELECT
  count(*) as active_connections,
  max(age(now(), query_start)) as longest_running_query
FROM pg_stat_activity
WHERE state = 'active';
"

# Validate composite indexes on core performance tables:
docker exec hrms_postgres psql -U hrms_user -d hrms_db -c "
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename IN ('payroll_runs', 'employee_payroll_snapshots', 'attendance_records', 'employees')
ORDER BY tablename, indexname;
"
```
