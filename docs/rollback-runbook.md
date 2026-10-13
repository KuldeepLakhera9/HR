# PeopleOS HRMS — Emergency Rollback Runbook

**Document ID:** `TECH-ROL-007`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center

---

## 1. Rollback Authority & Triggers

A rollback is immediately authorized by the Release Lead or Incident Commander if:

- System health checks fail after deployment.
- HTTP 5xx error rate exceeds 1% of total traffic.
- Relational integrity defects or data corruption is detected.

---

## 2. Emergency Rollback Commands

```bash
# 1. Stop write traffic
docker compose -f docker-compose.prod.yml stop api web

# 2. Restore database to pre-deployment safety snapshot (if breaking migration was applied)
bash infrastructure/scripts/restore-db.sh /var/backups/hrms/postgres/hrms_backup_pre_deploy.sql.gz

# 3. Revert code and launch previous release container images
git checkout tags/v1.16.0
docker compose -f docker-compose.prod.yml --env-file /etc/hrms/.env.production up -d --build

# 4. Verify post-rollback service health
curl -s http://127.0.0.1:4000/api/v1/health | grep '"status":"ok"'
```

---

## 3. Post-Rollback Protocols

1. Notify executive stakeholders and operations teams that rollback completed.
2. Preserve all failure logs from `/var/log/hrms` and Docker outputs for root cause analysis (RCA).
3. Schedule post-mortem meeting within 24 hours.
