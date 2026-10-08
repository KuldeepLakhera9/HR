# PeopleOS HRMS — Organization Management Architecture

## 1. Domain Entities

The organizational model represents the corporate anatomy of the enterprise:

```
Organization (Root Tenant)
├── Branches (Physical Office Locations)
├── Departments (Business Units & Functional Teams)
└── Designations (Job Profiles & Hierarchy Levels)
```

---

## 2. Branch Architecture & Geofence Readiness

Every physical workspace is modeled as a `Branch`:

- **Identity**: `name`, unique organizational `code` (e.g., `BLR-HQ`, `MUM-01`).
- **Physical Address**: `address`, `city`, `state`, `postalCode`, `country`.
- **Geographic Coordinates**:
  - `latitude`: High-precision float (e.g., `12.9250`).
  - `longitude`: High-precision float (e.g., `77.6830`).
  - `timezone`: IANA timezone string (e.g., `Asia/Kolkata`).

### Phase 4/5 Attendance Readiness Notice:

Future Phase 4/5 Attendance will support three modes:

1. **OFFICE**: Check-in validated against branch geofence boundary using branch `latitude` and `longitude`.
2. **OFFICIAL VISIT**: Check-in outside office using approved location workflow.
3. **WFH**: Remote check-in through approved remote workflow.

> [!IMPORTANT]
> GPS coordinates and timezones are recorded and validated during branch creation in Phase 3, ensuring zero migration friction when attendance geofencing is enabled in Phase 4.

---

## 3. Department Management

- Represents organizational divisions (e.g., Engineering, People Operations, Finance).
- Supports an optional assigned **Department Head** (`departmentHeadId` -> `Employee`).
- Includes code uniqueness constraint per organization: `[organizationId, code]`.
- Soft-deactivation prevents breaking historical employee records that reference the department.

---

## 4. Designation & Hierarchy Levels

- Defines job titles (e.g., Senior Software Engineer, Engineering Manager, VP).
- Assigned an integer hierarchy level: `level: 1` (entry-level) to `level: 10` (executive leadership).
- Can optionally link to a specific `Department` or apply globally across the organization.

---

## 5. Non-Destructive Lifecycle

- **No Hard Physical Deletion**: Historical organization structures cannot be deleted if active or historical employee records point to them.
- Deactivation sets `isActive = false`, immediately hiding the record from new employee onboarding dropdowns while preserving full reporting and career history integrity.
