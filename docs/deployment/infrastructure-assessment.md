# PeopleOS HRMS — Data-Center Infrastructure Assessment

**Document ID:** `INFRA-ASSESS-001`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center (with HPC Cluster & NAC Controls)  
**Status:** Approved Baseline  
**Classification:** Internal Confidential

---

## 1. Executive Summary

This assessment evaluates the current state of the PeopleOS Enterprise Human Resource Management System (HRMS) codebase to determine its readiness for on-premises deployment in our organization's private data center.

The data center environment features high-performance computing (HPC) nodes, dedicated virtualization infrastructure, corporate network access control (NAC), and stringent data-sovereignty mandates. This audit verifies that the application is fully self-contained, operates without public cloud runtime dependencies, enforces least-privilege security, and maintains absolute data integrity across all core HR and financial operations.

---

## 2. Technical Stack & Component Inventory

| Component Tier              | Technology & Version                             | Location in Monorepo                | Runtime Dependencies                     | Notes / Constraints                                                                                                                                   |
| :-------------------------- | :----------------------------------------------- | :---------------------------------- | :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend Web Portal**     | Next.js 14.2.24 (React 18.3.1, TypeScript 5.5.4) | `apps/web`                          | Node.js 20+ runtime                      | Server-Side Rendering (SSR) + Client Hydration; Tailwind CSS 3.4.17; Recharts 2.15; Lucide icons                                                      |
| **Backend Core API**        | NestJS 10.4.15 (Express 5.0, TypeScript 5.5.4)   | `apps/api`                          | Node.js 20+ runtime                      | Modular architecture; Swagger/OpenAPI docs (restricted in prod); argon2 for password hashing; PDFKit for in-memory streaming; SheetJS for XLSX export |
| **Database Engine**         | PostgreSQL 16 (Relational Engine)                | Managed Container / Dedicated VM    | `postgres:16-alpine`                     | Strictly isolated on backend bridge network; zero public port exposure; 26 linear Prisma migrations                                                   |
| **ORM & Data Layer**        | Prisma ORM 6.4.1                                 | `packages/database`                 | PostgreSQL client / Prisma engine        | Strictly uses `prisma migrate deploy` in staging/production; `prisma db push` strictly disallowed                                                     |
| **Shared Design System**    | `@hrms/ui` (React 18 component library)          | `packages/ui`                       | React 18, Tailwind                       | Standardized tokens: Warm Ivory (`#FAF8F5`), Deep Charcoal (`#1C1917`), Amber Gold (`#D97706`)                                                        |
| **Configuration & Types**   | `@hrms/config`, `@hrms/types`                    | `packages/config`, `packages/types` | TypeScript 5.5                           | Shared enums, role contracts, calculation constants, validation bounds                                                                                |
| **Reverse Proxy & Ingress** | Nginx Alpine                                     | `infrastructure/nginx`              | TLS 1.2/1.3 engine                       | Terminating proxy with HSTS, anti-caching for financial routes, client body limits (25MB)                                                             |
| **Document Storage**        | Local Encrypted Filesystem Vault                 | Host filesystem / persistent mount  | Local POSIX file system (`mode: 0600`)   | Managed by `DocumentsService`; strictly streamed over authenticated endpoints; magic-byte validation                                                  |
| **Task / Job Processing**   | In-process asynchronous workflows                | `apps/api` (Services)               | Node.js event loop & Prisma transactions | State-machine backed (`DRAFT` $\rightarrow$ `CALCULATING` $\rightarrow$ `REVIEW_PENDING`) with rollback and retry APIs                                |
| **Monorepo Build Tooling**  | Turborepo 2.11.7, pnpm 12.8.1                    | Root workspace                      | Node 20+                                 | Multi-package workspace with cached builds and type checking                                                                                          |

---

## 3. Detailed Repository Audit Findings

### 3.1 Authentication & Session Management

- **Token Mechanism:** Stateless JSON Web Tokens (JWT) signed with HMAC-SHA256. Access tokens expire in 15 minutes (`JWT_EXPIRATION=15m`), refresh tokens expire in 7 days (`JWT_REFRESH_EXPIRATION=7d`).
- **Storage:** Secure `httpOnly`, `sameSite: 'lax'`, `secure: true` cookies used in production, preventing client-side JavaScript access and mitigating cross-site scripting (XSS) session theft.
- **Password Security:** Password hashing is handled by `argon2` with high-memory and high-time cost parameters.
- **Role-Based Access Control (RBAC):** Four strict organizational roles (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`) enforced through NestJS `JwtAuthGuard`, `RolesGuard`, and `PermissionsGuard`. Frontend role switching in development is strictly reflected against backend authorization checks.
- **Session Revocation:** Supported via `auth_sessions` table tracking user agents, client IPs, last active timestamps, and revocation flags.

### 3.2 Database & Migration Mechanism

- **Prisma Schema:** Models 26 entities covering organizations, branches, departments, designations, users, employees, compensation assignments, attendance records, leave applications, review cycles, payroll runs, payslips, employee documents, and audit logs.
- **Composite Indexes:** Optimized composite indexes applied for high-concurrency payroll aggregation, employee directory filtering, attendance date ranges, and audit lookups.
- **Migration History:** 26 committed, linear migrations in `packages/database/prisma/migrations/`.
- **Integrity Rule:** `prisma migrate deploy` is strictly mandated for all pre-production and production releases.

### 3.3 File Uploads & Employee Document Storage

- **Vault Location:** Defined by environment variable `SECURE_DOCUMENT_STORAGE_DIR`, defaulting to `storage/documents` relative to process cwd.
- **Security Boundaries:**
  - Strict path traversal prevention: Canonical paths verified using `path.resolve` ensuring resolution cannot escape root.
  - Deep magic-byte validation: Buffer headers checked for PDF (`%PDF-`), JPEG, PNG, WebP, and DOCX signatures. Executables (`MZ`, `ELF`) and script injection vectors (`<script>`, `<svg>`, `<?php`) are strictly rejected.
  - POSIX File Permissions: Files written with atomic mode `0o600` (read/write by owner process only).
  - Storage Schema: Partitioned by `organizationId/employeeId/${documentId}.bin` to prevent filename collisions and enumeration attacks.
  - Payslip PDFs: Generated dynamically in-memory via `PayslipPdfService` using `pdfkit` as binary `Buffer` streams; **never** saved to unencrypted temporary files on disk.

### 3.4 Background Jobs & Asynchronous Workflows

- **State Machine Protection:** Payroll execution utilizes a database-backed state machine. If an orchestration worker crashes, runs fail safely back to `DRAFT` with diagnostic logs in `calculationLog: { error, failedAt }`.
- **Idempotency:** Retrying payroll calculation (`POST /payroll/runs/:id/retry`) purges previous calculation artifacts within an atomic database transaction before re-aggregating records.
- **External Dependencies:** Zero external message broker dependencies (e.g., RabbitMQ, Kafka) required for core functionality, simplifying data-center deployment.

### 3.5 Network, Ingress & Public Cloud Independence

- **Public Cloud Dependencies:** **None.** The application requires zero AWS, Azure, GCP, or third-party cloud services.
- **Database:** Standard PostgreSQL 16 engine runs locally on bare metal, VM, or container.
- **Email:** Pluggable `MailModule` supports standard SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) or fallback `console` driver for isolated air-gapped data centers.
- **Fonts & Assets:** All fonts (Inter, Outfit) and static assets are self-hosted within the Next.js bundle, preventing external CDN calls that could be blocked by Network Access Control (NAC).

---

## 4. Data-Center & HPC Cluster Environment Considerations

### 4.1 Nature of the Data-Center Environment

The target data center houses an HPC (High-Performance Computing) cluster used for computational workloads. The infrastructure team has established specific boundaries:

1. **Network Access Control (NAC):** Strictly blocks unauthorized internal traffic, prevents direct internet egress, and mandates device authentication and static port approvals.
2. **Compute Nodes vs. Application Services:** HPC compute nodes are scheduled via resource managers (e.g., Slurm / PBS) and are **not** designed for long-running HTTP services, web ingress, or persistent databases.
3. **No Root Access on Cluster:** Application deployment cannot assume root access, privileged container flags, or arbitrary port binding on shared compute nodes.

### 4.2 Architectural Recommendation for Hosting

- **Recommended Platform:** Deploy PeopleOS HRMS on a **dedicated enterprise application virtual machine (VM)** or an **approved internal container platform (e.g., Red Hat OpenShift, Kubernetes, or Docker on dedicated VM)** provisioned by the data-center virtualization team (VMware ESXi / Proxmox / KVM).
- **Storage Subsystem:** Mount high-performance persistent block storage (SAN/NAS with RAID-10 NVMe or SAS) for PostgreSQL database data (`/var/lib/postgresql/data`) and secure documents (`/var/hrms/storage/documents`).
- **Network Placement:** Place the HRMS application in a dedicated internal DMZ / Application VLAN with approved routing to corporate user subnets via the approved reverse proxy / load balancer.

---

## 5. Identified Risks and Gaps

| #     | Risk / Gap                                     |  Severity  | Description                                                                                                                                                | Phase 17 Remediation Plan                                                                                            |
| :---- | :--------------------------------------------- | :--------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **1** | Missing `.dockerignore` files                  |  **High**  | Docker context copying without `.dockerignore` includes `.git`, `.env`, and local `node_modules`, swelling build context and risking secret leaks.         | Create comprehensive root, API, and Web `.dockerignore` files.                                                       |
| **2** | Container processes running as root            |  **High**  | Existing Dockerfiles default to root user in Alpine runtime images.                                                                                        | Enforce non-privileged user (`USER node` UID 1000) in runner stages.                                                 |
| **3** | Unmounted document storage volume              |  **High**  | Existing `docker-compose.staging.yml` does not mount host persistent storage for `storage/documents`, risking document loss on container recreation.       | Add dedicated persistent volume mount for `storage/documents` in production Compose and standalone VM architectures. |
| **4** | Web port mismatch between Dockerfile and Nginx | **Medium** | `Dockerfile.web` exposed port 3000, while `package.json` had `"start": "next start -p 8080"`.                                                              | Align Next.js production start script to respect `$PORT` environment variable (default 3000 in containers).          |
| **5** | Missing production `.env` template             | **Medium** | No strictly locked `.env.production.example` existed to guide the infrastructure administrator on mandatory production tokens.                             | Create `.env.production.example` with zero insecure fallbacks.                                                       |
| **6** | Lack of comprehensive DR Runbook               | **Medium** | Pre-existing backup script existed, but lacked detailed RPO/RTO validation runbook, off-site replication protocol, and disaster recovery simulation steps. | Draft complete DR runbook and backup policy.                                                                         |

---

## 6. Open Questions Requiring Administrator Approval

Before executing production deployment in the physical data center, the following decisions must be submitted to the infrastructure administrator:

1. **Virtual Machine / Container Platform:** Will PeopleOS be hosted on a dedicated Linux Application VM (RHEL 9 / Ubuntu 24.04 LTS with Docker/Podman) or in an approved internal Kubernetes/OpenShift namespace?
2. **Reverse Proxy & Ingress:** Will TLS termination be handled by the internal F5 / Citrix NetScaler enterprise load balancer, an organizational Nginx reverse proxy, or the containerized Nginx instance?
3. **Internal DNS & TLS Certificates:** What is the approved internal FQDN (e.g., `https://hrms.internal.corp`)? Will the data-center PKI team issue an X.509 certificate signed by the corporate Enterprise Root CA?
4. **Persistent Storage Allocation:** Can the SAN administrator allocate:
   - 100 GB NVMe volume for PostgreSQL data (`/var/lib/postgresql/data`)?
   - 250 GB storage volume for employee documents (`/var/hrms/storage/documents`)?
   - 500 GB backup staging volume (`/var/backups/hrms`)?
5. **SMTP Gateway:** What is the internal IP and port of the corporate mail relay (e.g., `mailrelay.internal.corp:25` or `587`) for system notifications?
6. **Network Access Control (NAC) Approval:** Approval of inbound TCP port 443 from authorized corporate user subnets to the HRMS ingress VIP.
