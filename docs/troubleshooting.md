# PeopleOS HRMS — Troubleshooting & Operational Runbook

**Document ID:** `TECH-TRBL-005`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Audience:** Systems Engineers, Site Reliability Engineers & IT Support

---

## 1. Common Failures & Rapid Remedies

### 1.1 Backend API Unhealthy (`502 Bad Gateway` on Nginx)

- **Symptoms:** Nginx returns `502 Bad Gateway`; browser cannot reach `/api/v1/*`.
- **Diagnostic Commands:**
  ```bash
  docker compose -f docker-compose.prod.yml ps
  docker compose -f docker-compose.prod.yml logs api --tail=100
  ```
- **Common Root Causes & Fixes:**
  1. _PostgreSQL Unreachable:_ Verify database container is running and healthy (`docker exec hrms_postgres pg_isready -U hrms_user -d hrms_db`).
  2. _Missing Mandatory Production Secret:_ Check for startup errors such as `CRITICAL: JWT_SECRET must be set`. Populate missing keys in `.env.production`.
  3. _Port Conflict:_ Ensure no other host process binds to port 4000.

### 1.2 Database Connection Pool Exhaustion

- **Symptoms:** API logs report `Can't reach database server at 'postgres:5432'` or connection timeout during batch payroll runs.
- **Remedy:**
  1. Inspect active PostgreSQL connections:
     ```sql
     SELECT count(*), state FROM pg_stat_activity GROUP BY state;
     ```
  2. Increase connection pool limit by adjusting `DATABASE_POOL_SIZE=100` and `max_connections=150` in `postgresql.conf`.

### 1.3 Payroll Run Crashes Midway (`CALCULATING` State Stalled)

- **Symptoms:** Server host rebooted during bulk payroll calculation; run remains in `CALCULATING`.
- **Remedy:**
  1. The engine provides an automated recovery endpoint: invoke `POST /api/v1/payroll/runs/:id/retry` as an authorized Admin.
  2. The service cleans dirty partial snapshots and safely re-executes calculation without creating duplicate line items.

### 1.4 Document Upload Rejections (`400 Bad Request`)

- **Symptoms:** Employee upload fails with `File size exceeds maximum permitted threshold` or `Invalid file content or format`.
- **Remedy:**
  1. Confirm file size is `< 10 MB`.
  2. Confirm file format is valid PDF, PNG, JPG/JPEG, WebP, or DOCX. Binary executables (`.exe`, `.dll`) and script injections are blocked by magic-byte filters.

---

## 2. IT Support Escalation Matrix

| Severity Tier            | Response SLA | Target Contact Placeholder                                  |
| :----------------------- | :----------: | :---------------------------------------------------------- |
| **P1 - System Outage**   |  15 Minutes  | IT Command Center (`it-ops@internal.corp` / Extension 4444) |
| **P2 - Payroll Blocker** |    1 Hour    | Enterprise Applications Lead (`hr-systems@internal.corp`)   |
| **P3 - General Anomaly** |   4 Hours    | Internal IT Service Desk (`servicedesk@internal.corp`)      |
