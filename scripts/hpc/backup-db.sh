#!/usr/bin/env bash
# ==============================================================================
# Automated Database Backup Script (Non-Root / Crontab Friendly)
# Runs pg_dump, compresses with gzip, generates SHA-256 checksum,
# and enforces a 7-day retention policy.
#
# Can be scheduled in user crontab: crontab -e
# 0 2 * * * /path/to/HR/scripts/hpc/backup-db.sh >> /path/to/HR/logs/backup.log 2>&1
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Extract database connection details from .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs -d '\n')
fi

# Fallback values
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_DB:-hrms_db}"
PGUSER="${POSTGRES_USER:-hrms_user}"

BACKUP_FILE="$BACKUP_DIR/${PGDATABASE}_backup_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting automated database backup for '$PGDATABASE'..."

if ! command -v pg_dump &> /dev/null; then
  echo "Error: pg_dump command not found. Ensure PostgreSQL tools are in PATH."
  exit 1
fi

# Execute pg_dump with gzip compression
if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
else
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE" | gzip > "$BACKUP_FILE"
fi

# Generate SHA256 checksum for backup integrity verification
if command -v sha256sum &> /dev/null; then
  sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
fi

BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Enforce retention policy: delete backups older than $RETENTION_DAYS days
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Purging backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*_backup_*.sql.gz*" -type f -mtime +$RETENTION_DAYS -exec rm -f {} \;

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup routine completed successfully."
