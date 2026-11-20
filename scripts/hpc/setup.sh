#!/usr/bin/env bash
# ==============================================================================
# HPC / In-House Datacenter Zero-Root Setup Script
# Runs completely in user space without requiring sudo or root access.
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}    PeopleOS HRMS — HPC / Datacenter Zero-Root Setup        ${NC}"
echo -e "${BLUE}============================================================${NC}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Verify Node.js Environment
echo -e "\n${YELLOW}[1/6] Checking Node.js runtime...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not found in PATH.${NC}"
  echo -e "On HPC clusters, load the Node.js module (e.g., 'module load nodejs' or 'module load node/20'),"
  echo -e "or install Node.js in your user directory via nvm (https://github.com/nvm-sh/nvm)."
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Found Node.js version: ${NODE_VERSION}${NC}"

# 2. Verify or Install pnpm locally in user space
echo -e "\n${YELLOW}[2/6] Checking package manager (pnpm)...${NC}"
if ! command -v pnpm &> /dev/null; then
  echo -e "pnpm not found globally. Installing pnpm into user space..."
  if command -v corepack &> /dev/null; then
    corepack enable --install-directory "$HOME/.local/bin"
    export PATH="$HOME/.local/bin:$PATH"
  else
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PATH="$HOME/.local/share/pnpm:$PATH"
  fi
fi

PNPM_VERSION=$(pnpm -v)
echo -e "${GREEN}✓ Found pnpm version: ${PNPM_VERSION}${NC}"

# 3. Create Required Logs Directory
echo -e "\n${YELLOW}[3/6] Setting up runtime directories...${NC}"
mkdir -p "$PROJECT_ROOT/logs"
mkdir -p "$PROJECT_ROOT/backups"
mkdir -p "$PROJECT_ROOT/storage/documents"
echo -e "${GREEN}✓ Directories 'logs/', 'backups/', and 'storage/documents/' verified.${NC}"

# 4. Check Environment Configuration (.env)
echo -e "\n${YELLOW}[4/6] Verifying environment configuration...${NC}"
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    echo -e "No .env found. Creating .env from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo -e "${YELLOW}Please inspect and update $PROJECT_ROOT/.env with your datacenter database credentials.${NC}"
  else
    echo -e "${RED}Warning: No .env file found. Please create one with your DATABASE_URL.${NC}"
  fi
else
  echo -e "${GREEN}✓ Found existing .env file.${NC}"
fi

# 5. Install Dependencies
echo -e "\n${YELLOW}[5/6] Installing monorepo dependencies...${NC}"
pnpm install

# 6. Build Packages, Database Client, and Applications
echo -e "\n${YELLOW}[6/6] Generating Prisma client and compiling production binaries...${NC}"
pnpm --filter @hrms/database prisma generate
pnpm build

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}✓ Setup completed successfully! All binaries compiled.${NC}"
echo -e "${GREEN}============================================================${NC}"
echo -e "Next steps:"
echo -e "  1. Verify your DATABASE_URL in .env"
echo -e "  2. Run database migrations: pnpm --filter @hrms/database prisma migrate deploy"
echo -e "  3. Start the application:   bash scripts/hpc/start.sh"
echo -e "============================================================\n"
