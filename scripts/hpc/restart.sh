#!/usr/bin/env bash
# ==============================================================================
# HPC / In-House Datacenter Restart Script (Non-Root)
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "Restarting PeopleOS HRMS..."

if command -v pm2 &> /dev/null && pm2 list | grep -q 'hrms-'; then
  pm2 restart ecosystem.config.js
elif npx --no-install pm2 -v &> /dev/null || npx pm2 -v &> /dev/null; then
  npx pm2 restart ecosystem.config.js
else
  bash "$PROJECT_ROOT/scripts/hpc/stop.sh"
  sleep 1
  bash "$PROJECT_ROOT/scripts/hpc/start.sh"
fi

echo "Restart complete."
