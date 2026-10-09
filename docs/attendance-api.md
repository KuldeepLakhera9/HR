# Attendance API Reference

All attendance endpoints are prefixed with `/api/v1/attendance` and require an authenticated bearer JWT token.

---

## 1. Authentication & Common Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Standard Error Response Format

```json
{
  "success": false,
  "statusCode": 400,
  "code": "GEOFENCE_VIOLATION",
  "message": "Punch location is 850m away from office perimeter (allowed: 150m)",
  "error": "Bad Request",
  "timestamp": "2026-10-09T09:30:00.000Z"
}
```

---

## 2. Employee Punch Operations

### 2.1 Check-In

`POST /api/v1/attendance/check-in`

- **Permission**: `ATTENDANCE_MARK`
- **Request Body**:
  ```json
  {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracyMeters": 15,
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "attendanceMode": "OFFICE",
    "deviceInfo": "Chrome 124 / Windows 11",
    "officeLocationId": "fa4d3a6f-1f0a-4663-af0c-76ad22a77674"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Check-in recorded successfully",
    "data": {
      "session": {
        "id": "7139afc4-486d-4292-9ee2-ba4088aebdab",
        "employeeId": "1bc7ca5e-9f03-4ade-9478-9623190b840a",
        "date": "2026-10-09T00:00:00.000Z",
        "checkInTime": "2026-10-09T03:30:00.000Z",
        "status": "OPEN",
        "sessionNumber": 1
      },
      "event": {
        "id": "e44d3a6f-1f0a-4663-af0c-76ad22a77674",
        "eventType": "CHECK_IN",
        "isInsideGeofence": true,
        "distanceMeters": 12
      }
    }
  }
  ```

### 2.2 Check-Out

`POST /api/v1/attendance/check-out`

- **Permission**: `ATTENDANCE_MARK`
- **Request Body**:
  ```json
  {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracyMeters": 12,
    "idempotencyKey": "8c2deb4d-3b7d-4bad-9bdd-2b0d7b3dcb7e",
    "notes": "Completed scheduled shift"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Check-out recorded successfully",
    "data": {
      "session": {
        "id": "7139afc4-486d-4292-9ee2-ba4088aebdab",
        "checkOutTime": "2026-10-09T12:30:00.000Z",
        "totalWorkMinutes": 540,
        "totalBreakMinutes": 45,
        "status": "COMPLETED"
      },
      "dailySummary": {
        "status": "PRESENT",
        "netWorkMinutes": 495,
        "isOvertimeCandidate": true,
        "overtimeMinutes": 15
      }
    }
  }
  ```

### 2.3 Break Management

- `POST /api/v1/attendance/break/start`: Starts a break interval; session status transitions to `ON_BREAK`.
- `POST /api/v1/attendance/break/end`: Ends a break interval; session returns to `OPEN` and accumulates break duration.

---

## 3. Employee View & Correction Requests

### 3.1 Get Today Status

`GET /api/v1/attendance/today`

- **Permission**: `ATTENDANCE_VIEW`
- **Response**: Returns current user's live status, active session, assigned shift, office geofence info, and running work minutes.

### 3.2 Submit Correction Request

`POST /api/v1/attendance/correction-request`

- **Permission**: `ATTENDANCE_MARK`
- **Request Body**:
  ```json
  {
    "targetDate": "2026-10-08",
    "reasonCategory": "MISSING_CHECKOUT",
    "requestedCheckIn": "2026-10-08T09:00:00.000Z",
    "requestedCheckOut": "2026-10-08T18:00:00.000Z",
    "reason": "Biometric device connectivity outage during evening punch",
    "evidenceMetadata": { "ticketId": "IT-4029" }
  }
  ```

### 3.3 My Correction Requests

`GET /api/v1/attendance/my-corrections`

- **Permission**: `ATTENDANCE_VIEW`
- Returns all submitted correction requests and their review statuses (`PENDING`, `APPROVED`, `REJECTED`).

---

## 4. Manager Team Endpoints

| Endpoint                                 | Method |     Permission      | Description                                                    |
| :--------------------------------------- | :----: | :-----------------: | :------------------------------------------------------------- |
| `/manager/dashboard`                     | `GET`  |  `ATTENDANCE_VIEW`  | Headcount, active punches, and pending review counts for team  |
| `/manager/records`                       | `GET`  |  `ATTENDANCE_VIEW`  | Paginated records scoped strictly to direct & indirect reports |
| `/manager/records/:employeeId`           | `GET`  |  `ATTENDANCE_VIEW`  | Timeline and event details with team hierarchy verification    |
| `/manager/corrections`                   | `GET`  |  `ATTENDANCE_VIEW`  | Pending correction requests from team members                  |
| `/manager/corrections/:requestId/decide` | `POST` | `ATTENDANCE_UPDATE` | Approve or reject team correction with audit review notes      |

---

## 5. HR Operations & Administrative Endpoints

| Endpoint                          | Method |     Permission      |     Roles     | Description                                                      |
| :-------------------------------- | :----: | :-----------------: | :-----------: | :--------------------------------------------------------------- |
| `/operations/dashboard`           | `GET`  |  `ATTENDANCE_VIEW`  | `ADMIN`, `HR` | Organization attendance health, headcount KPIs, and distribution |
| `/operations/records`             | `GET`  |  `ATTENDANCE_VIEW`  | `ADMIN`, `HR` | Paginated employee attendance records with multi-filter search   |
| `/operations/records/:employeeId` | `GET`  |  `ATTENDANCE_VIEW`  | `ADMIN`, `HR` | Detailed employee punch timeline and raw event log               |
| `/operations/corrections`         | `GET`  |  `ATTENDANCE_VIEW`  | `ADMIN`, `HR` | All organization correction requests                             |
| `/corrections/:requestId/decide`  | `POST` | `ATTENDANCE_UPDATE` | `ADMIN`, `HR` | Admin approval/rejection of correction requests                  |
| `/recalculate`                    | `POST` | `ATTENDANCE_UPDATE` | `ADMIN`, `HR` | Triggers deterministic recalculation for date range/employee     |
| `/reconcile-missing`              | `POST` | `ATTENDANCE_UPDATE` | `ADMIN`, `HR` | Auto-closes stale unclosed sessions past daily cutoff            |

---

## 6. Attendance Exceptions Queue

| Endpoint                       | Method | Description                                                                                          |
| :----------------------------- | :----: | :--------------------------------------------------------------------------------------------------- |
| `GET /exceptions`              | `GET`  | Paginated attendance exceptions with status (`OPEN`, `RESOLVED`, `DISMISSED`) and severity filters   |
| `GET /exceptions/:id`          | `GET`  | Exception details, anomaly metadata, and affected employee info                                      |
| `POST /exceptions/:id/resolve` | `POST` | Resolves or dismisses an exception with audit notes (`status: "RESOLVED"`, `resolutionNotes: "..."`) |
| `POST /exceptions/scan`        | `POST` | Scans and flags exceptions (late arrival, missing checkout, early departure) for a date              |

---

## 7. Attendance Reporting Endpoints

### 7.1 Daily Attendance Report

`GET /api/v1/attendance/reports/daily`

- **Query Parameters**:
  - `startDate` (Required): `YYYY-MM-DD`
  - `endDate` (Required): `YYYY-MM-DD`
  - `branchId`, `departmentId`, `shiftId`, `status`, `search` (Optional)
  - `page`, `limit` (Pagination)
- **Response**: Summary metrics (total records, present, half-day, absent, late, early exit, total gross/net hours) and paginated employee day records.

### 7.2 Monthly Attendance Report

`GET /api/v1/attendance/reports/monthly`

- **Query Parameters**:
  - `year` (Required, e.g. `2026`)
  - `month` (Required, `1-12`)
  - `branchId`, `departmentId`, `employeeId` (Optional)
- **Response**: Aggregated working days, present days, leaves, week-offs, holidays, late count, total overtime hours, and average work hours per employee.

---

## 8. Office Locations & Policies CRUD

- `GET /api/v1/attendance/locations`: Lists all office geofence locations.
- `POST /api/v1/attendance/locations`: Creates a new office location with GPS coordinates and radius.
- `PATCH /api/v1/attendance/locations/:id`: Updates office perimeter parameters.
- `GET /api/v1/attendance/policies`: Lists organization attendance policies.
- `POST /api/v1/attendance/policies`: Creates or updates attendance policy thresholds.
- `GET /api/v1/attendance/shifts`: Lists configured shift timings.
- `POST /api/v1/attendance/shifts`: Creates new day or overnight shift definitions.
