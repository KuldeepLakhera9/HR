# PeopleOS HRMS — Security Operations & Incident Playbook

**Document ID:** `TECH-SEC-008`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center

---

## 1. Security Architecture Summary

- **Authentication:** `argon2` password hashing, short-lived JWT (15m), secure `httpOnly` refresh cookies.
- **RBAC:** Multi-level NestJS guards enforcing role and ownership scopes (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`).
- **Data Protection:** Financial streaming in-memory, POSIX `0600` document storage, zero public database ports.
- **Auditing:** Immutable audit logging on all privileged operations.

---

## 2. Incident Response Playbooks

### 2.1 Anomaly 1: Suspected Brute-Force Authentication Attempt

- **Detection:** Spike in consecutive 401 Unauthorized responses on `/api/v1/auth/login`.
- **Response:**
  1. The built-in rate limiter (`ThrottlerModule`) automatically throttles the source IP.
  2. Inspect audit records in `audit_logs` where `action = 'USER_LOGIN_FAILED'`.
  3. If targeted at a specific account, trigger an administrative password reset.

### 2.2 Anomaly 2: Unauthorized Data Access (BOLA / IDOR Attempt)

- **Detection:** Detection of 403 Forbidden responses on `/payroll/payslips/:id/pdf` or `/documents/:id/download`.
- **Response:**
  1. Inspect `audit_logs` for `action = 'UNAUTHORIZED_ACCESS_ATTEMPT'`.
  2. Revoke the offender's active sessions in `auth_sessions`.
  3. Initiate security incident review.

### 2.3 Anomaly 3: Secret Compromise

- **Response:**
  1. Generate new 256-bit secrets using `openssl rand -base64 32`.
  2. Update `/etc/hrms/.env.production`.
  3. Rolling restart API containers (`docker compose restart api`).
  4. All previous tokens become invalid; users must re-authenticate.
