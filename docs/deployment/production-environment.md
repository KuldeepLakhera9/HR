# PeopleOS HRMS — Production Target Environment Specification

**Document ID:** `INFRA-ENV-001`  
**Phase:** 19 — Controlled Production Deployment & Operational Handover  
**Target Environment:** Private Organizational Data Center (On-Premises HPC & Virtualization Cluster)  
**Status:** Approved Target Baseline  
**Classification:** Internal Confidential

---

## 1. Hosting Architecture & Infrastructure Boundaries

The PeopleOS Enterprise Human Resource Management System (HRMS) is designed for deployment within our organization's private data center.

### 1.1 HPC Cluster Boundary Enforcements

> [!IMPORTANT]
> **HPC Compute Node Separation Rule:**  
> The data center houses a High-Performance Computing (HPC) cluster managed by a batch scheduler (Slurm / PBS). High-performance compute nodes are strictly reserved for batch computational jobs and **must not** be used for long-running web applications, persistent ingress proxies, or stateful transactional databases.

- **Approved Hosting Platform:** Dedicated Enterprise Linux Virtual Machine (`hrms-prod-vm01`) provisioned on the data-center virtualization cluster (VMware ESXi / Proxmox / KVM Enterprise).
- **Network Placement:** Dedicated Application VLAN (`VLAN 320 - Application Tier`), isolated from both public internet and unauthenticated HPC compute fabrics.
- **Operating System:** Red Hat Enterprise Linux (RHEL) 9.4 (64-bit) or Ubuntu Server 24.04 LTS.
- **Hardware Sizing Allocation:**
  - **vCPU:** 8 Dedicated Virtual Cores (2.6 GHz+ Intel Xeon / AMD EPYC).
  - **Memory (RAM):** 32 GB ECC DDR4/DDR5.
  - **Primary OS Disk:** 100 GB SSD (RAID-1).
  - **Persistent SAN/NAS Mount:** 500 GB NVMe/SAS RAID-10 block storage.

---

## 2. Container & Runtime Specifications

- **Containerization Engine:** Docker Engine CE (v26.0+) or Rootless Podman (v4.9+), configured with `systemd` integration.
- **Service Isolation:** Multi-container topology orchestrated via [`docker-compose.prod.yml`](file:///c:/Kuldeep's%20Work/Projects/HR/docker-compose.prod.yml).
- **Container Network Topology:**
  - `hrms_frontend_network` (`172.28.1.0/24`): Bridge network connecting Nginx reverse proxy and Next.js frontend web portal.
  - `hrms_backend_network` (`172.28.2.0/24`): Bridge network connecting NestJS API core and PostgreSQL database.
  - **Database Port Isolation:** PostgreSQL port `5432` is bound **exclusively** to the internal backend bridge network; direct host port exposure is strictly disabled in production.

---

## 3. Database & Storage Architecture

### 3.1 Database Engine

- **Engine:** PostgreSQL 16.2 on Alpine Linux (`postgres:16-alpine`).
- **Connection Protocol:** TCP over internal bridge (`postgres:5432`), encrypted credentials via environment secrets.
- **Database Identity:** `hrms_production_db`.
- **Database Users:**
  - `hrms_admin`: Superuser used strictly during migration execution and schema upgrades.
  - `hrms_app_user`: Least-privilege runtime user; granted `SELECT`, `INSERT`, `UPDATE`, `DELETE` only. Privileges for `DROP TABLE`, `TRUNCATE`, and `ALTER TABLE` are strictly revoked.

### 3.2 Persistent Storage Mounts

- **Database Data Directory:**  
  Host path: `/var/hrms/pgdata`  
  Container mount: `/var/lib/postgresql/data`  
  Filesystem: XFS / EXT4 mounted from enterprise SAN with daily snapshot schedule.
- **Secure Document Vault:**  
  Host path: `/var/hrms/storage/documents`  
  Container mount: `/app/storage/documents`  
  File mode: POSIX `0600` (read/write by owner process UID `1001` only).

---

## 4. Network, DNS & Ingress Routing

### 4.1 Domain & Internal DNS Resolution

- **Internal Hostname:** `hrms.internal.corp`
- **Internal IP VIP:** `10.14.32.10` (Ingress Virtual IP on Application VLAN 320).
- **DNS Server:** Internal Corporate DNS Servers (`10.14.1.10`, `10.14.1.11`).

### 4.2 Network Access Control (NAC) & Firewall Matrix

| Source Network                                 | Destination VIP                     | Protocol / Port | Purpose                                               |   Approval Status    |
| :--------------------------------------------- | :---------------------------------- | :-------------- | :---------------------------------------------------- | :------------------: |
| Corporate Workstation Subnets (`10.14.0.0/16`) | `10.14.32.10`                       | TCP 443 (HTTPS) | Secure Web & API access for employees and admins      |  **PENDING ADMIN**   |
| Corporate Workstation Subnets (`10.14.0.0/16`) | `10.14.32.10`                       | TCP 80 (HTTP)   | Automatic redirect to HTTPS (`301 Moved Permanently`) |  **PENDING ADMIN**   |
| `hrms-prod-vm01`                               | Corporate Mail Relay (`10.14.2.25`) | TCP 587 (SMTP)  | Automated transactional notifications                 |  **PENDING ADMIN**   |
| `hrms-prod-vm01`                               | Corporate NTP (`10.14.1.5`)         | UDP 123 (NTP)   | System time synchronization (< 1ms drift)             |     **APPROVED**     |
| Any External Internet                          | `10.14.32.10`                       | ALL PORTS       | Public ingress                                        | **DENIED / BLOCKED** |

---

## 5. Security, Certificates & Secret Management

### 5.1 TLS / SSL Certificate Infrastructure

- **Certificate Source:** Corporate Enterprise Root CA (X.509 v3 PKI).
- **Certificate Bundle:** `/etc/nginx/certs/hrms_internal_fullchain.pem`.
- **Private Key:** `/etc/nginx/certs/hrms_internal_privkey.pem` (mode `0400`, owned by `root`).
- **Protocols Supported:** TLS 1.2 and TLS 1.3 exclusively. Insecure ciphers (SSLv3, TLS 1.0, TLS 1.1, RC4, 3DES) are disabled in [`nginx.prod.conf`](file:///c:/Kuldeep's%20Work/Projects/HR/infrastructure/nginx/nginx.prod.conf).

### 5.2 Secret Injection Architecture

> [!CAUTION]
> Production secrets must never be placed in source control, container build layers, or shared drive volumes.

- **Injection Mechanism:** Production environment variables injected at container runtime via secure root-owned file `/etc/hrms/secrets.env` (permissions `0400`).
- **Secret Placeholders Reference:**
  ```bash
  NODE_ENV=production
  DATABASE_URL=postgresql://hrms_app_user:{{SECURE_DB_PASSWORD}}@postgres:5432/hrms_production_db
  JWT_SECRET={{SECURE_HIGH_ENTROPY_JWT_SECRET_MIN_64_CHARS}}
  JWT_REFRESH_SECRET={{SECURE_HIGH_ENTROPY_REFRESH_SECRET_MIN_64_CHARS}}
  ENCRYPTION_MASTER_KEY={{SECURE_AES256_HEX_ENCRYPTION_KEY}}
  SMTP_HOST=mailrelay.internal.corp
  SMTP_PORT=587
  SMTP_USER=hrms-mailer@internal.corp
  SMTP_PASS={{SECURE_SMTP_SERVICE_PASSWORD}}
  ```

---

## 6. Backup Destination & Storage Quotas

- **Backup Target NFS Mount:** `10.14.40.50:/nfs/backups/hrms/` mounted at `/var/backups/hrms/` on the VM.
- **Backup Script:** Automated via [`infrastructure/scripts/backup-db.sh`](file:///c:/Kuldeep's%20Work/Projects/HR/infrastructure/scripts/backup-db.sh).
- **Backup Frequency:**
  - Automated cron schedule: Nightly at `02:00 IST`.
  - Compression: Gzip level 9 (`.sql.gz`).
  - Integrity Check: SHA-256 hash generated and validated alongside every archive (`.sha256`).
- **Retention Policy:** 30 daily rolling backups, 12 monthly archival snapshots, immutable append-only flag enabled on backup repository.

---

## 7. Monitoring & Operational Support

- **Health Probe Endpoint:** `GET https://hrms.internal.corp/api/v1/health`
- **Telemetry System:** Prometheus scraping `/api/v1/health` and node metrics at 15-second intervals.
- **Log Management:**
  - Docker JSON log rotation: Maximum 5 files of 50 MB each (`max-size: 50m`, `max-file: 5`).
  - System logs forwarded to central data-center syslog server (`10.14.5.20`).
- **Escalation Contacts:**
  - Data Center Virtualization Team: `dc-virtualization@internal.corp`
  - Network Operations Center (NOC): `noc-team@internal.corp`
  - HRMS Application Operations: `hrms-ops@internal.corp`
