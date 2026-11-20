# PeopleOS HRMS — HPC Cluster & In-House Datacenter Deployment Guide

## Complete Non-Root, Zero-Docker Bare-Metal Architecture

This guide explains how to deploy and manage **PeopleOS HRMS** on an in-house datacenter or HPC (High Performance Computing) cluster where **Docker and root/sudo permissions are restricted**.

---

## 1. Why Zero-Docker is Ideal for HPC Clusters

In institutional and enterprise HPC environments:

- The Docker daemon requires `sudo` / root access (`/var/run/docker.sock`), which is strictly forbidden on multi-user compute nodes.
- **PeopleOS HRMS is built natively with TypeScript, Node.js, and PostgreSQL**.
- The entire stack runs **100% in user space** with zero administrative privileges.

```
+---------------------------------------------------------------------------------+
|                       HPC / Datacenter Node (User Space)                        |
|                                                                                 |
|  +--------------------+     +--------------------+     +---------------------+  |
|  |    Next.js Web     |     |    NestJS API      |     |  PostgreSQL 16      |  |
|  |    (Port 8080)     | <-> |    (Port 4000)     | <-> |  (Port 5432)        |  |
|  +--------------------+     +--------------------+     +---------------------+  |
|           ^                          ^                            ^             |
|           +----------- PM2 / User Process Manager ---------------+             |
+---------------------------------------------------------------------------------+
```

---

## 2. In-House Database Management Strategies (Choose 1 of 3)

### Option A: Dedicated Central Datacenter Database (Recommended & Simplest)

If your in-house datacenter has an existing PostgreSQL instance, VM, or managed database server:

1. Obtain the connection string from your datacenter administrator.
2. Put it in your `.env` file on the HPC cluster:
   ```env
   DATABASE_URL="postgresql://hrms_user:YOUR_STRONG_PASSWORD@192.168.1.50:5432/hrms_db?schema=public"
   ```
3. Run migrations:
   ```bash
   pnpm --filter @hrms/database prisma migrate deploy
   ```

---

### Option B: Native User-Space PostgreSQL (No Root Required!)

PostgreSQL **does not require root permissions to run**. Any Linux user account can initialize and run a private PostgreSQL server inside their user directory.

We have included an automated script to set this up in one command:

```bash
# Initializes and starts PostgreSQL in $HOME/hrms_pgdata on port 5432
bash scripts/hpc/init-user-db.sh
```

#### Manual Steps (for reference):

```bash
# 1. Load PostgreSQL module if on an HPC environment with Environment Modules:
module load postgresql # or: module load postgres

# (Alternatively, if PostgreSQL is not on the cluster, install via conda without root):
# conda create -y -n pg postgresql && conda activate pg

# 2. Initialize private database cluster in your home or project directory:
initdb -D $HOME/hrms_pgdata -U hrms_user -A scram-sha-256 --pwprompt

# 3. Start PostgreSQL as regular user (non-root):
pg_ctl -D $HOME/hrms_pgdata -l $HOME/hrms_postgres.log -o "-p 5432 -h 127.0.0.1" start

# 4. Create the application database:
createdb -U hrms_user -h 127.0.0.1 -p 5432 hrms_db

# 5. Stop PostgreSQL when maintenance is needed:
pg_ctl -D $HOME/hrms_pgdata stop
```

---

### Option C: HPC Container Standard — Apptainer / Singularity

If your HPC administrator recommends containerized workloads, use **Apptainer (formerly Singularity)** instead of Docker. Apptainer is the global standard for HPC because it executes container images with **zero root daemon**:

```bash
# 1. Pull the official PostgreSQL image (converts to a single user file without root):
apptainer build postgres.sif docker://postgres:16-alpine

# 2. Start PostgreSQL instance in user space:
mkdir -p $HOME/pgdata
apptainer instance start \
  --bind $HOME/pgdata:/var/lib/postgresql/data \
  --env POSTGRES_USER=hrms_user,POSTGRES_PASSWORD=secure_pass,POSTGRES_DB=hrms_db \
  postgres.sif pg_instance

# 3. Stop instance:
apptainer instance stop pg_instance
```

---

## 3. Automated Database Backups & Maintenance (Non-Root)

To guarantee zero data loss, schedule daily automated backups using Linux user crontab (`crontab -e`). No root access is required.

### 1. Automated Backup Script

Run the pre-configured script:

```bash
bash scripts/hpc/backup-db.sh
```

This script:

- Generates a gzip-compressed SQL dump (`backups/hrms_db_backup_YYYY-MM-DD_HH-MM-SS.sql.gz`).
- Computes SHA-256 checksums to verify archive integrity.
- Automatically deletes backups older than 7 days to preserve HPC disk quota.

### 2. Schedule via User Crontab

Open user crontab:

```bash
crontab -e
```

Add the following line to run daily at 2:00 AM:

```cron
0 2 * * * /path/to/HR/scripts/hpc/backup-db.sh >> /path/to/HR/logs/backup.log 2>&1
```

### 3. How to Restore a Database Backup

If disaster recovery is ever needed:

```bash
gunzip -c backups/hrms_db_backup_2026-11-20_02-00-00.sql.gz | psql -U hrms_user -h 127.0.0.1 -p 5432 -d hrms_db
```

---

## 4. Application Quick-Start Guide (Step-by-Step)

### Step 1: Clone and Configure Environment

```bash
git clone https://github.com/KuldeepLakhera9/HR.git
cd HR

# Copy environment template
cp .env.example .env

# Edit .env with your database URL, JWT secret, and listening ports:
nano .env
```

### Step 2: Run Setup (Compiles All Code in User Space)

```bash
bash scripts/hpc/setup.sh
```

_(Installs dependencies via user-space pnpm, generates Prisma client, and compiles NestJS API and Next.js frontend)._

### Step 3: Run Database Migrations

```bash
pnpm --filter @hrms/database prisma migrate deploy
```

### Step 4: Start Services

```bash
bash scripts/hpc/start.sh
```

- Frontend UI will be available at: `http://<node-ip>:8080`
- Backend API will be available at: `http://<node-ip>:4000/api/v1`

### Step 5: Useful Operation Commands

| Action                 | Command                                              |
| ---------------------- | ---------------------------------------------------- |
| Check status & ports   | `bash scripts/hpc/status.sh` or `pnpm hpc:status`    |
| View live logs         | `npx pm2 logs` or `tail -f logs/api-out.log`         |
| Restart services       | `bash scripts/hpc/restart.sh` or `pnpm hpc:restart`  |
| Stop services          | `bash scripts/hpc/stop.sh` or `pnpm hpc:stop`        |
| Manual database backup | `bash scripts/hpc/backup-db.sh` or `pnpm hpc:backup` |

---

## 5. Security & Access Considerations on HPC

1. **Network Firewall & Ingress**: If compute nodes are on a private cluster network (e.g. `10.x.x.x` or `192.168.x.x`), open ports `8080` (Web) and `4000` (API) on the node, or configure the cluster's login/gateway node to reverse-proxy traffic to your compute node.
2. **File Permissions**: Keep your `.env` file readable only by your user account:
   ```bash
   chmod 600 .env
   ```
3. **Persistent Storage**: Ensure your database directory (`$HOME/hrms_pgdata` or datacenter volume) resides on persistent storage rather than node-local temporary RAM disks (`/tmp`).
