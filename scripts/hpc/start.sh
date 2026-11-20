#!/usr/bin/env bash
# ==============================================================================
# HPC / In-House Datacenter Start Script (Non-Root / PM2 User-Space)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}Starting PeopleOS HRMS on HPC Cluster...${NC}"

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Check if PM2 is available locally or via npx
if command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}Starting services via global PM2...${NC}"
  pm2 start ecosystem.config.js
elif npx --no-install pm2 -v &> /dev/null || npx pm2 -v &> /dev/null; then
  echo -e "${YELLOW}Starting services via user-space npx pm2...${NC}"
  npx pm2 start ecosystem.config.js
else
  echo -e "${YELLOW}PM2 not detected. Starting services using background process manager...${NC}"
  
  # Start API
  if [ -f "$PROJECT_ROOT/logs/api.pid" ] && kill -0 $(cat "$PROJECT_ROOT/logs/api.pid") 2>/dev/null; then
    echo -e "${YELLOW}API server is already running (PID: $(cat "$PROJECT_ROOT/logs/api.pid"))${NC}"
  else
    echo "Starting @hrms/api on port 4000..."
    NODE_ENV=production PORT=4000 nohup node apps/api/dist/main.js > logs/api-out.log 2> logs/api-error.log &
    echo $! > logs/api.pid
    echo -e "${GREEN}✓ API server started (PID: $(cat logs/api.pid))${NC}"
  fi

  # Start Web
  if [ -f "$PROJECT_ROOT/logs/web.pid" ] && kill -0 $(cat "$PROJECT_ROOT/logs/web.pid") 2>/dev/null; then
    echo -e "${YELLOW}Web server is already running (PID: $(cat "$PROJECT_ROOT/logs/web.pid"))${NC}"
  else
    echo "Starting @hrms/web on port 8080..."
    NODE_ENV=production PORT=8080 nohup npx next start apps/web -p 8080 > logs/web-out.log 2> logs/web-error.log &
    echo $! > logs/web.pid
    echo -e "${GREEN}✓ Web server started (PID: $(cat logs/web.pid))${NC}"
  fi
fi

sleep 2
echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}✓ PeopleOS HRMS is running!${NC}"
echo -e "  Frontend UI:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):8080"
echo -e "  Backend API:  http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):4000/api/v1"
echo -e "  Check status: bash scripts/hpc/status.sh"
echo -e "  Stop servers: bash scripts/hpc/stop.sh"
echo -e "${GREEN}============================================================${NC}\n"
