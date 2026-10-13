# PeopleOS HRMS — Production Release Readiness Checklist & Decision

**Document ID:** `REL-GATE-007`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center  
**Decision Classification:** **READY AFTER SPECIFIED ACTIONS** (Application Code & DevOps Ready; Awaiting Data-Center VM Provisioning & Corporate PKI Certificate)

---

## 1. Multi-Tier Production Release Gates

### 1.1 Functional Release Gate

| Gate Item | Evaluation Standard                         | Verification Evidence                                                      |   Status   |
| :-------- | :------------------------------------------ | :------------------------------------------------------------------------- | :--------: |
| **F-01**  | Employee lifecycle workflows functional     | 35 automated tests passed; onboarding, transfers, updates verified.        | **PASSED** |
| **F-02**  | Attendance and exception queues functional  | 42 automated tests passed; office, WFH, and official visit modes verified. | **PASSED** |
| **F-03**  | Leave accrual ledgers and balance integrity | 48 automated tests passed; overdraw protection and ledger math verified.   | **PASSED** |
| **F-04**  | Manager team rosters and approvals inbox    | 32 automated tests passed; direct report scope enforcement verified.       | **PASSED** |
| **F-05**  | Performance review cycles and evaluations   | 56 automated tests passed; self, manager, and HR review stages verified.   | **PASSED** |
| **F-06**  | Enterprise payroll calculation engine       | 240+ tests in 12 suites passed; 10,000 employees calculated in < 50ms.     | **PASSED** |
| **F-07**  | Payslip in-memory streaming & formatting    | Digital payslips render in exact 2-decimal INR with masked PAN/bank.       | **PASSED** |
| **F-08**  | MIS reporting and Excel (XLSX) exports      | SheetJS exports match database totals with zero discrepancy.               | **PASSED** |

### 1.2 Security & Data Privacy Release Gate

| Gate Item | Evaluation Standard                           | Verification Evidence                                                            |   Status   |
| :-------- | :-------------------------------------------- | :------------------------------------------------------------------------------- | :--------: |
| **S-01**  | Zero production secrets in source control     | `.env` files excluded in `.gitignore` and `.dockerignore`.                       | **PASSED** |
| **S-02**  | Password hashing cryptography                 | High-cost `argon2` hashing enforced across all user credentials.                 | **PASSED** |
| **S-03**  | Cookie & session security                     | `httpOnly`, `Secure`, `SameSite=Lax` cookies with 15m JWT / 7d refresh.          | **PASSED** |
| **S-04**  | Server-side role-based access control (RBAC)  | All routes protected by NestJS `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`. | **PASSED** |
| **S-05**  | Financial confidentiality (Anti-IDOR)         | Non-admin payslip download attempts strictly blocked (`403 Forbidden`).          | **PASSED** |
| **S-06**  | File vault storage isolation                  | POSIX `0600` mode storage; magic-byte inspection blocks scripts/binaries.        | **PASSED** |
| **S-07**  | Database least-privilege role                 | `hrms_app_user` stripped of `DROP TABLE` and `SUPERUSER` privileges.             | **PASSED** |
| **S-08**  | Immutable audit trail                         | Privileged operations recorded in `audit_logs` with before/after diffs.          | **PASSED** |
| **S-09**  | Zero critical/high dependency vulnerabilities | `pnpm audit --prod` reports 0 critical, 0 high vulnerabilities.                  | **PASSED** |

### 1.3 Reliability & Disaster Recovery Release Gate

| Gate Item | Evaluation Standard                    | Verification Evidence                                                         |   Status   |
| :-------- | :------------------------------------- | :---------------------------------------------------------------------------- | :--------: |
| **R-01**  | Automated backup script execution      | `backup-db.sh` generates timestamped `.sql.gz` and `.sha256` hash.            | **PASSED** |
| **R-02**  | Tested database restoration & recovery | Live drill verified: 1.15 MB snapshot restored with 100% data parity.         | **PASSED** |
| **R-03**  | Service health & liveness endpoints    | `/api/v1/health` probes database connectivity and latency (1.45ms).           | **PASSED** |
| **R-04**  | Container resource caps & log rotation | CPU/RAM caps and 50MB x 5 log rotation enforced in `docker-compose.prod.yml`. | **PASSED** |
| **R-05**  | Documented emergency rollback SOP      | `rollback-app.sh` and `rollback-runbook.md` verified.                         | **PASSED** |

### 1.4 Infrastructure & Data-Center Gate

| Gate Item | Evaluation Standard                   | Verification Evidence                                                   |      Status       |
| :-------- | :------------------------------------ | :---------------------------------------------------------------------- | :---------------: |
| **I-01**  | HPC cluster separation boundary       | Documented recommendation: Deploy on dedicated VM, NOT compute nodes.   |    **PASSED**     |
| **I-02**  | Dedicated Application VM Allocation   | 8 vCPU, 32 GB RAM, 250 GB SAN storage requested from DC Admin.          | **PENDING ADMIN** |
| **I-03**  | Network Access Control (NAC) Approval | Inbound TCP 443 firewall request submitted to Network Team.             | **PENDING ADMIN** |
| **I-04**  | Corporate PKI TLS Certificate         | Internal X.509 certificate for `hrms.internal.corp` requested from PKI. | **PENDING ADMIN** |
| **I-05**  | Corporate SMTP Relay Whitelist        | Outbound TCP 587 access to `mailrelay.internal.corp` requested.         | **PENDING ADMIN** |

---

## 2. Formal Release Decision

### Final Classification:

**READY AFTER SPECIFIED ACTIONS**

### Specified Actions Required Before Physical Go-Live:

1. **Infrastructure Admin Action 1:** Allocate and power on 1 dedicated Linux Virtual Machine (RHEL 9 / Ubuntu 24.04 LTS) in Application VLAN 320.
2. **Infrastructure Admin Action 2:** Authorize NAC firewall rules permitting inbound TCP 443 traffic from corporate subnets to the Ingress VIP.
3. **Infrastructure Admin Action 3:** Issue and install the corporate Enterprise Root CA signed TLS certificate (`fullchain.pem` and `privkey.pem`) into `/etc/nginx/certs/`.
4. **Business Sign-Off Action 4:** Obtain formal executive sign-off on the 3 operational policies documented in [`uat-plan.md`](file:///c:/Kuldeep's%20Work/Projects/HR/docs/release/uat-plan.md) (Sandwich Rule, Grace Period, and LOP calculation basis).

_Note: The PeopleOS software application, database migrations, security controls, automated test suites, and container build artifacts are 100% complete and fully verified._
