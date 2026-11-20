#!/usr/bin/env bash
# ==============================================================================
# HPC / In-House Datacenter Status Script (Non-Root)
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "============================================================"
echo "    PeopleOS HRMS — Cluster Process & Port Status           "
echo "============================================================"

# Check PM2
if command -v pm2 &> /dev/null; then
  pm2 status
elif npx --no-install pm2 -v &> /dev/null || npx pm2 -v &> /dev/null; then
  npx pm2 status
else
  echo -e "\n--- Background Process PIDs ---"
  if [ -f "$PROJECT_ROOT/logs/api.pid" ]; then
    echo "API PID: $(cat logs/api.pid) (Running: $(kill -0 $(cat logs/api.pid) 2>/dev/null && echo 'YES' || echo 'NO'))"
  else
    echo "API PID file: Not running"
  fi

  if [ -f "$PROJECT_ROOT/logs/web.pid" ]; then
    echo "Web PID: $(cat logs/web.pid) (Running: $(kill -0 $(cat logs/web.pid) 2>/dev/null && echo 'YES' || echo 'NO'))"
  else
    echo "Web PID file: Not running"
  fi
fi

echo -e "\n--- Listening Ports Check (4000 & 8080) ---"
if command -v ss &> /dev/null; then
  ss -tulpn 2>/dev/null | grep -E ':4000|:8080' || echo "Ports 4000 or 8080 not found in ss output."
elif command -v netstat &> /dev/null; then
  netstat -tuln 2>/dev/null | grep -E '4000|8080' || echo "Ports 4000 or 8080 not found in netstat output."
fi

echo -e "\n--- Recent Log Activity (last 5 lines) ---"
if [ -f "$PROJECT_ROOT/logs/api-out.log" ]; then
  echo ">> API Logs (logs/api-out.log):"
  tail -n 5 "$PROJECT_ROOT/logs/api-out.log"
fi
if [ -f "$PROJECT_ROOT/logs/web-out.log" ]; then
  echo ">> Web Logs (logs/web-out.log):"
  tail -n 5 "$PROJECT_ROOT/logs/web-out.log"
fi
echo "============================================================"
