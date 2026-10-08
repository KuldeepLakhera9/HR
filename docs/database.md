# PeopleOS HRMS — Database Architecture

## 1. Engine & ORM

- **Database**: PostgreSQL 16
- **ORM**: Prisma ORM
- **Schema Location**: `packages/database/prisma/schema.prisma`
- **Active Migrations**:
  1. `20261008064614_init` (Phase 1 foundational schema)
  2. `20261008082956_auth_and_sessions` (Phase 2 refresh tokens & password resets)
  3. `20261008115918_org_and_employee_management` (Phase 3 normalized organizational & employee schema)

---

## 2. Organization Structure Models

### `Organization`

Top-level enterprise tenant.

- Fields: `id`, `name`, `legalName`, `code`, `logo`, `email`, `phone`, `website`, `address`, `city`, `state`, `country`, `timezone`, `currency`, `isActive`, `createdAt`, `updatedAt`
- Relations: `branches`, `departments`, `designations`, `employees`, `users`, `auditLogs`

### `Branch`

Physical sites and regional centers. Preserves exact geographic coordinates for future attendance geofencing.

- Fields: `id`, `organizationId`, `name`, `code`, `address`, `city`, `state`, `postalCode`, `country`, `latitude` (Float), `longitude` (Float), `timezone`, `isActive`, `createdAt`, `updatedAt`
- Indexes: `[organizationId]`, `[code]`, `[organizationId, code]` (Unique)
- Relations: `organization`, `employments`

### `Department`

Organizational divisions with assigned functional heads.

- Fields: `id`, `organizationId`, `name`, `code`, `description`, `departmentHeadId` (nullable Employee ID), `isActive`, `createdAt`, `updatedAt`
- Indexes: `[organizationId]`, `[code]`, `[organizationId, code]` (Unique)
- Relations: `organization`, `departmentHead`, `designations`, `employments`

### `Designation`

Job profiles and hierarchy bands.

- Fields: `id`, `organizationId`, `departmentId` (optional), `name`, `code`, `description`, `level` (Int 1-10), `isActive`, `createdAt`, `updatedAt`
- Indexes: `[organizationId]`, `[code]`, `[level]`, `[organizationId, code]` (Unique)
- Relations: `organization`, `department`, `employments`

---

## 3. Normalized Employee Models

### `Employee`

Core individual identity.

- Fields: `id`, `userId` (optional link to system user), `organizationId`, `employeeCode`, `firstName`, `middleName`, `lastName`, `displayName`, `profilePhoto`, `dateOfBirth`, `gender` (Enum: `MALE`, `FEMALE`, `NON_BINARY`, `PREFER_NOT_TO_SAY`), `status` (Enum: `PROBATION`, `ACTIVE`, `ON_NOTICE`, `RESIGNED`, `TERMINATED`, `EXITED`), `joiningDate`, `exitDate`, `isActive`, `createdAt`, `updatedAt`
- Unique Constraints: `[organizationId, employeeCode]`, `[userId]`
- Indexes: `[organizationId]`, `[employeeCode]`, `[status]`

### `EmployeeEmployment`

Job contract specifications, department/branch allocations, and reporting hierarchy.

- Fields: `id`, `employeeId` (1:1 with Employee), `branchId`, `departmentId`, `designationId`, `managerId` (nullable link to Employee), `employmentType` (Enum: `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`, `CONSULTANT`), `employmentStatus` (matches Employee status), `joiningDate`, `probationEndDate`, `confirmationDate`, `noticePeriodDays`, `workMode` (Enum: `OFFICE`, `HYBRID`, `REMOTE`), `createdAt`, `updatedAt`
- Unique: `[employeeId]`
- Indexes: `[branchId]`, `[departmentId]`, `[designationId]`, `[managerId]`

### `EmployeeContact`

Primary personal and communication data.

- Fields: `id`, `employeeId` (1:1 with Employee), `workEmail`, `personalEmail`, `phone`, `alternatePhone`, `address`, `city`, `state`, `postalCode`, `country`, `createdAt`, `updatedAt`
- Unique: `[employeeId]`, `[workEmail]`
- Indexes: `[workEmail]`

### `EmergencyContact`

1-to-many emergency contacts with designated primary flag.

- Fields: `id`, `employeeId`, `name`, `relationship`, `phone`, `alternatePhone`, `address`, `isPrimary` (Boolean), `createdAt`, `updatedAt`
- Indexes: `[employeeId]`, `[employeeId, isPrimary]`

### `EmployeeHistory`

Immutable career transitions and historical events.

- Fields: `id`, `employeeId`, `eventType` (Enum: `JOINED`, `DEPARTMENT_CHANGED`, `DESIGNATION_CHANGED`, `MANAGER_CHANGED`, `BRANCH_CHANGED`, `PROMOTED`, `TRANSFERRED`, `STATUS_CHANGED`, `WORK_MODE_CHANGED`, `EXITED`), `previousValue`, `newValue`, `performedById` (User ID), `timestamp`, `metadata` (JSON)
- Indexes: `[employeeId]`, `[eventType]`, `[timestamp]`

### `EmployeeDocumentMetadata`

Document verification metadata.

- Fields: `id`, `employeeId`, `documentType`, `documentNumber`, `fileName`, `fileSize`, `mimeType`, `issueDate`, `expiryDate`, `isVerified`, `verifiedAt`, `createdAt`, `updatedAt`
- Indexes: `[employeeId]`, `[documentType]`

---

## 4. Deletion Policies

- To preserve organizational and employee history, hard database deletion is restricted.
- All entities default to `isActive = true`. Deactivation toggles `isActive = false` and generates an audit log event.
- Direct foreign key constraints with `onDelete: Restrict` protect historical relations from accidental cascading loss.
