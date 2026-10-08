# PeopleOS HRMS — REST API Specification (Phase 3)

All endpoints are hosted under `/api/v1` and require Bearer JWT authentication (via `Authorization: Bearer <token>` or session cookies) along with RBAC permission validation.

---

## 1. Organization & Hierarchy Endpoints

### `GET /api/v1/organizations/overview`

- **Permission**: `ORGANIZATION_VIEW`
- **Summary**: High-level organizational overview (KPI counts of branches, departments, designations, total headcount).
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "org-uuid",
      "name": "Acme Corp",
      "code": "ACME",
      "branchCount": 3,
      "departmentCount": 5,
      "designationCount": 7,
      "employeeCount": 8
    }
  }
  ```

### `GET /api/v1/organizations/current`

- **Permission**: `ORGANIZATION_VIEW`
- **Summary**: Retrieve detailed tenant profile.

### `PUT /api/v1/organizations/current`

- **Permission**: `ORGANIZATION_UPDATE`
- **Summary**: Update enterprise tenant metadata (legalName, address, timezone, currency).

### `GET /api/v1/branches`

- **Permission**: `BRANCH_VIEW`
- **Query**: `?search=&isActive=`
- **Summary**: List organizational branches with employee count.

### `POST /api/v1/branches`

- **Permission**: `BRANCH_CREATE`
- **Payload**:
  ```json
  {
    "name": "Bengaluru Innovation Campus",
    "code": "BLR-02",
    "address": "Outer Ring Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560103",
    "country": "India",
    "latitude": 12.925,
    "longitude": 77.683,
    "timezone": "Asia/Kolkata"
  }
  ```

### `PUT /api/v1/branches/:id`

- **Permission**: `BRANCH_UPDATE`
- **Summary**: Update branch details or geographic coordinates.

### `DELETE /api/v1/branches/:id`

- **Permission**: `BRANCH_DELETE`
- **Summary**: Soft-deactivate a branch. Protected against deactivation if active employees are assigned.

### `GET /api/v1/departments`

- **Permission**: `DEPARTMENT_VIEW`
- **Summary**: List departments with assigned department head and member counts.

### `POST /api/v1/departments`

- **Permission**: `DEPARTMENT_CREATE`
- **Payload**: `{ "name": "Platform Engineering", "code": "ENG-PLAT", "description": "Core infra team", "departmentHeadId": "emp-uuid" }`

### `PUT /api/v1/departments/:id`

- **Permission**: `DEPARTMENT_UPDATE`
- **Summary**: Update department title, description, or head.

### `DELETE /api/v1/departments/:id`

- **Permission**: `DEPARTMENT_DELETE`
- **Summary**: Soft-deactivate a department.

### `GET /api/v1/designations`

- **Permission**: `DESIGNATION_VIEW`
- **Summary**: List designations with hierarchical levels and member counts.

### `POST /api/v1/designations`

- **Permission**: `DESIGNATION_CREATE`
- **Payload**: `{ "name": "Principal Engineer", "code": "PR-SWE", "departmentId": "dept-uuid", "level": 6, "description": "Staff Architect" }`

### `PUT /api/v1/designations/:id`

- **Permission**: `DESIGNATION_UPDATE`
- **Summary**: Update designation title, level, or description.

### `DELETE /api/v1/designations/:id`

- **Permission**: `DESIGNATION_DELETE`
- **Summary**: Soft-deactivate a designation.

---

## 2. Employee Endpoints

### `GET /api/v1/employees`

- **Permission**: `EMPLOYEE_VIEW`
- **Query Params**:
  - `page` (default 1), `limit` (default 10)
  - `search` (name, employee code, email, phone)
  - `departmentId`, `branchId`, `designationId`, `managerId`
  - `status` (`PROBATION`, `ACTIVE`, `ON_NOTICE`, `RESIGNED`, `TERMINATED`, `EXITED`)
  - `workMode` (`OFFICE`, `HYBRID`, `REMOTE`)
  - `sortBy` (default `createdAt`), `sortOrder` (`asc` | `desc`)
- **Scoping**:
  - Admin/HR receive organization-wide records.
  - Managers receive recursive direct & indirect reports + self.
  - Employees receive only their own record.

### `GET /api/v1/employees/me`

- **Summary**: Retrieve logged-in user's full employee profile without requiring employee ID parameter.

### `GET /api/v1/employees/:id`

- **Permission**: `EMPLOYEE_VIEW`
- **Summary**: Get comprehensive normalized employee profile (Employment, Contacts, Emergency Contacts, Documents, Career History).
- **Security**: IDOR protected by query-level data scoping.

### `POST /api/v1/employees`

- **Permission**: `EMPLOYEE_CREATE`
- **Summary**: Transactionally onboard an employee across Employee, EmployeeEmployment, EmployeeContact, and EmergencyContacts tables.
- **Validation**:
  - Validates duplicate employee code and work email.
  - Validates branch, department, and designation existence.
  - Validates reporting manager hierarchy (preventing self and cyclic reporting).
  - Automatically records initial `JOINED` career history entry.

### `PUT /api/v1/employees/:id`

- **Permission**: `EMPLOYEE_UPDATE`
- **Summary**: Update employee information. Detects organizational changes (Department, Designation, Manager, Branch, Work Mode) and creates immutable `EmployeeHistory` records.

### `PATCH /api/v1/employees/:id/status`

- **Permission**: `EMPLOYEE_UPDATE`
- **Summary**: Controlled lifecycle status transitions.
- **State Machine Rules**:
  - `PROBATION` → `ACTIVE`, `TERMINATED`, `RESIGNED`
  - `ACTIVE` → `ON_NOTICE`, `TERMINATED`, `RESIGNED`
  - `ON_NOTICE` → `EXITED`, `ACTIVE`
  - Invalid transitions are rejected with HTTP 400.
  - Records `STATUS_CHANGED` history entry with reason and effective date.

### `DELETE /api/v1/employees/:id`

- **Permission**: `EMPLOYEE_DELETE`
- **Summary**: Soft-deactivate an employee (`isActive = false`, status = `EXITED`).

### `GET /api/v1/employees/:id/history`

- **Permission**: `EMPLOYEE_HISTORY_VIEW`
- **Summary**: Retrieve chronological, immutable career history and organizational transitions.

---

## 3. Org Chart & Bulk Data Endpoints

### `GET /api/v1/org-chart`

- **Permission**: `ORG_CHART_VIEW`
- **Query Params**: `departmentId`, `branchId`
- **Summary**: Returns recursive tree structure starting from executive leaders to individual contributors.
- **Tree Node Schema**:
  ```json
  {
    "id": "emp-uuid",
    "name": "Vikram Aditya",
    "employeeCode": "EMP001",
    "designation": "Chief Technology Officer",
    "department": "Executive Leadership",
    "branch": "Bengaluru HQ",
    "status": "ACTIVE",
    "profilePhoto": null,
    "directReportsCount": 3,
    "children": [ ... ]
  }
  ```

### `POST /api/v1/employees/import/preview`

- **Permission**: `EMPLOYEE_IMPORT`
- **Payload**: Multipart form upload (`file` with `.csv` or `.xlsx`)
- **Summary**: Parses and validates all rows against database constraints (duplicates, missing departments, invalid managers, syntax errors). Returns preview with row-level error diagnostic table.

### `POST /api/v1/employees/import/confirm`

- **Permission**: `EMPLOYEE_IMPORT`
- **Payload**: `{ "rows": [ ...validRows ] }`
- **Summary**: Transactionally persists validated rows into database, creating users, contacts, and employments.

### `GET /api/v1/employees/export`

- **Permission**: `EMPLOYEE_EXPORT`
- **Query**: `?format=csv|xlsx` (plus any directory filters)
- **Summary**: Streams secure CSV or Excel spreadsheet of permitted employee records according to caller's access scope.
