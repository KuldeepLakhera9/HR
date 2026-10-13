# PeopleOS HRMS — Operational Handover Package

**Document ID:** `OPS-HANDOVER-001`  
**Phase:** 19 — Controlled Production Deployment & Operational Handover  
**Release Version:** `v1.0.0-rc1` (Git Commit: `c273f9d` / Current Baseline)  
**Primary Target:** Designated IT Administrators, Infrastructure Leads & HR Business Owners  
**Classification:** Internal Confidential

---

## 1. Executive Summary & Purpose

This operational handover package formally transfers the operation, maintenance, and day-to-day administration of the PeopleOS Enterprise Human Resource Management System (HRMS) to the internal IT operations team, data-center administrators, and authorized HR/finance stakeholders.

The platform has undergone exhaustive testing across all 18 preceding development phases, achieving 100% test pass rates across 1,133 automated unit/integration tests and zero security vulnerabilities.

---

## 2. System Architecture & Component Topology

```mermaid
graph TD
    Client["Corporate Workstation (Web Browser)"]
    VIP["Ingress VIP: 10.14.32.10 (TCP 443 / HTTPS)"]
    Nginx["Nginx Reverse Proxy & TLS Ingress Container"]
    Web["Next.js 14 SSR Web Container (Port 3000)"]
    API["NestJS 10 Core API Container (Port 4000)"]
    DB["PostgreSQL 16 Relational Database (Port 5432)"]
    Vault["Local File Vault (/var/hrms/storage/documents)"]
    Backups["NFS Backup Target (/var/backups/hrms/)"]
    Mail["Corporate SMTP Relay (mailrelay.internal.corp:587)"]

    Client -->|HTTPS / TLS 1.3| VIP
    VIP --> Nginx
    Nginx -->|Proxy HTTP /| Web
    Nginx -->|Proxy HTTP /api/v1| API
    Web -->|Internal API Calls| API
    API -->|TCP 5432 (Backend Bridge)| DB
    API -->|POSIX 0600 File I/O| Vault
    API -->|SMTP TLS| Mail
    DB -.->|Nightly pg_dump| Backups
```

### Monorepo Component Summary

- **Frontend Portal:** Next.js 14.2.24 (`apps/web`), React 18, Tailwind CSS, `@hrms/ui`.
- **Backend Core API:** NestJS 10.4.15 (`apps/api`), Express, argon2, Passport JWT, Prisma ORM.
- **Relational Storage:** PostgreSQL 16 Alpine, 42 relational tables, 26 linear Prisma migrations.
- **Ingress Proxy:** Nginx Alpine (`infrastructure/nginx/nginx.prod.conf`), terminating SSL/TLS.
- **File Storage Vault:** POSIX local filesystem, UID `1001`, permissions `0600`, magic-byte inspection.

---

## 3. Service Lifecycle & Operations Commands

All services in production are orchestrated via `docker-compose.prod.yml` running on the dedicated VM (`hrms-prod-vm01`).

### 3.1 Service Start & Initialization

```bash
# Navigate to the application root directory
cd /opt/hrms

# Start all containers in detached mode
docker compose -f docker-compose.prod.yml up -d

# Verify all containers are in 'healthy' or 'running' state
docker compose -f docker-compose.prod.yml ps
```

### 3.2 Service Stop & Graceful Shutdown

```bash
# Graceful stop with 30-second timeout for in-flight requests
docker compose -f docker-compose.prod.yml stop -t 30

# Full teardown of containers (persisting storage volumes)
docker compose -f docker-compose.prod.yml down
```

### 3.3 Health Checks & Liveness Validation

```bash
# Automated system health check
curl -k -s https://127.0.0.1/api/v1/health | jq .

# Expected output:
# {
#   "success": true,
#   "message": "System health check completed",
#   "data": {
#     "status": "ok",
#     "environment": "production",
#     "services": {
#       "database": { "status": "connected", "latencyMs": 2 },
#       "api": { "status": "healthy" }
#     }
#   }
# }
```

### 3.4 Live Log Inspection

```bash
# Tail live API logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 api

# Tail live Web portal logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 web

# Tail Nginx access and error logs
docker compose -f docker-compose.prod.yml logs -f --tail=100 nginx
```

---

## 4. Configuration & Secret Management

> [!CAUTION]
> Production secrets must never be committed to Git or shared over unencrypted channels. Secret keys should be transferred through the organization's secure password manager (e.g., HashiCorp Vault / 1Password Enterprise).

- **Location on Host:** `/etc/hrms/secrets.env` (Owned by `root:root`, permissions `0400`).
- **Template Reference:** [`docker-compose.prod.yml`](file:///c:/Kuldeep's%20Work/Projects/HR/docker-compose.prod.yml) and [`.env.production.example`](file:///c:/Kuldeep's%20Work/Projects/HR/.env.production.example).

### Key Configuration Variables

| Variable                      | Description                                               | Security Requirement                                 |
| :---------------------------- | :-------------------------------------------------------- | :--------------------------------------------------- |
| `NODE_ENV`                    | Must be set strictly to `production`                      | Prevents dev stack traces and enables secure cookies |
| `DATABASE_URL`                | PostgreSQL connection string                              | Dedicated `hrms_app_user` credentials                |
| `JWT_SECRET`                  | Primary JWT signing secret                                | 64+ character random cryptographic hex string        |
| `JWT_REFRESH_SECRET`          | Refresh token hashing secret                              | 64+ character random cryptographic hex string        |
| `SECURE_DOCUMENT_STORAGE_DIR` | Absolute path to encrypted document vault                 | Path must be mounted on persistent SAN volume        |
| `SMTP_HOST` / `SMTP_PORT`     | Corporate mail relay host (`mailrelay.internal.corp:587`) | TLS authentication required                          |

---

## 5. User & Role Administration Procedures

PeopleOS implements strict Role-Based Access Control (RBAC) enforced by NestJS Guards.

### 5.1 Supported Organizational Roles

1. **`ADMIN`:** Full administrative control over organization settings, branches, departments, designations, system configurations, and security audit logs.
2. **`HR`:** Employee lifecycle operations, leave ledger management, attendance overrides, MIS analytics reports, and authorized payroll processing.
3. **`MANAGER`:** Team roster access, pending request approvals (Leave, WFH, Official Visits), team attendance calendar.
4. **`EMPLOYEE`:** Self-service profile viewing, personal attendance punches, leave application submission, personal payslip downloads.

### 5.2 Initial Administrative Provisioning

Upon first deployment, the initial administrative account is seeded via:

```bash
# Execute within the database package directory
cd /opt/hrms/packages/database
pnpm run db:seed
```

_Immediate Action Required:_ The temporary seed password must be changed immediately upon first login at `https://hrms.internal.corp/profile`.

---

## 6. Backup, Restoration & Disaster Recovery Runbooks

- **Complete Backup SOP:** [`docs/deployment/backup-policy.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment/backup-policy.md)
- **Disaster Recovery SOP:** [`docs/deployment/disaster-recovery-runbook.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment/disaster-recovery-runbook.md)

### 6.1 Manual On-Demand Backup Execution

```bash
# Run backup script manually before maintenance
bash /opt/hrms/infrastructure/scripts/backup-db.sh

# Verifies backup archive and writes checksum to /var/backups/hrms/postgres/
```

### 6.2 Emergency Restoration SOP

```bash
# Restore specific timestamped backup archive
bash /opt/hrms/infrastructure/scripts/restore-db.sh /var/backups/hrms/postgres/hrms_backup_20261013_020000.sql.gz
```

---

## 7. Database Maintenance & Migration Runbook

- **Standard Procedure:** [`docs/deployment/database-operations.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment/database-operations.md)
- **Rule:** Never execute `prisma db push` or raw destructive SQL (`DROP TABLE`, `TRUNCATE`) in staging or production.
- **Applying Schema Upgrades:**
  ```bash
  # Check pending migrations
  docker compose -f docker-compose.prod.yml exec api pnpm --filter @hrms/database exec prisma migrate status

  # Apply linear migrations
  docker compose -f docker-compose.prod.yml exec api pnpm --filter @hrms/database exec prisma migrate deploy
  ```

---

## 8. Release, Upgrade & Rollback Procedures

- **Release Runbook:** [`docs/deployment/release-procedure.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment/release-procedure.md)
- **Rollback Runbook:** [`docs/deployment/rollback-procedure.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/deployment/rollback-procedure.md)

### Emergency Rollback Action

If an unexpected defect occurs immediately following a release:

```bash
# Execute automated rollback script
bash /opt/hrms/infrastructure/scripts/rollback-app.sh
```

---

## 9. Known Operational Limitations & Active Residual Risks

1. **Physical Host VM Allocation:** The software code, tests, and configurations are ready, but the physical VM (`10.14.32.10`) must be provisioned on Application VLAN 320 by the Data Center Virtualization Administrator.
2. **Corporate PKI TLS Certificate:** The self-signed development certificates must be replaced with corporate Root-CA signed X.509 certificates (`fullchain.pem` / `privkey.pem`) before end-user traffic is routed.
3. **Network Access Control (NAC):** Inbound firewall whitelisting for TCP 443 from user subnets (`10.14.0.0/16`) must be activated by the Network Operations Center.
4. **Executive Policy Alignment:** 3 operational business decisions documented in [`uat-plan.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/release/uat-plan.md) require final sign-off from HR and Finance leadership:
   - Sandwich Rule enforcement for consecutive weekend leave.
   - Grace period threshold for monthly late punches (15 minutes vs 30 minutes).
   - Loss of Pay (LOP) deduction basis (Calendar Days 30/31 vs Fixed Working Days 26).

---

## 10. Support Ownership & Escalation Contacts

| Role / Team                         | Responsibility                                                   | Contact Channel                  |
| :---------------------------------- | :--------------------------------------------------------------- | :------------------------------- |
| **Tier 1: HR Operations**           | User onboarding, leave balance adjustments, policy questions     | `hr-helpdesk@internal.corp`      |
| **Tier 2: IT Application Support**  | User account unlocking, session resets, email relay delivery     | `it-support@internal.corp`       |
| **Tier 3: Core Engineering**        | Bug fixes, database migration issues, code-level investigations  | `engineering-lead@internal.corp` |
| **Infrastructure & Virtualization** | VM uptime, CPU/RAM scaling, storage SAN allocation, backups      | `dc-infra@internal.corp`         |
| **Network & Security (NOC/SOC)**    | Firewall rules, NAC device whitelisting, SSL certificate renewal | `noc-team@internal.corp`         |
