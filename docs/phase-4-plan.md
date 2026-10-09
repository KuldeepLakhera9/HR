# Phase 4 — Production-Grade Attendance Engine Implementation Plan

**System:** PeopleOS Self-Hosted Enterprise HRMS  
**Phase:** Phase 4 — Attendance Engine  
**Target Architecture:** Modular Monolith (NestJS + Next.js + PostgreSQL + Prisma + Docker)  
**Author:** Lead Enterprise Software Architect & Engineering Team

---

## 1. Executive Summary & Verification of Prior Phases

### 1.1 Foundation & Prior Phases Integrity

- **Phase 1 (Foundation & Design System)**: Monorepo managed with Turborepo and pnpm; PostgreSQL 16 containerized; shared design system tokens with warm ivory canvas (`#FAF8F5`), stone neutrals, and deep amber accents (`amber-800`); fully responsive `AppShell`.
- **Phase 2 (Authentication, Sessions & RBAC)**: Argon2id password hashing; dual-token session architecture; exactly four application roles (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`); permission guards (`RequirePermissions`) and asynchronous audit logging (`AuditService`).
- **Phase 3 (Organization & Employee Management)**: Hierarchical branches, departments, and designations; full employee lifecycle state machine; manager hierarchy with circular prevention; scoped data access; interactive org chart; bulk import and export with field-level masking and IDOR protection.

### 1.2 Phase 4 Objective

To build a production-grade, self-hosted attendance engine featuring:

1. **Configurable Office Geofencing**: Server-side mathematical validation using the Haversine formula against active branch coordinates and radial tolerances, conservative GPS accuracy evaluation, and privacy-preserving point-in-time checks (no third-party map APIs or continuous tracking).
2. **Authoritative Event-Driven Punch Engine**: Pure server-side UTC timestamps, anti-spoofing, idempotency keys, ACID concurrency control preventing double punch and overlapping sessions, and multiple legitimate sessions per day with break support.
3. **Shift & Policy Engine**: Flexible working schedules (supporting regular, afternoon, and overnight shifts), configurable grace periods, half-day/full-day thresholds, break durations, and historical policy versioning.
4. **Separation of Raw Events & Daily Summaries**: Immutable audit event logs (`AttendanceEvent`) separate from recalculated daily performance summaries (`AttendanceDailySummary`).
5. **Attendance Correction & Approval Workflow**: Employee-initiated correction requests, conflict prevention, mandatory review notes, prevention of self-approval, and non-destructive summary adjustments without raw event mutation.
6. **Scoped Access & Role Boundaries**: Strict organizational multi-tenancy, reporting hierarchy restriction for managers, and self-only boundaries for standard employees.
7. **Mobile-First & Data-Rich Interfaces**: Accessible, one-tap mobile punch interface for employees alongside filterable, real-time attendance rosters for HR and managers.

---

## 2. Database Architecture & Schema Plan

### 2.1 Relationship Overview

```
Organization
├── Branch (Physical office with geofence coordinates: lat, lng, radius, timezone)
├── AttendancePolicy (Configurable organization/branch work rules, grace periods, thresholds)
├── Shift (Defined working hours, e.g., General, Morning, Night/Overnight)
└── ShiftAssignment (Maps employee to shift with effective date range)

Employee
├── AttendanceSession (One per check-in to check-out work block; multiple allowed per day)
├── AttendanceEvent (Immutable raw event: PUNCH_IN, PUNCH_OUT, BREAK_START, BREAK_END)
├── AttendanceDailySummary (Aggregated daily metric: status, totalWorkMinutes, lateMinutes)
├── AttendanceCorrectionRequest (Correction submission with reason)
│   └── AttendanceCorrectionDecision (Review metadata, reviewer, old/new diff)
└── AttendanceException (Irregularity flags: OUTSIDE_GEOFENCE, MISSING_CHECKOUT, LOW_ACCURACY)
```

### 2.2 Proposed Normalized Models for `schema.prisma`

#### 1. Enums

```prisma
enum AttendanceMode {
  OFFICE
  OFFICIAL_VISIT  // Reserved for future approved OD
  WFH             // Reserved for future approved remote work
}

enum AttendanceEventType {
  CHECK_IN
  CHECK_OUT
  BREAK_START
  BREAK_END
}

enum GeofenceVerificationStatus {
  VERIFIED
  OUTSIDE_GEOFENCE
  LOW_ACCURACY
  EXEMPT
  FAILED
}

enum AttendanceDayStatus {
  PRESENT
  HALF_DAY
  LATE
  ABSENT
  ON_LEAVE
  HOLIDAY
  WEEKEND_OFF
  PENDING
}

enum CorrectionStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

enum AttendanceExceptionType {
  OUTSIDE_GEOFENCE
  LOW_GPS_ACCURACY
  MISSING_CHECKOUT
  OVERLAPPING_SESSION
  SUSPICIOUS_TIMING
  POLICY_VIOLATION
}
```

#### 2. Models Specification

- **`AttendancePolicy`**:
  - `id`, `organizationId`, `branchId` (optional override), `name`, `code`, `isDefault` (Boolean).
  - `standardWorkMinutes` (default 480 = 8h), `halfDayThresholdMinutes` (default 240 = 4h), `fullDayThresholdMinutes` (default 420 = 7h).
  - `gracePeriodMinutes` (default 15), `maxCheckInDelayMinutes` (default 120).
  - `maxDailyBreakMinutes` (default 60), `maxSingleBreakMinutes` (default 45).
  - `allowMultipleSessionsPerDay` (Boolean, default true).
  - `overnightShiftAllowed` (Boolean, default false).
  - `geofenceEnforcement` (Boolean, default true), `maxGpsAccuracyMeters` (Int, default 100).
  - `workingDayStartHour` (Int, default 5, boundary for overnight shifts: 05:00 AM).
  - `version` (Int, default 1), `effectiveFrom` (DateTime), `effectiveTo` (DateTime?).
  - Indexes: `[organizationId]`, `[branchId]`, `[effectiveFrom]`.

- **`Shift`**:
  - `id`, `organizationId`, `name`, `code`, `startTime` (String "09:00"), `endTime` (String "18:00").
  - `isOvernight` (Boolean, default false).
  - `workDays` (Int[] default [1,2,3,4,5] = Mon-Fri).
  - `breakDurationMinutes` (Int, default 60).
  - `isActive` (Boolean, default true), timestamps.
  - Unique: `[organizationId, code]`.

- **`ShiftAssignment`**:
  - `id`, `organizationId`, `employeeId`, `shiftId`.
  - `effectiveFrom` (DateTime), `effectiveTo` (DateTime?).
  - `assignedById` (String?).
  - Indexes: `[organizationId]`, `[employeeId]`, `[shiftId]`.

- **`AttendanceSession`**:
  - `id`, `organizationId`, `employeeId`, `date` (DateTime, normalized to midnight in branch timezone).
  - `sessionNumber` (Int, default 1).
  - `checkInTime` (DateTime), `checkOutTime` (DateTime?).
  - `totalWorkMinutes` (Int, default 0), `totalBreakMinutes` (Int, default 0).
  - `status` (Enum: `OPEN`, `COMPLETED`, `AUTO_CLOSED`).
  - Unique: `[employeeId, date, sessionNumber]`.
  - Indexes: `[organizationId]`, `[employeeId, date]`, `[status]`.

- **`AttendanceEvent` (Immutable Audit Records)**:
  - `id`, `organizationId`, `employeeId`, `sessionId` (String?).
  - `eventType` (AttendanceEventType).
  - `eventTimestamp` (DateTime, authoritative UTC from server).
  - `attendanceMode` (AttendanceMode: OFFICE, etc.).
  - `latitude` (Float?), `longitude` (Float?), `accuracyMeters` (Float?).
  - `branchId` (String? target office).
  - `distanceFromOfficeMeters` (Float?).
  - `geofenceStatus` (GeofenceVerificationStatus).
  - `idempotencyKey` (String, unique to prevent replay).
  - `deviceInfo` (String? user agent snippet), `ipAddress` (String?).
  - `actorUserId` (String).
  - Indexes: `[organizationId]`, `[employeeId]`, `[eventTimestamp]`, `[idempotencyKey]`.

- **`AttendanceDailySummary`**:
  - `id`, `organizationId`, `employeeId`, `date` (DateTime, normalized working day).
  - `firstCheckIn` (DateTime?), `lastCheckOut` (DateTime?).
  - `totalWorkMinutes` (Int, default 0), `totalBreakMinutes` (Int, default 0).
  - `lateMinutes` (Int, default 0), `earlyExitMinutes` (Int, default 0), `overtimeMinutes` (Int, default 0).
  - `status` (AttendanceDayStatus).
  - `shiftId` (String?), `policyId` (String?).
  - `isCorrected` (Boolean, default false).
  - Unique: `[organizationId, employeeId, date]`.
  - Indexes: `[organizationId, date]`, `[employeeId, date]`, `[status]`.

- **`AttendanceCorrectionRequest`**:
  - `id`, `organizationId`, `employeeId`, `targetDate` (DateTime).
  - `requestedCheckIn` (DateTime?), `requestedCheckOut` (DateTime?).
  - `reason` (String), `status` (CorrectionStatus, default PENDING).
  - `submittedAt` (DateTime @default(now)).
  - `decisionId` (String? unique relation).
  - Indexes: `[organizationId]`, `[employeeId]`, `[status]`, `[targetDate]`.

- **`AttendanceCorrectionDecision`**:
  - `id`, `requestId` (unique), `reviewerId` (User).
  - `decision` (CorrectionStatus: APPROVED | REJECTED).
  - `originalWorkMinutes` (Int), `correctedWorkMinutes` (Int).
  - `reviewNotes` (String), `decidedAt` (DateTime @default(now)).
  - Indexes: `[reviewerId]`, `[decidedAt]`.

- **`AttendanceException`**:
  - `id`, `organizationId`, `employeeId`, `date` (DateTime).
  - `exceptionType` (AttendanceExceptionType).
  - `severity` (Enum: `LOW`, `MEDIUM`, `HIGH`).
  - `details` (Json), `resolved` (Boolean, default false).
  - Indexes: `[organizationId]`, `[employeeId]`, `[exceptionType]`, `[resolved]`.

---

## 3. Geofencing & Location Verification Engine

### 3.1 Mathematical Validation (Haversine Formula)

Implemented directly in TypeScript in `@hrms/api` (zero reliance on external Google Maps APIs):

$$\Delta\text{lat} = \text{lat}_2 - \text{lat}_1, \quad \Delta\text{lng} = \text{lng}_2 - \text{lng}_1$$
$$a = \sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1) \cdot \cos(\text{lat}_2) \cdot \sin^2\left(\frac{\Delta\text{lng}}{2}\right)$$
$$c = 2 \cdot \text{atan2}(\sqrt{a}, \sqrt{1-a}), \quad d = R \cdot c \quad (R = 6,371,000 \text{ m})$$

### 3.2 Conservative Geospatial Rules

1. **Office Assignment Verification**: Employee's assigned branch is looked up from their active `EmployeeEmployment` record.
2. **Geofence Boundary**: The branch's `geofenceLat`, `geofenceLng`, and `geofenceRadiusMeters` (default 100m) define the perimeter.
3. **Accuracy Tolerance**:
   - Browser GPS reported accuracy circle (`accuracyMeters`) must be $\le 100$ meters. If reported accuracy exceeds tolerance (e.g., $150$m), check-in is rejected or flagged as `LOW_ACCURACY`.
4. **Freshness & Anti-Spoofing**:
   - Skew between client geolocation timestamp and authoritative server clock must be within $\pm 60$ seconds.
   - Exact coordinates are collected only at punch events (no continuous background tracking).
   - Coordinates are never exposed in public or general report list endpoints (masked to protect employee privacy).

---

## 4. Authoritative Clock, Event Processing & Concurrency

### 4.1 Strict Server Timestamping

- Client clocks are never trusted for time of record. The database / API server UTC clock is authoritative.
- Client provides local offset purely for timezone presentation purposes.

### 4.2 Concurrency & Idempotency Safeguards

- **Idempotency Key**: Each check-in or check-out request sends a client-generated UUID `idempotencyKey`. The backend caches/records this in database to discard duplicate network retries.
- **Transactional State Transitions**: All punches run inside `prisma.$transaction`:
  - Check-In verifies there is no currently active `OPEN` session for the employee on the working day.
  - Check-Out verifies there is an active `OPEN` session and closes it.
  - Break-Start verifies employee is currently in an `OPEN` active session.
  - Break-End verifies an active break is ongoing.

---

## 5. Attendance Modes in Phase 4

| Mode                 | Behavior in Phase 4                                               | Verification                                                                                         |
| :------------------- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **`OFFICE`**         | **Fully active**. Default mode for all office and hybrid workers. | Requires server verification of GPS coordinates against assigned branch geofence.                    |
| **`OFFICIAL_VISIT`** | **Extensible reservation**. Future field duty module.             | Phase 4 restricts unapproved outside-office punches through this mode; requires prior authorization. |
| **`WFH`**            | **Extensible reservation**. Future remote work module.            | Phase 4 restricts unapproved remote punches; requires explicit policy allowance or prior approval.   |

---

## 6. Access Scoping Matrix

| Role           | Scope for View                                                | Permitted Mutations                                                                                                     |
| :------------- | :------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| **`ADMIN`**    | Organization-wide attendance, shifts, policies, and logs.     | Create/update policies, configure shifts, assign shifts, manage office locations, approve all corrections.              |
| **`HR`**       | Organization-wide employee attendance, summaries, exceptions. | View all attendance, approve/reject correction requests, trigger daily recalculations, export reports.                  |
| **`MANAGER`**  | Assigned reporting team hierarchy + self.                     | View team attendance roster, approve/reject correction requests for direct/indirect subordinates (cannot self-approve). |
| **`EMPLOYEE`** | Self attendance records only.                                 | Punch check-in/out, punch break start/end, submit correction requests for self.                                         |

---

## 7. API Architecture (`/api/v1/attendance`)

### 7.1 Employee Punch & Status Endpoints

- `GET /api/v1/attendance/status` — Get current user's today status (current session, open breaks, punch eligibility).
- `POST /api/v1/attendance/check-in` — Perform check-in (requires lat, lng, accuracy, mode, idempotencyKey).
- `POST /api/v1/attendance/check-out` — Perform check-out (requires lat, lng, accuracy, idempotencyKey).
- `POST /api/v1/attendance/break/start` — Start a break during an active session.
- `POST /api/v1/attendance/break/end` — End active break.
- `GET /api/v1/attendance/my-history` — Paginated history of current employee's daily summaries and sessions.

### 7.2 Management, Rosters & Summaries

- `GET /api/v1/attendance/daily-roster` — Scoped daily roster for Admin/HR (org-wide) and Manager (team).
- `GET /api/v1/attendance/summaries` — Monthly/range summary reports with filters (department, status, date).
- `GET /api/v1/attendance/sessions/:id` — Detailed session breakdown with raw events.

### 7.3 Shifts & Policy Administration

- `GET /api/v1/attendance/policies` — List organization attendance policies.
- `POST /api/v1/attendance/policies` — Create/update policy (`ADMIN` only).
- `GET /api/v1/attendance/shifts` — List shifts.
- `POST /api/v1/attendance/shifts` — Create shift (`ADMIN` only).
- `POST /api/v1/attendance/shifts/assign` — Assign shift to employee(s).

### 7.4 Correction Workflows

- `POST /api/v1/attendance/corrections` — Submit correction request (`EMPLOYEE`).
- `GET /api/v1/attendance/corrections` — List correction requests (scoped: HR gets all, Manager gets team, Employee gets self).
- `PATCH /api/v1/attendance/corrections/:id/decision` — Approve or reject correction request (`HR` or `MANAGER`, self-approval blocked).

---

## 8. Frontend UI/UX Architecture

1. **Employee Punch Terminal (`/attendance`)**:
   - Mobile-first layout with clean, authoritative status card.
   - Primary punch action button dynamically reflecting current state:
     - **Check In** (`bg-emerald-600`) when not checked in.
     - **Check Out** (`bg-rose-600`) when currently active.
     - **Start Break / End Break** (`bg-amber-600`).
   - Browser geolocation banner requesting permission with explicit status feedback (Accuracy, Distance to Branch, Verified Badge).
   - "Request Correction" modal accessible per past day.
2. **Team & Organization Roster (`/attendance/roster`)**:
   - Filterable data table by date, department, shift, and status chip (Present, Late, Absent, Half Day).
   - Real-time KPI summary header (Present Rate, On Time %, Late Count, Open Sessions).
3. **Approvals Queue (`/attendance/corrections`)**:
   - Before/after comparison diff cards showing requested vs recorded punch times and user explanation.
   - Approve / Reject buttons with required review notes.
4. **Shift & Policy Management (`/attendance/settings`)**:
   - Tabbed admin view to configure branch geofence radii, shifts, and policy thresholds.

---

## 9. Phase 4 Step-by-Step Implementation Roadmap

- **Step 1: Architecture Plan & Database Schema** (Current step)
  - Write `docs/phase-4-plan.md`.
  - Design and implement Prisma schema extensions for policies, shifts, sessions, events, summaries, and corrections.
  - Run Prisma migration safely.
- **Step 2: Geospatial Geofencing & Location Engine**
  - Implement Haversine calculation, accuracy tolerance validation, and branch coordinates matching in `@hrms/api`.
  - Unit tests for distance, boundary thresholds, and accuracy limits.
- **Step 3: Authoritative Clock & Punch Event Service**
  - Implement check-in, check-out, break-start, break-end with server UTC timestamps and transactional idempotency.
  - Unit and concurrency integration tests.
- **Step 4: Shift Management & Assignment Engine**
  - CRUD for shifts (standard, morning, overnight) and shift assignments.
- **Step 5: Daily Attendance Summary & Policy Evaluator**
  - Calculation engine: late arrival, early exit, half-day, full-day thresholds, overnight shift boundaries.
- **Step 6: Attendance Correction & Approval Workflow**
  - Correction request submission, manager/HR review, prevent self-approval, non-destructive summary recalculation.
- **Step 7: Scoped Attendance Controller & Security Hardening**
  - `/api/v1/attendance` endpoints with permission guards, role/team scoping, IDOR protection, and coordinate masking.
- **Step 8: Mobile-First Employee Punch UI**
  - Frontend check-in/out terminal, geolocation capture, live feedback states, and session timeline.
- **Step 9: Employee History & Correction UI**
  - Calendar/history view with correction request modal.
- **Step 10: HR & Manager Daily Roster & Monitoring UI**
  - Real-time roster, team filtering, status badges, and search.
- **Step 11: Correction Approval Workflow UI**
  - Review queue for managers and HR with diff visualization.
- **Step 12: Shift & Policy Configuration UI**
  - Admin settings interface for policies, shifts, and geofence parameters.
- **Step 13: Attendance Reporting & Export Engine**
  - Monthly attendance summaries, export to CSV and Excel, working-hour metrics.
- **Step 14: Comprehensive Automated Testing Suite**
  - Full backend unit, integration, and security tests (IDOR, concurrency, overnight shifts, timezones).
- **Step 15: Security Review & Boundary Hardening**
  - Verification of role bypass, manager hierarchy limits, anti-replay, and tenant isolation.
- **Step 16: UI/UX Polish & Accessibility Review**
  - Cohesion with Phase 1–3 design tokens, keyboard navigation, and mobile view testing.
- **Step 17: Production Build & Final Verification**
  - Prisma validation, migrations check, production build, and Phase 4 sign-off.
