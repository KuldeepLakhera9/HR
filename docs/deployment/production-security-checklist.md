# PeopleOS HRMS — Production Security Audit & Verification Checklist

**Document ID:** `SEC-CHECK-013`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Security Compliance Audit

---

## 1. Executive Security Assessment

This document verifies the technical and operational security controls implemented within the PeopleOS HRMS monorepo prior to production release. Every control listed has been verified against active code in the repository.

---

## 2. Security Control Verification Matrix

| Category                | Security Control            | Active Implementation in Repository                                                                                                                                       | Verification Status |
| :---------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-----------------: |
| **Authentication**      | Password Hashing            | `argon2` with high memory/time cost parameters in [`UsersService`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/users/users.service.ts) and Auth modules. |    **VERIFIED**     |
| **Authentication**      | Token Lifetimes             | 15-minute access token (`JWT_EXPIRATION=15m`), 7-day refresh token in secure `httpOnly` cookie.                                                                           |    **VERIFIED**     |
| **Authentication**      | Session Revocation          | Active sessions tracked in `auth_sessions` table with client IP, user agent, and revocation flags.                                                                        |    **VERIFIED**     |
| **Authorization**       | Server-Side RBAC            | Strictly enforced via NestJS `JwtAuthGuard`, `RolesGuard`, and `PermissionsGuard` across all controllers. Four roles supported: `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`.     |    **VERIFIED**     |
| **Authorization**       | Data Access Scoping         | Managers restricted to organizational hierarchy; employees restricted to own profiles, leaves, attendance, and documents.                                                 |    **VERIFIED**     |
| **Financial Privacy**   | Payroll Authorization       | Payroll management restricted to `PAYROLL_MANAGE` permission. Locked runs remain immutable.                                                                               |    **VERIFIED**     |
| **Financial Privacy**   | Payslip Ownership           | `GET /payroll/payslips/:id/pdf` validates caller ownership before rendering in-memory PDF buffer. Non-admin IDOR attempts return `403 Forbidden`.                         |    **VERIFIED**     |
| **Financial Privacy**   | Anti-Caching Headers        | Financial and API routes attach `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`.                                                     |    **VERIFIED**     |
| **File Vault Security** | Path Traversal Protection   | `DocumentsService` normalizes canonical paths via `path.resolve` and verifies no escape from storage root.                                                                |    **VERIFIED**     |
| **File Vault Security** | Magic-Byte Inspection       | In-memory verification of PDF, PNG, JPEG, WebP, DOCX signatures. Executables (`MZ`, `ELF`) and scripts (`<script>`, `<svg>`) strictly rejected.                           |    **VERIFIED**     |
| **File Vault Security** | POSIX Disk Permissions      | Uploaded `.bin` files written with atomic mode `0o600`; storage directories created with `0o700`.                                                                         |    **VERIFIED**     |
| **Network Security**    | TLS 1.2 / 1.3 Termination   | Nginx hardened with Mozilla Intermediate cipher suites; TLS 1.0, 1.1, and SSLv3 disabled.                                                                                 |    **VERIFIED**     |
| **Network Security**    | Security Headers            | `HSTS` (63072000s), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.                                       |    **VERIFIED**     |
| **Network Security**    | Zero Database Exposure      | PostgreSQL service does not bind host ports in production Compose. Accessible solely via isolated internal bridge network (`backend_net`).                                |    **VERIFIED**     |
| **Network Security**    | CORS Domain Whitelist       | Origin whitelist strictly validated against configured corporate FQDN (`CORS_ORIGIN`). Wildcard `*` disallowed.                                                           |    **VERIFIED**     |
| **Input Validation**    | Global Validation Pipe      | `ValidationPipe` with `whitelist: true`, `transform: true` sanitizes inputs and blocks unexpected payload properties.                                                     |    **VERIFIED**     |
| **Rate Limiting**       | Brute-Force Throttling      | `ThrottlerModule` configured globally at 120 requests/minute per IP. Sensitive auth routes apply specialized limits.                                                      |    **VERIFIED**     |
| **Auditability**        | Enterprise Audit Trail      | Immutable audit logging in `AuditService` capturing user ID, IP address, user agent, action type, and before/after metadata.                                              |    **VERIFIED**     |
| **Error Handling**      | Information Leakage Defense | `AllExceptionsFilter` suppresses internal database error traces and stack dumps from production API responses.                                                            |    **VERIFIED**     |
| **Production Posture**  | Debug Tool Disabling        | Swagger UI mounted only when `ENABLE_SWAGGER=true` (strictly disabled in production by default).                                                                          |    **VERIFIED**     |
| **Process Isolation**   | Non-Root Execution          | Docker containers enforce unprivileged user `USER node` (UID/GID 1000). Root access disallowed.                                                                           |    **VERIFIED**     |

---

## 3. Residual Risks & Operational Hardening Checklist

Prior to physical go-live in the data center, the Infrastructure Security Lead must confirm:

- [ ] **Corporate TLS Key Management:** Private keys for `hrms.internal.corp` are stored securely with permissions `chmod 600`.
- [ ] **Database Account Hardening:** The runtime database user `hrms_app_user` is provisioned without `SUPERUSER` privileges.
- [ ] **Secret Entropy Verification:** Production secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`) meet high-entropy standards (≥ 256 bits).
- [ ] **Firewall Verification:** Verification that port 5432 (PostgreSQL) is unreachable from user subnets and HPC compute nodes.
- [ ] **Disk Encryption:** Host volumes for PostgreSQL data (`/var/lib/postgresql/data`) and document vault (`/var/hrms/storage/documents`) reside on encrypted storage arrays (LUKS / SED NVMe).
