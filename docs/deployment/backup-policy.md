# PeopleOS HRMS — Backup & Retention Policy

**Document ID:** `BKP-POL-006`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Purpose & Policy Objectives

The objective of the PeopleOS HRMS Backup & Retention Policy is to safeguard organizational workforce data, payroll snapshots, attendance logs, and private employee documentation against hardware failure, operator error, storage corruption, or site-level disasters.

---

## 2. Recovery Objectives (RPO & RTO)

The following service recovery targets are formally proposed for organizational sign-off:

| Metric                             |    Target     | Definition                                                                        | Infrastructure Implication                                                                               |
| :--------------------------------- | :-----------: | :-------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **Recovery Point Objective (RPO)** | **≤ 1 Hour**  | The maximum acceptable data loss measured in time.                                | Daily full database snapshot + continuous PostgreSQL Write-Ahead Log (WAL) archiving every 60 minutes.   |
| **Recovery Time Objective (RTO)**  | **≤ 2 Hours** | The maximum acceptable duration to restore service following a declared disaster. | Tested automated restoration scripts, pre-configured standby container images, and local backup staging. |

---

## 3. Scope of Backups

The automated backup procedure encompasses all stateful data required to rebuild the HRMS platform from bare metal:

1. **PostgreSQL Relational Database:** All relational tables (organizations, users, roles, permissions, employees, compensation, attendance, leaves, review cycles, payroll runs, payslips, and audit logs).
2. **Encrypted Document Vault:** The persistent file directory (`/var/hrms/storage/documents`) containing employee identity documents.
3. **Application & Infrastructure Configuration:** Version-controlled Docker Compose manifests, Nginx configurations, and systemd service definitions (excluding plaintext passwords).
4. **Prisma Migration State:** The schema migration history recorded in `_prisma_migrations`.

> **CRITICAL SECURITY NOTE:** Plaintext `.env` production secret files must **never** be placed into ordinary unencrypted backup archives. Secrets must be stored securely in the corporate Key Management Service (KMS) or Enterprise Password Vault.

---

## 4. Backup Schedule & Strategy

| Backup Type                        | Target Component              |         Frequency         |       Execution Window       |           Retention Period            | Storage Location                            |
| :--------------------------------- | :---------------------------- | :-----------------------: | :--------------------------: | :-----------------------------------: | :------------------------------------------ |
| **Full Database Snapshot**         | PostgreSQL Database           |           Daily           |          02:00 UTC           | 14 Days (Local)<br>90 Days (Off-site) | `/var/backups/hrms/postgres` + Off-site SAN |
| **Incremental WAL Archive**        | PostgreSQL WAL Files          | Continuous (Every 60 min) |          Continuous          |                7 Days                 | `/var/backups/hrms/wal`                     |
| **Document Vault Snapshot**        | `/var/hrms/storage/documents` |           Daily           |          03:00 UTC           |                30 Days                | `/var/backups/hrms/documents`               |
| **Pre-Deployment Safety Snapshot** | PostgreSQL Database           |          Ad-hoc           | Immediately prior to release |    Retained until release verified    | Local `/var/backups/hrms/pre-deploy`        |

---

## 5. Backup Encryption, Integrity & Storage Isolation

1. **Cryptographic Checksums:** Every backup archive is automatically paired with a SHA-256 integrity hash file (`.sha256`) immediately upon generation.
2. **Restricted Access Permissions:** Backup directories are owned by `root:root` with POSIX mode `0700`. Application runtime accounts (`node:node`) have **zero write access** to backup storage, mitigating ransomware threats.
3. **Storage Tiering & Off-Site Replication:**
   - **Tier 1 (Local Staging):** Backups are generated locally on the application host SAN volume for fast recovery.
   - **Tier 2 (Off-Host SAN/NFS):** Backups are replicated nightly to a geographically separated or physically isolated backup appliance.
4. **Automated Pruning:** Automated scripts purge local backups older than `BACKUP_RETENTION_DAYS` (default 14 days) to prevent disk volume exhaustion.

---

## 6. Routine Restoration Testing & Compliance

1. **Quarterly Restoration Drills:** Restoration procedures must be executed in a dedicated, isolated non-production staging environment every 90 days.
2. **Integrity Validation Criteria:**
   - Database restore completes with zero exit code errors.
   - Post-restore table count checks match source records (`SELECT count(*) FROM employees; SELECT count(*) FROM payroll_runs;`).
   - Application health check (`/api/v1/health`) reports database status `"connected"`.
   - Sample user authentication and payslip PDF generation succeed.
