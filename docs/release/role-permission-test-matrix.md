# PeopleOS HRMS — Role & Permission Verification Test Matrix

**Document ID:** `REL-RBAC-002`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center  
**Classification:** Confidential — Security Validation Matrix

---

## 1. Executive Summary

PeopleOS HRMS enforces multi-layered server-side authorization through NestJS Guards (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`) and database-level ownership scopes. This document presents the exhaustive testing of all 4 supported roles (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`) across sensitive business endpoints.

All permission checks are enforced strictly on the backend API. Frontend route hiding is treated purely as UI ergonomics and is **never** relied upon as a security boundary.

---

## 2. Master Role Permission Matrix

| Functional Capability                 | Target API Route / Feature             |   ADMIN   |       HR       |     MANAGER     |     EMPLOYEE     | Actual Test Outcome |
| :------------------------------------ | :------------------------------------- | :-------: | :------------: | :-------------: | :--------------: | :-----------------: |
| **System Settings & Configuration**   | `GET /settings`, `PATCH /settings`     | **ALLOW** | **DENY (403)** | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Audit Log Explorer**                | `GET /audit`                           | **ALLOW** | **DENY (403)** | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Role & Permission Management**      | `GET /roles`, `PUT /roles/:id`         | **ALLOW** | **DENY (403)** | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Organization Structure Admin**      | `POST /organization/branches`          | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Employee Directory Access**         | `GET /employees`                       | **ALLOW** |   **ALLOW**    | Team Scope Only | Own Record Only  | **VERIFIED (Pass)** |
| **Create New Employee**               | `POST /employees`                      | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Update Employee Profile**           | `PATCH /employees/:id`                 | **ALLOW** |   **ALLOW**    | **DENY (403)**  | Permitted Fields | **VERIFIED (Pass)** |
| **Attendance Check-In**               | `POST /attendance/check-in`            | **ALLOW** |   **ALLOW**    |    **ALLOW**    |    **ALLOW**     | **VERIFIED (Pass)** |
| **Attendance Exception Queue**        | `GET /attendance/exceptions`           | **ALLOW** |   **ALLOW**    | Team Scope Only |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Apply for Leave / WFH / Visit**     | `POST /leave/apply`, `POST /wfh`       | **ALLOW** |   **ALLOW**    |    **ALLOW**    |    **ALLOW**     | **VERIFIED (Pass)** |
| **Approve Leave / WFH / Visit**       | `PATCH /leave/:id/decide`              | **ALLOW** |   **ALLOW**    | Direct Reports  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Approve Another Manager's Report**  | `PATCH /leave/:id/decide` (Cross-team) | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Salary Components & Structures**    | `GET /payroll/structures`              | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Calculate Payroll Run**             | `POST /payroll/runs/:id/calculate`     | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Lock & Finalize Payroll Run**       | `POST /payroll/runs/:id/lock`          | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **View Global Payslip List**          | `GET /payroll/payslips`                | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **View Personal Payslips (ESS)**      | `GET /payroll/payslips/my-payslips`    | **ALLOW** |   **ALLOW**    |    **ALLOW**    |   Own Payslips   | **VERIFIED (Pass)** |
| **Download Other Employee's Payslip** | `GET /payroll/payslips/:id/pdf` (IDOR) | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **Upload Employee Document**          | `POST /documents/upload`               | **ALLOW** |   **ALLOW**    |   Own / Team    |   Own Document   | **VERIFIED (Pass)** |
| **Download Other Employee's File**    | `GET /documents/:id/download` (IDOR)   | **ALLOW** |   **ALLOW**    | **DENY (403)**  |  **DENY (403)**  | **VERIFIED (Pass)** |
| **MIS Workforce Reports & Export**    | `GET /reports/workforce`, `/export`    | **ALLOW** |   **ALLOW**    |  Team Summary   |  **DENY (403)**  | **VERIFIED (Pass)** |

---

## 3. Negative Security & Boundary Testing Scenarios

| Test Case ID    | Test Scenario Description              | Injected Payload / Request                                             |   Expected Response   |    Actual Response    | Security Assessment |
| :-------------- | :------------------------------------- | :--------------------------------------------------------------------- | :-------------------: | :-------------------: | :-----------------: |
| **SEC-RBAC-01** | Unauthenticated Request                | Request `/api/v1/employees` with no `Authorization` header.            | HTTP 401 Unauthorized | HTTP 401 Unauthorized |     **PASSED**      |
| **SEC-RBAC-02** | Expired JWT Access Token               | Request with token having `exp` in the past.                           | HTTP 401 Unauthorized | HTTP 401 Unauthorized |     **PASSED**      |
| **SEC-RBAC-03** | Tampered JWT Signature                 | Valid payload with altered HMAC signature.                             | HTTP 401 Unauthorized | HTTP 401 Unauthorized |     **PASSED**      |
| **SEC-RBAC-04** | Employee Attempting Payroll Run Access | `GET /api/v1/payroll/runs` authenticated as EMPLOYEE.                  |  HTTP 403 Forbidden   |  HTTP 403 Forbidden   |     **PASSED**      |
| **SEC-RBAC-05** | IDOR Payslip Download Attack           | EMPLOYEE requesting `GET /api/v1/payroll/payslips/<peer_id>/pdf`.      |  HTTP 403 Forbidden   |  HTTP 403 Forbidden   |     **PASSED**      |
| **SEC-RBAC-06** | IDOR Document Download Attack          | EMPLOYEE requesting `GET /api/v1/documents/<peer_doc_id>/download`.    |  HTTP 403 Forbidden   |  HTTP 403 Forbidden   |     **PASSED**      |
| **SEC-RBAC-07** | Cross-Tenant Organization Isolation    | User from Organization A attempting access to Organization B resource. |    HTTP 403 / 404     |    HTTP 403 / 404     |     **PASSED**      |
| **SEC-RBAC-08** | Manager Approving Non-Report Leave     | MANAGER deciding leave application of another department's employee.   |  HTTP 403 Forbidden   |  HTTP 403 Forbidden   |     **PASSED**      |
| **SEC-RBAC-09** | Locked Payroll Run Modification        | Attempting to calculate or delete a run in `LOCKED` status.            | HTTP 400 Bad Request  | HTTP 400 Bad Request  |     **PASSED**      |
| **SEC-RBAC-10** | Path Traversal on File Storage         | Injected filename `../../../../etc/passwd`.                            |    HTTP 403 / 400     |  HTTP 403 Forbidden   |     **PASSED**      |

---

## 4. Key Security Findings & Observations

1. **In-Memory Streaming Zero Exposure:** Payslip PDFs are generated strictly in-memory by `PayslipPdfService` and streamed to the client. No unencrypted files are ever written to the public web server or temporary disk folders.
2. **Strict Identity Linkage:** When an employee queries `/payroll/payslips/my-payslips`, the API resolves `req.user.id` to the associated `employee.id` from the database. Client query parameter overrides (e.g. `?employeeId=...`) are completely ignored.
3. **Audit Trail Immutability:** Any administrative action (e.g. `PAYROLL_RUN_LOCKED`, `EMPLOYEE_CREATED`, `ROLE_UPDATED`) automatically writes an immutable log record via `AuditService`. Audit records cannot be updated or deleted via API endpoints.
