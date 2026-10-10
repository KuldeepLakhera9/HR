# Phase 5 API Specification: Official Visits & Work From Home

## Global Conventions

- **Base URL**: `/api/v1`
- **Authentication**: Bearer JWT in `Authorization: Bearer <token>` or HTTP-only cookie.
- **Content-Type**: `application/json`
- **Error Format**:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "code": "ERROR_CODE",
    "message": "Human readable explanation",
    "timestamp": "2026-10-10T04:10:14.547Z",
    "path": "/api/v1/visits"
  }
  ```

---

## 1. Official Visits API (`/api/v1/visits`)

### 1.1 Create Official Visit

- **Method / Route**: `POST /api/v1/visits`
- **Permissions**: `VISIT_CREATE`
- **Request Body**:
  ```json
  {
    "title": "Acme Corp Architecture Review",
    "purpose": "Finalize Q4 enterprise migration architecture on-site",
    "startDate": "2026-10-15T00:00:00.000Z",
    "endDate": "2026-10-16T00:00:00.000Z",
    "expectedDurationDays": 2.0,
    "destinations": [
      {
        "destinationName": "Acme Tech HQ",
        "address": "123 Business Bay, Indiranagar",
        "city": "Bangalore",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "radiusMeters": 250,
        "isGeofenceRequired": true
      }
    ]
  }
  ```
- **Response**: `201 Created` with newly created `OfficialVisit` object.
- **Errors**: `400 Validation Error`, `409 REQUEST_OVERLAP_CONFLICT`.

---

### 1.2 List My Visits

- **Method / Route**: `GET /api/v1/visits/my`
- **Permissions**: `VISIT_VIEW`
- **Query Params**: `page` (default 1), `limit` (default 10), `status` (optional enum).
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "b84f0cb8-03bc-4f79-b74a-afd3c04191f7",
        "title": "Acme Corp Architecture Review",
        "status": "APPROVED",
        "startDate": "2026-10-15T00:00:00.000Z",
        "endDate": "2026-10-16T00:00:00.000Z",
        "destinations": [...]
      }
    ],
    "meta": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
  }
  ```

---

### 1.3 Get Visit Details

- **Method / Route**: `GET /api/v1/visits/:id`
- **Permissions**: `VISIT_VIEW`
- **Scope**: Submitting employee, hierarchical manager (`isSubordinateOf`), or HR/Admin.
- **Response**: `200 OK` with full destinations, approvals, and employee details.
- **Errors**: `403 FORBIDDEN_OUTSIDE_SCOPE`, `404 VISIT_NOT_FOUND`.

---

### 1.4 Update Visit (Material Reapproval)

- **Method / Route**: `PATCH /api/v1/visits/:id`
- **Permissions**: `VISIT_CREATE`
- **Behavior**: Updating `startDate`, `endDate`, or `destinations` on an `APPROVED` visit automatically transitions status to `SUBMITTED`, sets `reapprovalTriggered: true`, and logs an audit record.
- **Response**: `200 OK` with `{ visit: {...}, reapprovalTriggered: true }`.

---

### 1.5 Cancel Visit

- **Method / Route**: `POST /api/v1/visits/:id/cancel`
- **Permissions**: `VISIT_CREATE`
- **Request Body**: `{ "cancellationReason": "Client meeting rescheduled to next quarter" }`
- **Rules**: If start date is on or prior to current date, returns `403 VISIT_ALREADY_COMMENCED`.
- **Response**: `200 OK` with updated status `CANCELLED`.

---

### 1.6 Pending Manager Review Queue

- **Method / Route**: `GET /api/v1/visits/manager/pending`
- **Permissions**: `VISIT_APPROVE` (Manager, HR, Admin)
- **Scope**: Scoped recursively to reporting subordinates.
- **Response**: `200 OK` with pending list.

---

### 1.7 Decide Visit Request (Maker-Checker)

- **Method / Route**: `POST /api/v1/visits/:id/decide`
- **Permissions**: `VISIT_APPROVE`
- **Request Body**:
  ```json
  {
    "decision": "APPROVED", // or "REJECTED"
    "comments": "Approved. Please adhere to client site health and safety protocols."
  }
  ```
- **Rules**: Approver cannot be the applicant (`403 SELF_APPROVAL_DISALLOWED`). Concurrency conflict returns `409 Conflict`.
- **Response**: `200 OK` with updated status `APPROVED` or `REJECTED`.

---

### 1.8 HR Operations Field Monitor

- **Method / Route**: `GET /api/v1/visits/operations/overview`
- **Permissions**: `VISIT_VIEW` (HR, Admin)
- **Response**: `200 OK` with organization-wide active, upcoming, completed counts and employee lists.

---

### 1.9 Location Verification Audit

- **Method / Route**: `GET /api/v1/visits/:id/verifications`
- **Permissions**: `VISIT_VIEW`
- **Privacy Enforcement**: For standard employees and managers, `latitude` and `longitude` are redacted (`undefined`), displaying only distance and inside/outside boolean. For HR/Admin, raw decimal coordinates are returned.
- **Response**: `200 OK` with verification events array.

---

## 2. Work From Home API (`/api/v1/wfh`)

### 2.1 Submit WFH Request

- **Method / Route**: `POST /api/v1/wfh`
- **Permissions**: `WFH_CREATE`
- **Request Body**:
  ```json
  {
    "startDate": "2026-10-18T00:00:00.000Z",
    "endDate": "2026-10-18T00:00:00.000Z",
    "durationType": "FULL_DAY", // "FULL_DAY" | "FIRST_HALF" | "SECOND_HALF" | "CUSTOM_RANGE"
    "reason": "Home broadband installation and maintenance"
  }
  ```
- **Response**: `201 Created` with `WfhRequest` record in `SUBMITTED` status.
- **Errors**: `400 Bad Request`, `409 REQUEST_OVERLAP_CONFLICT`.

---

### 2.2 List My WFH Requests

- **Method / Route**: `GET /api/v1/wfh/my`
- **Permissions**: `WFH_VIEW`
- **Response**: `200 OK` with paginated requests.

---

### 2.3 Cancel WFH Request

- **Method / Route**: `POST /api/v1/wfh/:id/cancel`
- **Permissions**: `WFH_CREATE`
- **Request Body**: `{ "cancellationReason": "Broadband technician finished early" }`
- **Response**: `200 OK` with status `CANCELLED`.

---

### 2.4 Manager Pending WFH Queue

- **Method / Route**: `GET /api/v1/wfh/manager/pending`
- **Permissions**: `WFH_APPROVE` (Manager, HR, Admin)
- **Response**: `200 OK` with pending subordinate requests.

---

### 2.5 Decide WFH Request

- **Method / Route**: `POST /api/v1/wfh/:id/decide`
- **Permissions**: `WFH_APPROVE`
- **Request Body**:
  ```json
  {
    "decision": "APPROVED",
    "comments": "Approved. Please remain reachable via Slack during shift hours."
  }
  ```
- **Rules**: Anti-self-approval enforced (`403 SELF_APPROVAL_DISALLOWED`).

---

### 2.6 HR Operations Remote Monitor

- **Method / Route**: `GET /api/v1/wfh/operations/overview`
- **Permissions**: `WFH_VIEW` (HR, Admin)
- **Response**: `200 OK` with organization-wide remote work counts and date breakdown.

---

## 3. Unified Attendance Check-In Extensions (`/api/v1/attendance`)

### 3.1 Multi-Mode Check-In

- **Method / Route**: `POST /api/v1/attendance/check-in`
- **Permissions**: `ATTENDANCE_PUNCH`
- **Headers**: `Idempotency-Key: <UUID>` (or in body `idempotencyKey`)
- **Request Body**:
  ```json
  {
    "attendanceMode": "OFFICIAL_VISIT", // "OFFICE" | "OFFICIAL_VISIT" | "WFH"
    "officialVisitId": "b84f0cb8-03bc-4f79-b74a-afd3c04191f7",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracyMeters": 25,
    "deviceInfo": "Chrome 128 / macOS"
  }
  ```
- **Validation Rules**:
  - `OFFICE`: Must be inside active `OfficeLocation` perimeter.
  - `OFFICIAL_VISIT`: Requires approved visit. Must be inside destination geofence if required.
  - `WFH`: Requires approved WFH request. If `SECOND_HALF`, rejects check-ins prior to shift midpoint (`400 WFH_HALF_DAY_MISMATCH`). Zero coordinates stored.
- **Response**: `201 Created` with active `AttendanceSession` record.

---

### 3.2 Attendance Reports by Mode

- **Method / Route**: `GET /api/v1/attendance/reports/daily?date=YYYY-MM-DD`
- **Method / Route**: `GET /api/v1/attendance/reports/monthly?month=M&year=YYYY`
- **Response**: `200 OK` includes `byMode` distribution:
  ```json
  {
    "summary": {
      "totalRecords": 45,
      "byMode": {
        "office": 35,
        "officialVisit": 4,
        "workFromHome": 6,
        "total": 45
      }
    }
  }
  ```
