# PeopleOS HRMS — Production Deployment Runbook

**Document ID:** `TECH-DEP-006`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center

---

## 1. Pre-Deployment Verification

1. **Change Approval:** Confirm approved Change Advisory Board (CAB) ticket.
2. **Environment Readiness:**
   ```bash
   df -h /var/lib/docker  # Verify >= 50 GB available
   free -m                # Verify >= 4 GB RAM available
   ```
3. **Artifact Integrity:**
   - Execute monorepo test suite: `pnpm run test` (All 1,133 tests must pass).
   - Execute type checks: `pnpm run typecheck` (All 7 packages must pass).
   - Check dependency vulnerabilities: `pnpm audit --prod`.

---

## 2. Release Execution Protocol

```bash
# Step 1: Pre-Deployment Database Snapshot
bash infrastructure/scripts/backup-db.sh

# Step 2: Build / Pull Production Container Images
docker compose -f docker-compose.prod.yml --env-file /etc/hrms/.env.production build

# Step 3: Deploy Containers with Zero-Downtime Rollout
docker compose -f docker-compose.prod.yml --env-file /etc/hrms/.env.production up -d --remove-orphans

# Step 4: Execute Database Schema Migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Step 5: Verify Health & Liveness
curl -s http://127.0.0.1:4000/api/v1/health | grep '"status":"ok"'
```

---

## 3. Post-Deployment Smoke Verification

1. **Authentication:** Log in via `https://hrms.internal.corp/login`.
2. **Employee Directory:** Open `/employees` and verify active employee records.
3. **Attendance & Leave:** Submit a test check-in and verify balance view.
4. **Payroll Integrity:** Open `/payroll/runs` and confirm historic runs remain immutable.
5. **Logs Inspection:**
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=100 -f api
   # Confirm ZERO 500 errors in first 15 minutes of production traffic
   ```
