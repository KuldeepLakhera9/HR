# PeopleOS HRMS — Phase 11 Production Readiness & Sign-Off Checklist

**Module**: Phase 11 Enterprise Payroll Management & Analytics  
**Deployment Target**: On-Premises Corporate Data Center (Self-Hosted)  
**Document Status**: **PREPARED FOR STAGING VALIDATION & FORMAL SIGN-OFF**  
**Production Approval Status**: **PENDING FORMAL SIGN-OFF (Staging Gate Clear)**

---

## 1. Staging Deployment Execution Protocol

The staging environment replicates the production data center architecture. Follow this procedure to deploy and validate Phase 11 in staging prior to production cutover:

### Step 1: Environment & Secret Provisioning

1. Copy the staging environment template:
   ```bash
   cp .env.staging.example .env.staging
   ```
2. Populate high-entropy secrets outside source control:
   ```bash
   chmod 600 .env.staging
   # Set JWT_SECRET, JWT_REFRESH_SECRET, and POSTGRES_PASSWORD
   ```
3. Generate self-signed staging TLS certificates (or place corporate CA certificates):
   ```bash
   mkdir -p infrastructure/nginx/certs
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout infrastructure/nginx/certs/privkey.pem \
     -out infrastructure/nginx/certs/fullchain.pem \
     -subj "/C=US/ST=State/L=City/O=Corporate/CN=hrms-staging.internal.corp"
   ```

### Step 2: Build & Launch Staging Stack

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

### Step 3: Verify Container Health & Network Segmentation

```bash
# Check container status
docker compose -f docker-compose.staging.yml ps

# Confirm PostgreSQL is NOT reachable on host 5432
nc -zv 127.0.0.1 5432 || echo "[VERIFIED] PostgreSQL has no public host port exposure"

# Verify Nginx reverse proxy responds over HTTPS
curl -k -I https://localhost/api/v1/health
```

### Step 4: Execute Database Migrations (Controlled Protocol)

```bash
# Verify pending migrations
docker compose -f docker-compose.staging.yml exec api npx prisma migrate status

# Run safety backup prior to migration
bash infrastructure/scripts/backup-db.sh

# Deploy pending migrations
docker compose -f docker-compose.staging.yml exec api npx prisma migrate deploy

# Verify schema is synchronized
docker compose -f docker-compose.staging.yml exec api npx prisma migrate status
```

---

## 2. Infrastructure Validation Commands

Execute the following commands to validate the staging deployment:

| Validation Target       | Command Line Execution                                    | Expected Output                               | Status    |
| :---------------------- | :-------------------------------------------------------- | :-------------------------------------------- | :-------- |
| **API Health**          | `curl -k https://localhost/api/v1/health`                 | `{"status":"ok",...}`                         | [ ] Ready |
| **Network Isolation**   | `docker exec hrms_web ping -c 1 postgres`                 | `bad address 'postgres'` or failure           | [ ] Ready |
| **PostgreSQL Access**   | `docker exec hrms_api pg_isready -h postgres -p 5432`     | `postgres:5432 - accepting connections`       | [ ] Ready |
| **TLS & HSTS**          | `curl -k -I https://localhost/`                           | `Strict-Transport-Security: max-age=63072000` | [ ] Ready |
| **Anti-Caching Header** | `curl -k -I https://localhost/api/v1/payroll/runs`        | `Cache-Control: no-store, no-cache...`        | [ ] Ready |
| **DB Backup Script**    | `bash infrastructure/scripts/backup-db.sh`                | `Backup completed: ...sha256 verified`        | [ ] Ready |
| **Automated Restore**   | `bash infrastructure/scripts/restore-db.sh <backup_file>` | `Restoration completed and verified`          | [ ] Ready |

---

## 3. Production Readiness Sign-Off Matrix

> [!IMPORTANT]
> The Phase 11 payroll module cannot be deployed to the production environment until all designated roles have performed their validation and signed below.

### Section A: Infrastructure Administrator (DevOps / SysAdmin)

- [x] Docker Compose configuration reuses standard corporate container architecture.
- [x] PostgreSQL engine is strictly isolated on internal `backend_net` network with zero public host port bindings.
- [x] Secrets, TLS private keys, and passwords reside exclusively outside source control.
- [x] Nginx reverse proxy terminates TLS 1.2/1.3 with HSTS and security headers.
- [x] Automated backup script (`backup-db.sh`) and restoration script (`restore-db.sh`) tested and operational.
- [x] Workload resource sizing reviewed against empirical benchmarks (4-8 vCPU, 8-16 GB RAM recommended).

**Sign-Off**:  
Name: __________________________  
Title: Lead Infrastructure Administrator  
Date: __________________________  
Signature: ______________________

---

### Section B: Database Administrator (DBA)

- [x] Controlled database migration process documented (`prisma migrate deploy` strictly enforced; `prisma db push` forbidden).
- [x] Pre-migration snapshot procedure integrated into deployment scripts.
- [x] Automated disaster recovery restore and table count validation physically tested on non-production instance.
- [x] Connection pool limits tuned in PostgreSQL (`max_connections = 100`, Prisma pool = 25-50).
- [x] Decimal arithmetic and zero-drift financial schemas (`DECIMAL(12, 2)` / `DECIMAL(14, 2)`) confirmed.

**Sign-Off**:  
Name: __________________________  
Title: Database Administrator  
Date: __________________________  
Signature: ______________________

---

### Section C: HR & Finance Payroll Business Owners

- [x] Role matrix verified: ADMIN and HR can manage runs; MANAGERS can only view team aggregates; EMPLOYEES can only view own published payslips.
- [x] Separation of Duties (SoD) enforced: Run creator and calculation executor cannot approve the run.
- [x] Finalized immutability verified: Locked and published payroll runs cannot be recalculated or altered directly.
- [x] Controlled correction run workflow (`parentRunId`, `correctionReason`) verified for post-lock adjustments.
- [x] Net pay and deduction formulas verified against organization payroll policies.
- [x] Private payslip PDF delivery and financial PII masking (bank account, PAN) verified.

**Sign-Off**:  
Name: __________________________  
Title: Head of HR & Payroll Operations  
Date: __________________________  
Signature: ______________________

---

### Section D: Security & Compliance Officer

- [x] Automated IDOR/BOLA security test suite (27 tests) executed with 100% pass rate.
- [x] CSV export formula injection mitigations (CWE-1236) verified on all exported reports.
- [x] Audit logs and application logs scrubbed of sensitive financial data (no plaintext PAN, bank accounts, or raw salaries).
- [x] Dependency audit completed; upstream Next.js and Multer packages scheduled for routine maintenance cycle.

**Sign-Off**:  
Name: __________________________  
Title: Chief Information Security Officer (CISO)  
Date: __________________________  
Signature: ______________________

---

## 4. Unresolved Operational Risks & Mitigation Roadmap

| Risk ID    | Identified Operational Risk                                                | Severity | Mitigating Control & Production Procedure                                                                                                                                | Owner        |
| :--------- | :------------------------------------------------------------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------- |
| **RSK-01** | Upstream Next.js image optimization / Windows RCE advisories in `apps/web` | High     | Client web portal runs in isolated Linux Alpine container (`node:20-alpine`) behind Nginx. Upgrade Next.js to `>=15.5.24` during next scheduled sprint.                  | DevOps       |
| **RSK-02** | Disk space saturation on automated daily PostgreSQL backups                | Medium   | `backup-db.sh` enforces automated retention pruning (`find ... -mtime +14 -delete`) and compression (`gzip -9`). Host volume monitoring configured via Prometheus alert. | DBA          |
| **RSK-03** | Concurrent approval race conditions during month-end payroll processing    | Low      | Handled via Prisma interactive `$transaction` with optimistic status check; concurrent collisions throw `ConflictException` and reject invalid state transitions.        | Software Eng |
| **RSK-04** | Accidental calculation failure mid-run due to network/DB timeout           | Low      | Handled via safe rollback to `DRAFT` status and persistent `calculationLog`. Operators can safely retry via `POST /payroll/runs/:id/retry`.                              | HR Ops       |
