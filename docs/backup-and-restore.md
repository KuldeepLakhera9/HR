# PeopleOS HRMS — Backup & Disaster Recovery Guide

**Document ID:** `TECH-BKP-004`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target RTO:** ≤ 2 Hours | **Target RPO:** ≤ 1 Hour

---

## 1. Automated Backup Architecture

PeopleOS incorporates automated backup procedures covering the relational database and the persistent employee document vault:

```bash
# Automated Daily Database Snapshot Script:
# Generates timestamped gzip archive and SHA-256 integrity hash:
bash infrastructure/scripts/backup-db.sh

# Target Destination: /var/backups/hrms/postgres/hrms_backup_<TIMESTAMP>.sql.gz
# Checksum File:      /var/backups/hrms/postgres/hrms_backup_<TIMESTAMP>.sql.gz.sha256
```

---

## 2. Tested Restoration Procedure

```bash
# Execute safe restoration from a verified snapshot:
bash infrastructure/scripts/restore-db.sh /var/backups/hrms/postgres/hrms_backup_20261013_020000.sql.gz
```

### Restoration Safety Features:

1. **SHA-256 Hash Validation:** Verifies file integrity before starting restoration.
2. **Active Client Termination:** Terminates conflicting PostgreSQL client connections to allow a clean drop and restore.
3. **Automated Row Count Verification:** Validates that core tables contain records post-restore.

---

## 3. Restoring the Employee Document Vault

```bash
# Extract document vault tarball into persistent storage:
sudo tar -xzf /var/backups/hrms/documents/hrms_docs_20261013_030000.tar.gz -C /var/hrms/storage/

# Enforce secure POSIX permissions:
sudo chown -R 1000:1000 /var/hrms/storage/documents
sudo find /var/hrms/storage/documents -type d -exec chmod 700 {} +
sudo find /var/hrms/storage/documents -type f -exec chmod 600 {} +
```
