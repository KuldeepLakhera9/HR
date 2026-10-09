# Phase 5: Location Evidence Retention and Access Controls Policy

## 1. Executive Summary & Privacy Principles

This document formalizes the retention lifecycle, data minimization principles, and role-based access controls (RBAC) governing location evidence collected across **Official Visits** and **Work From Home (WFH)** attendance modes in the Enterprise HRMS platform.

The system adheres to three non-negotiable privacy and compliance principles:

1. **Data Minimization**: Precise geographical coordinates (latitude and longitude) are captured exclusively at the moment of an attendance punch event or on-demand destination verification. Background tracking, geofence monitoring while off-duty, and continuous tracking are strictly prohibited and architecturally impossible.
2. **Zero Residential Location Capture**: Work From Home (WFH) punches execute under an absolute zero-coordinate policy (`0.0, 0.0` or `EXEMPT`). An employee's residential address, private network IP, or domestic GPS coordinates are never captured, logged, or processed.
3. **Audit Trail Sanitization**: All system audit logs enforce mandatory redaction of raw geographical coordinates, session tokens, and passwords through automated pattern-matching filters (`FORBIDDEN_KEY_PATTERNS`).

---

## 2. Role-Based Access Control (RBAC) Matrix

Access to location verification records and geographic metadata is strictly segmented by organizational role and reporting hierarchy:

| Actor / Role         | Verification Outcome (Pass/Fail)  |   Distance from Perimeter    |    Destination & Address    | Raw GPS Coordinates (`lat`, `lng`)  |          Map Pin Inspection          |
| :------------------- | :-------------------------------: | :--------------------------: | :-------------------------: | :---------------------------------: | :----------------------------------: |
| **Employee (Self)**  |            Full Access            |         Full Access          |         Full Access         |     View Own (at verification)      |            Self View Only            |
| **Direct Manager**   |            Full Access            |         Full Access          |         Full Access         | **MASKED / REDACTED** (`undefined`) | **REDACTED** (Perimeter status only) |
| **Department Head**  |       Full Access (Scoped)        |     Full Access (Scoped)     |    Full Access (Scoped)     | **MASKED / REDACTED** (`undefined`) |             **REDACTED**             |
| **HR Operations**    |      Full Access (Org-wide)       |    Full Access (Org-wide)    |   Full Access (Org-wide)    |  Full Access (Dispute Resolution)   |             Full Access              |
| **System Admin**     |      Full Access (Org-wide)       |    Full Access (Org-wide)    |   Full Access (Org-wide)    |   Full Access (Compliance Audit)    |             Full Access              |
| **System Audit Log** | Preserved (`VERIFIED`/`REJECTED`) | Preserved (`distanceMeters`) | Preserved (`destinationId`) |      **FORBIDDEN & REDACTED**       |                 N/A                  |

### 2.1 Backend Enforcement Details

1. **Visits API Redaction (`/api/v1/visits/:id`)**:
   In `VisitsService.getVisitById` and verification endpoints, non-HR and non-Admin callers receive an API response where raw coordinates are stripped at the serialization boundary:
   ```typescript
   latitude: isAdminOrHr ? verification.latitude : undefined,
   longitude: isAdminOrHr ? verification.longitude : undefined,
   ```
2. **Audit Service Coordinate Redaction (`AuditService`)**:
   Metadata passed to `auditService.log()` is automatically scrubbed against `FORBIDDEN_KEY_PATTERNS`:
   ```typescript
   private static readonly FORBIDDEN_KEY_PATTERNS = [
     /password/i,
     /token/i,
     /secret/i,
     /latitude/i,
     /longitude/i,
     /exactCoords/i,
     /rawCoordinates/i,
   ];
   ```
   Any metadata payload inadvertently containing coordinate keys has those values replaced with `[REDACTED]`.

---

## 3. Data Retention Lifecycle & Purge Policy

Location evidence is classified into operational verification records and statutory attendance summaries. Each classification is governed by distinct retention policies:

```mermaid
graph TD
    A[Punch / Location Verification] --> B[VisitLocationVerification Table]
    A --> C[AttendanceDailySummary Table]

    B -->|Days 0 - 90| D[Active Operational Window: Full Evidence Retained]
    B -->|Day 90+| E[Automated Coordinate Scrubbing: lat/lng set to NULL]
    B -->|Year 1+| F[Archival & Soft Delete of Verification Metadata]

    C -->|Years 0 - 7| G[Statutory Payroll Archive: Mode Flag Retained (Zero GPS)]
```

### 3.1 Operational Verification Evidence (`visit_location_verifications`)

- **Active Operational Window (0 – 90 Days)**:
  - Exact coordinates, accuracy radius, and server timestamp are retained for 90 days.
  - This window covers standard payroll reconciliation cycles, manager exception approvals, and immediate labor dispute windows.
- **Coordinate Scrubbing Milestone (90 Days)**:
  - After 90 days from the verification event, an automated maintenance worker executes an in-place coordinate purge:
    ```sql
    UPDATE "visit_location_verifications"
    SET "latitude" = NULL, "longitude" = NULL
    WHERE "createdAt" < NOW() - INTERVAL '90 days'
      AND ("latitude" IS NOT NULL OR "longitude" IS NOT NULL);
    ```
  - The derived metrics (`outcome`, `isVerified`, `distanceMeters`, `allowedRadiusMeters`, `accuracyMeters`) remain intact for reporting and analytics without retaining identifiable geospatial coordinates.
- **Archival Window (1 Year)**:
  - Operational verification rows older than 365 days are archived to encrypted cold storage and removed from the active OLTP database.

### 3.2 Statutory Daily & Monthly Summaries (`attendance_daily_summaries`)

- Retained for **7 years** in accordance with national labor standards and statutory tax/payroll audit requirements.
- Contains only high-level mode classifications (`primaryAttendanceMode`: `'OFFICE' | 'OFFICIAL_VISIT' | 'WFH'`), associated request foreign keys (`officialVisitId`, `wfhRequestId`), work minutes, break durations, and exception statuses.
- Zero geographical coordinates exist within summary models.

---

## 4. Security & Anti-Spoofing Mitigations

To protect both enterprise integrity and employee data against tampering or injection attacks:

1. **Client Freshness & Anti-Replay**:
   - Location verification and punch submissions require a client timestamp.
   - The server validates clock skew: $|T_{\text{server}} - T_{\text{client}}| \le 300\text{ seconds}$. Requests with stale timestamps are rejected with `STALE_LOCATION`.
2. **Idempotency Keys**:
   - Check-in, check-out, and verification requests require UUIDv4 `idempotencyKey` values. Replayed payloads return the existing verification result without re-evaluating or writing redundant logs.
3. **Accuracy Verification**:
   - GPS readings reporting an accuracy radius worse than the policy threshold (e.g., accuracy $> 200\text{m}$) are categorized as `LOW_ACCURACY` and flagged as exceptions rather than granting automated pass status.
4. **Encryption in Transit and Rest**:
   - All network calls transporting geolocation telemetry require TLS 1.3.
   - Database volumes enforce AES-256 transparent data encryption (TDE) at rest.
