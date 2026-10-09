# Phase 4 — Attendance Engine, Shift Policies & Operations

## Overview

Phase 4 delivers an enterprise-grade, deterministic attendance system built for self-hosted data-center deployments. It provides GPS-verified office check-in, shift windows, grace period tracking, automatic break deduction, overnight shift resolution, manager team scoping, HR operations dashboards, exception reconciliation, and tamper-resistant audit logs.

This module guarantees strict multi-tenant isolation, immutable event logging, zero fabricated timestamps, and end-to-end integration across Web, API, and PostgreSQL.

---

## 1. Architectural Highlights

### A. Two-Tier Data Model: Immutable Events & Atomic Sessions

1. **AttendanceEvent (Immutable Append-Only Log)**:
   - Captures every punch action (`CHECK_IN`, `CHECK_OUT`, `BREAK_START`, `BREAK_END`).
   - Stores authoritative UTC timestamps, client device metadata, user agent, IP address, and high-precision GPS coordinates (`latitude`, `longitude`, `accuracyMeters`).
   - Preserves tamper-resistant geofence verification verdicts (`isInsideGeofence`, `distanceMeters`, `officeLocationId`).
   - Events are strictly append-only; updates and deletions are blocked by schema and service constraints.
2. **AttendanceSession (Stateful Continuous Work Interval)**:
   - Tracks a bounded continuous working block (`OPEN` → `ON_BREAK` → `COMPLETED` or `AUTO_CLOSED`).
   - Accumulates gross work minutes, total break duration, and net working minutes.
   - Tied atomically to the normalized working day.

### B. Pure Deterministic Calculation Engine

- Calculation logic is decoupled into pure, testable mathematical functions in [`daily-attendance-calculator.util.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/utils/daily-attendance-calculator.util.ts) and [`policy-evaluator.util.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/utils/policy-evaluator.util.ts).
- Eliminates clock skew and database state side effects. Given the exact same shift spec, policy rules, and punch event series, calculation output is 100% deterministic and reproducible across timezones and Daylight Saving Time (DST) shifts.

### C. Cutoff Hour Strategy & Overnight Shift Resolution

- **Working Day Start Hour Cutoff (Default 05:00 AM)**:
  - Punches between 00:00 and 04:59:59 AM map to the preceding working day.
  - Punches after 05:00:00 AM map to the current calendar date.
- **Overnight Shifts (Crossing Midnight)**:
  - Night shifts (e.g., 22:00 PM to 06:00 AM) are evaluated deterministically.
  - Arrival grace periods and morning departures are mapped relative to the shift window start date.

### D. Strict "No-Hallucination" Missing Checkout Policy

- Traditional HRMS solutions fabricate check-out times when an employee forgets to punch out, causing compliance risks.
- PeopleOS HRMS enforces a strict no-hallucination rule:
  - Unclosed sessions past the daily cutoff are transitioned to `AUTO_CLOSED`.
  - The day is marked `INCOMPLETE` with `grossMinutes: 0` and `netWorkMinutes: 0`.
  - A `MISSING_CHECKOUT` anomaly is recorded in the `AttendanceException` queue.
  - Time is only credited when regularized via a formal, manager-approved `AttendanceCorrectionRequest`.

### E. Multi-Layer Geofencing & Location Minimization

- Evaluates GPS coordinates using the Haversine great-circle formula against active `OfficeLocation` records.
- Stale GPS reading protection: timestamps older than 5 minutes are rejected (`GPS_TIMESTAMP_STALE`).
- Imprecise GPS protection: readings with accuracy radius > 150 meters are rejected (`GPS_ACCURACY_POOR`).
- Out-of-radius punches are rejected when strict geofencing is enforced (`GEOFENCE_VIOLATION`).
- Minimization: coordinates are captured only at punch execution; background tracking is explicitly forbidden.

### F. Hierarchical Data Scoping & Role-Based Access Control

- **Employee**: Scoped strictly to their own attendance events, summaries, and correction requests.
- **Manager**: Scoped strictly to their recursive subordinate team tree (`hierarchy.service.ts`). Cannot view or approve peers, cross-department staff, or their own corrections (`SELF_APPROVAL_DISALLOWED`).
- **HR / Admin**: Organization-wide visibility, exception management, recalculation triggers, and policy administration.

---

## 2. Phase 4 Component Index

| Component                       | Layer            | Location                                                                                                                                                   | Key Function                                                                     |
| :------------------------------ | :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **AttendanceService**           | Backend Service  | [`attendance.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/attendance.service.ts)                                   | Core business logic for punches, breaks, recalculations, and corrections         |
| **AttendanceReportingService**  | Backend Service  | [`attendance-reporting.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/attendance-reporting.service.ts)               | Scoped daily & monthly MIS aggregate reports and pagination                      |
| **AttendancePoliciesService**   | Backend Service  | [`attendance-policies.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/attendance-policies.service.ts)                 | Organizational policy CRUD, shift assignments, and threshold settings            |
| **OfficeLocationsService**      | Backend Service  | [`office-locations.service.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/office-locations.service.ts)                       | Office geofence perimeter coordinates and radius management                      |
| **Calculation Engine**          | Backend Utils    | [`daily-attendance-calculator.util.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/utils/daily-attendance-calculator.util.ts) | Pure deterministic shift windows, work duration, and status resolution           |
| **Geofence Utility**            | Backend Utils    | [`geofence.util.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/attendance/utils/geofence.util.ts)                                       | Haversine distance, boundary verification, and accuracy validation               |
| **Attendance Portal**           | Frontend Page    | [`attendance/page.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/app/attendance/page.tsx)                                                      | Employee portal with live clock, punch controls, history, and tabs               |
| **HRAttendanceDashboard**       | Frontend Feature | [`HRAttendanceDashboard.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/features/attendance/components/HRAttendanceDashboard.tsx)               | Organizational attendance metrics, employee records, drawer, and recalculations  |
| **HRAttendanceExceptionsQueue** | Frontend Feature | [`HRAttendanceExceptionsQueue.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/features/attendance/components/HRAttendanceExceptionsQueue.tsx)   | Exception triage queue, filters, and resolution audit drawer                     |
| **ManagerTeamAttendance**       | Frontend Feature | [`ManagerTeamAttendance.tsx`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/web/src/features/attendance/components/ManagerTeamAttendance.tsx)               | Manager team view, direct/indirect subordinate records, and correction approvals |

---

## 3. Operational Checklist for Self-Hosted Deployments

1. **Docker Container Deployment**:
   - Ensure `hrms_api`, `hrms_web`, and `hrms_postgres` containers run on isolated bridge networks (`hrms_network`).
   - Reverse proxy (Nginx) terminates TLS and forwards headers (`X-Forwarded-For`, `X-Forwarded-Proto`).
2. **Database Migration Safety**:
   - Run `pnpm --filter @hrms/database run db:migrate` prior to rolling out new application code.
   - All migrations are non-destructive, additive, and backward-compatible with running instances.
3. **Health Check Probes**:
   - Liveness & Readiness probe: `GET /api/v1/health` verifies database connectivity and latency (< 10ms threshold).
4. **Backup & Recovery Verification**:
   - Scheduled daily `pg_dump` with point-in-time recovery (PITR) enabled via WAL archiving.
5. **Least-Privilege Database Role**:
   - Application connects using `hrms_user` granted DML privileges on `public` schema only; superuser access is disabled.
