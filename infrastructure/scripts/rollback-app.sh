#!/usr/bin/env bash
# ==============================================================================
# PeopleOS HRMS — Application and Database Safe Rollback Procedure
# ==============================================================================
set -euo pipefail

PREV_VERSION="${1:-}"
PRE_DEPLOY_BACKUP="${2:-}"

if [ -z "${PREV_VERSION}" ]; then
  echo "Usage: $0 <previous-image-tag-or-commit> [optional-pre-deploy-backup.sql.gz]"
  echo "Example: $0 v1.10.0 /var/backups/hrms/postgres/hrms_backup_pre_deploy.sql.gz"
  exit 1
fi

echo "[ALERT] [$(date)] Commencing rollback to version: '${PREV_VERSION}'..."

# 1. Stop current application services to prevent further database writes
echo "[STEP 1/5] Pausing current application containers (api, web)..."
docker compose stop api web

# 2. Database State Recovery (if pre-deployment backup provided)
if [ -n "${PRE_DEPLOY_BACKUP}" ] && [ -f "${PRE_DEPLOY_BACKUP}" ]; then
  echo "[STEP 2/5] Restoring database to pre-deployment state from: ${PRE_DEPLOY_BACKUP}..."
  bash "$(dirname "$0")/restore-db.sh" "${PRE_DEPLOY_BACKUP}"
else
  echo "[STEP 2/5] No pre-deploy backup file specified. Retaining database state as-is."
fi

# 3. Revert image tags or checkout previous release commit
echo "[STEP 3/5] Switching container image tag to '${PREV_VERSION}'..."
export APP_IMAGE_TAG="${PREV_VERSION}"

# 4. Launch previous container services
echo "[STEP 4/5] Starting rolled-back containers..."
docker compose up -d --no-deps api web nginx

# 5. Health Check & Validation
echo "[STEP 5/5] Performing post-rollback health checks..."
sleep 5
HEALTH_STATUS=$(docker compose exec -T api wget -qO- http://localhost:4000/api/v1/health || echo "FAILED")

if echo "${HEALTH_STATUS}" | grep -q '"status":"ok"'; then
  echo "[SUCCESS] Rollback verified successfully. Application restored to '${PREV_VERSION}'."
else
  echo "[ERROR] Health check failed post-rollback. Manual intervention required!"
  echo "Output: ${HEALTH_STATUS}"
  exit 1
fi
