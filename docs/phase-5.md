# Phase 5 — Official Visits & Work From Home (WFH) Architecture

## Overview

Phase 5 extends the self-hosted PeopleOS HRMS attendance platform with field duty and remote work capabilities:

1. **Official Visits / Outdoor Duty (OD)**: Visit proposals, multi-stop destination geofencing, manager approvals, commencement cancellation governance, material edit reapproval triggers, and location verification logs.
2. **Work From Home (WFH)**: Flexible remote work requests (`FULL_DAY`, `FIRST_HALF`, `SECOND_HALF`, `CUSTOM_RANGE`), shift midpoint boundary alignment, maker-checker authorization, and privacy-by-design remote check-ins.
3. **Unified Attendance Architecture**: Reuses existing Phase 4 `AttendanceSession`, `AttendanceEvent`, and `AttendanceDailySummary` pipelines without duplicating check-in engines or table schemas.
4. **Audit, Notifications & Scoped Reporting**: Redaction of raw GPS telemetry for general users, in-app event notifications with duplicate prevention, and mode-aware daily/monthly MIS summaries (`OFFICE`, `OFFICIAL_VISIT`, `WFH`).

---

## 1. Architectural Highlights

### A. Unified Multi-Mode Attendance Engine

Rather than introducing secondary punch tables or diverging business logic, Phase 5 integrates directly into the deterministic Phase 4 check-in engine:

- `POST /api/v1/attendance/check-in` accepts an `attendanceMode` enum (`OFFICE`, `OFFICIAL_VISIT`, `WFH`).
- For `OFFICE`: Validates proximity against configured `OfficeLocation` geofences.
- For `OFFICIAL_VISIT`: Requires an active, approved `OfficialVisit` covering the punch date. If `isGeofenceRequired` is true, validates GPS against the visit's destination coordinates using the Haversine formula; logs an audit entry in `visit_location_verifications`.
- For `WFH`: Requires an active, approved `WfhRequest` covering the punch date and validates shift half-day boundaries (`FIRST_HALF` vs `SECOND_HALF`).

### B. Dual State Machines & Material Change Governance

- **Official Visit State Machine**:
  `DRAFT` → `SUBMITTED` → `APPROVED` → `IN_PROGRESS` → `COMPLETED`.
  Terminals: `REJECTED`, `CANCELLED`, `EXPIRED`.
- **Material Edit Reapproval Trigger**: If an employee modifies critical parameters (dates or destinations) of an `APPROVED` visit, the status is automatically reverted to `SUBMITTED`, invalidating prior approval and forcing manager review before field check-in is permitted.
- **Commencement Cancellation Policy**: Employees can cancel prior to the scheduled start date. Once the start date arrives or attendance begins, employee self-cancellation is blocked with `403 VISIT_ALREADY_COMMENCED` and requires managerial or HR administrative action.

### C. Shift Boundary Alignment for Half-Day WFH

- `FIRST_HALF`: Remote work permitted from shift start until the shift midpoint. Employee is expected in the office for the second half.
- `SECOND_HALF`: Employee works in the office during morning hours and punches remotely from shift midpoint onwards.
- Morning punches attempted against a `SECOND_HALF` WFH approval are rejected with `400 WFH_HALF_DAY_MISMATCH`.

### D. Location Privacy & Minimization by Design

- **WFH Privacy**: For home punches, exact residential GPS coordinates are zeroed out (`latitude: 0, longitude: 0, accuracyMeters: null`). Only client IP address and device user-agent signatures are retained.
- **Visit Telemetry Access Control**: The `GET /api/v1/visits/:id/verifications` endpoint redacts raw `latitude` and `longitude` (`undefined`) for standard Employees and Managers, displaying only perimeter status and distance metrics. Full raw coordinates are restricted to authorized `HR` and `ADMIN` compliance auditors.
- **Audit Sanitization**: The global `AuditService` scrubs sensitive GPS coordinates, tokens, and passwords prior to persisting audit records in PostgreSQL.

### E. Idempotency & Concurrency Defenses

- Check-in calls utilize unique `idempotencyKey` values. Replayed requests return the existing session (`isIdempotentReplay: true`) without creating duplicate events.
- Concurrent decision attempts on the same visit or WFH request are bounded by transactional state checks, rejecting race conditions with `409 Conflict` or `400 REQUEST_ALREADY_DECIDED`.
- Overlapping requests for the same working dates are prevented via transactional conflict checks (`409 REQUEST_OVERLAP_CONFLICT`).

---

## 2. Component Index

| Component                      | Layer              | Location                                                                                                                                     | Key Function                                                          |
| :----------------------------- | :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **VisitsService**              | Backend Service    | [`visits.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/visits/visits.service.ts)                                 | Visit CRUD, destination geofencing, manager review, and verifications |
| **VisitsController**           | Backend Controller | [`visits.controller.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/visits/visits.controller.ts)                           | HTTP routing, RBAC guards, and parameter validation for visits        |
| **WfhService**                 | Backend Service    | [`wfh.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/wfh/wfh.service.ts)                                          | WFH request management, duration logic, half-day window checks        |
| **WfhController**              | Backend Controller | [`wfh.controller.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/wfh/wfh.controller.ts)                                    | HTTP routing and validation for remote work endpoints                 |
| **AttendanceService**          | Backend Service    | [`attendance.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/attendance.service.ts)                     | Unified multi-mode check-in engine and session orchestration          |
| **NotificationsService**       | Backend Service    | [`notifications.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/notifications/notifications.service.ts)            | In-app alerts with idempotency keys for duplicate prevention          |
| **AuditService**               | Backend Service    | [`audit.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/audit/audit.service.ts)                                    | Immutable audit trails with coordinate and credential sanitization    |
| **AttendanceReportingService** | Backend Service    | [`attendance-reporting.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/attendance-reporting.service.ts) | Scoped daily & monthly MIS aggregate reports by mode                  |
| **Visits Portal Page**         | Frontend Page      | [`visits/page.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/app/visits/page.tsx)                                                | Employee visit submission, manager review, and HR monitor tabs        |
| **WFH Portal Page**            | Frontend Page      | [`wfh/page.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/app/wfh/page.tsx)                                                      | Employee remote work requests, half-day selectors, manager queue      |

---

## 3. Operational Checklist for Self-Hosted Deployments

1. **Database Migration Verification**:
   - Schema updates are managed via Prisma:
     ```bash
     pnpm --filter @hrms/database exec prisma migrate status
     ```
   - 12 incremental migrations applied; zero schema drift detected.
2. **Container Build & Orchestration**:
   - Both `@hrms/api` and `@hrms/web` multi-stage Dockerfiles build cleanly in isolated Alpine images.
   - Compose configurations validate with `docker compose config`.
3. **Health Check Probes**:
   - `GET /api/v1/health` verifies API responsiveness and PostgreSQL query round-trip latency (< 10ms).
4. **Audit Logging & Telemetry Redaction**:
   - Verify PostgreSQL `audit_logs` and `visit_location_verifications` tables enforce coordinate sanitization for non-administrative roles.
5. **Rate Limiting & Protection**:
   - Throttler configured at 120 req/min per IP to prevent punch flooding and brute force attacks.
