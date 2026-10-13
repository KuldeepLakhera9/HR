#!/usr/bin/env bash
# ==============================================================================
# PeopleOS HRMS — Datacenter PostgreSQL Safe Restoration Script
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-backup-file.sql.gz>"
  echo "Example: $0 /var/backups/hrms/postgres/hrms_backup_20261013_080000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[ERROR] Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[INFO] [$(date)] Initiating safe database restoration from: ${BACKUP_FILE}"

# Verify SHA-256 Checksum if checksum file exists
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "[INFO] Validating SHA-256 integrity checksum..."
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${CHECKSUM_FILE}"
  else
    shasum -a 256 -c "${CHECKSUM_FILE}"
  fi
  echo "[SUCCESS] Integrity verified successfully."
else
  echo "[WARNING] Checksum file not found. Proceeding with caution."
fi

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-hrms_db}"
DB_USER="${POSTGRES_USER:-hrms_user}"
CONTAINER_NAME="${PG_CONTAINER_NAME:-hrms_postgres}"

# Terminate active client connections to target DB to allow clean restore
echo "[INFO] Terminating active connections to database '${DB_NAME}'..."
TERM_SQL="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "${TERM_SQL}" || true
  echo "[INFO] Restoring SQL archive into '${CONTAINER_NAME}'..."
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}"
  
  # Run Post-restore validation query
  echo "[INFO] Verifying table counts post-restore..."
  docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT count(*) AS total_payroll_runs FROM payroll_runs; SELECT count(*) AS total_snapshots FROM employee_payroll_snapshots;"
else
  PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "${TERM_SQL}" || true
  echo "[INFO] Restoring SQL archive via local client..."
  gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"
  
  echo "[INFO] Verifying table counts post-restore..."
  PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT count(*) AS total_payroll_runs FROM payroll_runs; SELECT count(*) AS total_snapshots FROM employee_payroll_snapshots;"
fi

echo "[SUCCESS] [$(date)] Database restoration completed and verified."
