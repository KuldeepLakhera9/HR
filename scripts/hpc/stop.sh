#!/usr/bin/env bash
# ==============================================================================
# HPC / In-House Datacenter Stop Script (Non-Root)
# ==============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "Stopping PeopleOS HRMS services..."

# Check PM2 first
if command -v pm2 &> /dev/null && pm2 list | grep -q 'hrms-'; then
  pm2 stop ecosystem.config.js || true
  pm2 delete ecosystem.config.js || true
  echo "✓ Stopped PM2 managed instances."
elif npx --no-install pm2 -v &> /dev/null || npx pm2 -v &> /dev/null; then
  npx pm2 stop ecosystem.config.js 2>/dev/null || true
  npx pm2 delete ecosystem.config.js 2>/dev/null || true
  echo "✓ Stopped PM2 managed instances."
fi

# Also check PID files fallback
if [ -f "$PROJECT_ROOT/logs/api.pid" ]; then
  PID=$(cat "$PROJECT_ROOT/logs/api.pid")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "✓ Stopped API process (PID: $PID)"
  fi
  rm -f "$PROJECT_ROOT/logs/api.pid"
fi

if [ -f "$PROJECT_ROOT/logs/web.pid" ]; then
  PID=$(cat "$PROJECT_ROOT/logs/web.pid")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "✓ Stopped Web process (PID: $PID)"
  fi
  rm -f "$PROJECT_ROOT/logs/web.pid"
fi

echo "All services stopped."
