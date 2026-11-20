#!/usr/bin/env bash
# ==============================================================================
# HPC Non-Root User-Space PostgreSQL Cluster Initializer
# PostgreSQL natively DOES NOT REQUIRE ROOT!
# This script initializes and starts a private PostgreSQL instance in $HOME/hrms_pgdata.
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PG_DATA_DIR="${PG_DATA_DIR:-$HOME/hrms_pgdata}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-hrms_user}"
PG_DB="${PG_DB:-hrms_db}"
PG_LOG="${PG_LOG:-$HOME/hrms_postgres.log}"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  User-Space PostgreSQL Initializer (Zero Root Required)    ${NC}"
echo -e "${BLUE}============================================================${NC}"

# Check for initdb and postgres commands
if ! command -v initdb &> /dev/null; then
  echo -e "${RED}Error: 'initdb' command not found in PATH.${NC}"
  echo -e "On HPC clusters:"
  echo -e "  1. Try loading the PostgreSQL module: 'module load postgresql' or 'module avail postgres'"
  echo -e "  2. Or install PostgreSQL locally in user-space using Conda/Mamba without root:"
  echo -e "     conda create -y -n pg postgresql && conda activate pg"
  exit 1
fi

if [ -d "$PG_DATA_DIR" ] && [ -f "$PG_DATA_DIR/PG_VERSION" ]; then
  echo -e "${YELLOW}Existing PostgreSQL cluster found at: $PG_DATA_DIR${NC}"
else
  echo -e "${YELLOW}Initializing new PostgreSQL data directory at: $PG_DATA_DIR...${NC}"
  mkdir -p "$PG_DATA_DIR"
  initdb -D "$PG_DATA_DIR" -U "$PG_USER" -A scram-sha-256 --pwprompt

  # Tune postgresql.conf for HPC user space
  echo -e "\n# HPC User-Space Configuration" >> "$PG_DATA_DIR/postgresql.conf"
  echo "port = $PG_PORT" >> "$PG_DATA_DIR/postgresql.conf"
  echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA_DIR/postgresql.conf"
  echo "max_connections = 100" >> "$PG_DATA_DIR/postgresql.conf"
  echo "shared_buffers = 512MB" >> "$PG_DATA_DIR/postgresql.conf"
  echo "work_mem = 16MB" >> "$PG_DATA_DIR/postgresql.conf"

  # Configure pg_hba.conf
  echo "host all all 127.0.0.1/32 scram-sha-256" >> "$PG_DATA_DIR/pg_hba.conf"
fi

# Start the PostgreSQL server
echo -e "\nStarting PostgreSQL server on port $PG_PORT..."
pg_ctl -D "$PG_DATA_DIR" -l "$PG_LOG" -o "-p $PG_PORT" start

sleep 2

# Check if database exists, create if missing
if ! psql -U "$PG_USER" -p "$PG_PORT" -h 127.0.0.1 -lqt | cut -d \| -f 1 | grep -qw "$PG_DB"; then
  echo "Creating database '$PG_DB'..."
  createdb -U "$PG_USER" -p "$PG_PORT" -h 127.0.0.1 "$PG_DB"
  echo -e "${GREEN}✓ Database '$PG_DB' created successfully.${NC}"
fi

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}✓ PostgreSQL is running in user space on port $PG_PORT!${NC}"
echo -e "  Data Directory: $PG_DATA_DIR"
echo -e "  Logs:           $PG_LOG"
echo -e "  DATABASE_URL:   postgresql://$PG_USER:<your_password>@127.0.0.1:$PG_PORT/$PG_DB?schema=public"
echo -e "\nTo stop this PostgreSQL server later:"
echo -e "  pg_ctl -D $PG_DATA_DIR stop"
echo -e "============================================================\n"
