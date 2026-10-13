# PeopleOS HRMS — Application & Database Rollback Procedure

**Document ID:** `ROL-PROC-011`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Emergency Operational Procedure

---

## 1. Rollback Criteria & Decision Authority

A rollback is executed if any of the following occur during or immediately following a production deployment:

1. **Critical Health Failure:** The `/api/v1/health` probe fails or database reports `"disconnected"`.
2. **Elevated 5xx Error Rate:** API responses experience > 1% HTTP 500/502/504 errors within the first 15 minutes of release.
3. **Core Workflow Blockers:** Inability to log in, unhandled exceptions in attendance check-in, or corrupt payroll calculation execution.
4. **Data Corruption:** Relational integrity discrepancies detected after migration.

The Release Manager or Technical Lead has the sole authority to trigger this procedure.

---

## 2. Database Rollback Safety Analysis

> [!WARNING]
> Database schema rollbacks are non-trivial. Reverting application code without restoring the database can cause schema mismatch errors, while reverting the database can cause loss of transactional data written during the release window.

### Rollback Strategy by Migration Type:

1. **Additive / Non-Breaking Migrations (Recommended):**
   - New columns with defaults or nullable constraints, new indexes, new tables.
   - **Action:** Retain database as-is. Revert application container images to the previous tag. The previous application version will ignore the extra columns/tables.
2. **Breaking / Structural Migrations:**
   - Table alterations, column drops, type changes, or data transformations.
   - **Action:** If the release fails immediately, restore the pre-deployment database snapshot taken in Step 7 of the Release Procedure.

---

## 3. Step-by-Step Rollback Execution

### Step 1: Halt Application Ingress & Stop Write Traffic

Stop the live application containers to prevent new writes:

```bash
docker compose -f docker-compose.prod.yml stop api web
```

### Step 2: Database Restoration (If Required)

If a breaking database migration was applied and must be reverted:

```bash
# Execute safe database restoration from the pre-deploy safety backup:
bash infrastructure/scripts/restore-db.sh "/var/backups/hrms/postgres/hrms_backup_pre_deploy.sql.gz"
```

### Step 3: Revert Application Container Images / Code

Checkout the previous stable Git release tag or deploy the previous container image:

```bash
# Revert to previous release tag (e.g., v1.16.0):
git checkout tags/v1.16.0

# Rebuild / restart previous containers:
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 4: Verify Post-Rollback Health & Core Services

Validate that the previous release version is responsive and healthy:

```bash
# Check container status:
docker compose -f docker-compose.prod.yml ps

# Probe system health:
curl -s http://127.0.0.1:4000/api/v1/health | grep '"status":"ok"'

# Verify database connection pool:
docker exec hrms_postgres psql -U hrms_user -d hrms_db -c "SELECT count(*) FROM users;"
```

### Step 5: Resume Traffic & Incident Communication

1. Enable upstream Nginx / Load Balancer traffic routing.
2. Verify normal user operations.
3. Notify all stakeholders that the release was safely rolled back.
4. Schedule Post-Mortem investigation meeting.
