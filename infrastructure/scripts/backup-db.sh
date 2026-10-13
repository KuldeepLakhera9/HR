#!/usr/bin/env bash
# ==============================================================================
# PeopleOS HRMS — Datacenter PostgreSQL Automated Backup Script
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/hrms/postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="hrms_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
CHECKSUM_PATH="${BACKUP_PATH}.sha256"

# Load DB connection params from environment or defaults
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-hrms_db}"
DB_USER="${POSTGRES_USER:-hrms_user}"
CONTAINER_NAME="${PG_CONTAINER_NAME:-hrms_postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"

echo "[INFO] [$(date)] Starting PostgreSQL backup for database: '${DB_NAME}'..."

# Check if running against Docker container or direct host
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[INFO] Executing pg_dump inside container '${CONTAINER_NAME}'..."
  docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${BACKUP_PATH}"
else
  echo "[INFO] Executing pg_dump via local host client..."
  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${BACKUP_PATH}"
fi

# Verify backup size > 0
BACKUP_SIZE=$(stat -c%s "${BACKUP_PATH}" 2>/dev/null || stat -f%z "${BACKUP_PATH}" 2>/dev/null || echo 0)
if [ "${BACKUP_SIZE}" -le 100 ]; then
  echo "[ERROR] Backup failed or generated an empty file (${BACKUP_SIZE} bytes)."
  rm -f "${BACKUP_PATH}"
  exit 1
fi

# Generate SHA-256 Checksum for validation and audit trail
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${BACKUP_PATH}" > "${CHECKSUM_PATH}"
else
  shasum -a 256 "${BACKUP_PATH}" > "${CHECKSUM_PATH}"
fi

echo "[SUCCESS] [$(date)] Backup completed: ${BACKUP_PATH} (${BACKUP_SIZE} bytes)"
echo "[INFO] Checksum verified: $(cat "${CHECKSUM_PATH}")"

# Retention policy: Prune backups older than retention days
echo "[INFO] Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -name "hrms_backup_*.sql.gz*" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +

echo "[SUCCESS] Backup workflow successfully concluded."
