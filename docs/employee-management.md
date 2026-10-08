# PeopleOS HRMS — Employee Management Architecture

## 1. Normalized Employee Model

To maintain high data integrity, performant queries, and avoid sprawling monolithic records, employee data is normalized into dedicated entities:

- `Employee`: Core persona identity (names, code, date of birth, gender, status, profile photo).
- `EmployeeEmployment`: Contract details, branch/department/designation assignment, manager ID, probation/confirmation dates, work mode (`OFFICE`, `HYBRID`, `REMOTE`).
- `EmployeeContact`: Primary work email, personal email, phone numbers, and physical residential address.
- `EmergencyContact`: 1-to-many emergency contacts with relationship and primary flag.
- `EmployeeHistory`: Immutable audit history recording all organizational and status changes.
- `EmployeeDocumentMetadata`: Document records, types, verification flags, and expiry tracking.

---

## 2. Manager Hierarchy & Reporting Tree

- **Direct Relation**: `Employee.managerId -> Employee`.
- **Structural Integrity Rules**:
  1. An employee cannot be their own manager (`employeeId !== managerId`).
  2. Recursive ancestor inspection prevents circular reporting chains ($A \rightarrow B \rightarrow A$ or $A \rightarrow B \rightarrow C \rightarrow A$).
  3. Reporting managers must belong to the same organization tenant and have an active status.
- **Powers Org Chart & Scoping**:
  - The manager relationship generates the interactive organization chart tree.
  - Enables recursive subtree calculation for Manager data scoping.

---

## 3. Controlled Status Lifecycle State Machine

Employee progression follows a strictly defined state machine:

```
          ┌─────────────┐
          │  PROBATION  │
          └──────┬──────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   ACTIVE    │     │ TERMINATED/ │
└──────┬──────┘     │  RESIGNED   │
       │            └─────────────┘
       ▼                   ▲
┌─────────────┐            │
│  ON_NOTICE  │────────────┘
└──────┬──────┘
       ▼
┌─────────────┐
│   EXITED    │
└─────────────┘
```

- Status changes require an explicit transition reason and effective date.
- Every status transition automatically generates an immutable `STATUS_CHANGED` history entry.

---

## 4. Immutable Employee History

Any change to an employee's organizational placement creates an immutable record in `EmployeeHistory`:

- `JOINED`: Onboarding record.
- `DEPARTMENT_CHANGED`: Department reassignments.
- `DESIGNATION_CHANGED`: Promotions and title updates.
- `MANAGER_CHANGED`: Reporting line changes.
- `BRANCH_CHANGED`: Office transfers.
- `STATUS_CHANGED`: Lifecycle transitions (Probation -> Active -> On Notice -> Exited).
- `WORK_MODE_CHANGED`: Transitions between Office, Hybrid, and Remote.

Records preserve: `eventType`, `previousValue`, `newValue`, `performedById`, `timestamp`, and `metadata`.

---

## 5. Data Access Scoping (Backend Enforcement)

Data scoping is enforced in Prisma queries at the service layer:

- **ADMIN**: Global organizational visibility.
- **HR**: Organization-wide HR visibility.
- **MANAGER**: Direct and indirect reporting subordinates + self.
- **EMPLOYEE**: Self-record only (`userId = user.id`).

Unauthorized attempts to access records outside one's authorized scope (e.g. Employee A requesting Employee B, or Manager A requesting Manager B's team) return HTTP 404 (`Not Found or unauthorized scope`), preventing IDOR enumeration.

---

## 6. Bulk Import & Export

- **Supported Formats**: CSV and Excel (`.xlsx`).
- **Import Pipeline**:
  1. **Upload & Parse**: Streams file into memory buffer.
  2. **Multi-Pass Validation**: Validates duplicate codes/emails, verify that departments/designations/branches exist, checks manager validity, and verifies enum formats.
  3. **Row-Level Preview**: Displays verified rows along with row-specific diagnostic error messages (e.g. _Row 14: Department 'Marketing' not found_).
  4. **Transactional Commit**: Inserts all records within a database transaction; rolls back on failure.
- **Export Pipeline**: Generates CSV or Excel file containing permitted employees based on the caller's active data scope.
