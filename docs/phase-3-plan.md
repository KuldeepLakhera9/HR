# Phase 3 — Organization and Employee Management Implementation Plan

**Phase:** Phase 3 — Step 1: Architecture Inspection & Implementation Plan  
**Target Architecture:** Modular Monolith (NestJS + Next.js + PostgreSQL + Prisma)  
**System:** PeopleOS Self-Hosted Enterprise HRMS

---

## 1. Executive Summary & Verification of Prior Phases

### 1.1 Phase 1 (Foundation) Verification

- **Application Shell & Layout**: The responsive ivory & warm stone design system (`AppShell`, `Sidebar`, `Header`, `Breadcrumb`) is fully established with Lucide icons and clean navigation.
- **Design System Tokens**: Warm stone neutrals (`stone-900`, `stone-600`, `stone-200`), ivory backgrounds (`#FAF8F5` / `ivory-50`), and deep amber accents (`amber-800`, `amber-900`) are universally shared without ad-hoc themes.
- **Docker & PostgreSQL**: Dedicated PostgreSQL 16 container (`hrms_postgres`) running healthy with connection pooling and automated health checks (`GET /api/v1/health`).
- **Prisma Foundation**: Prisma Client generated and mapped to PostgreSQL with UUID primary keys and standard timestamps (`createdAt`, `updatedAt`, `deletedAt`).

### 1.2 Phase 2 (Authentication & RBAC) Verification

- **Argon2id Password Security**: Enforces constant-time verification, pepper/salt hashing, and dummy comparison against email enumeration.
- **Dual-Token Session System**: Short-lived JWT access tokens (15m) + cryptographic SHA-256 hashed refresh tokens with automatic family revocation upon reuse detection.
- **Four Core Application Roles**: Exactly four system roles: `ADMIN`, `HR`, `MANAGER`, and `EMPLOYEE`.
- **Authorization Enforcement**: Guards (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`) execute on NestJS controllers, backed by frontend `ProtectedRoute` and `useAuth` hook.
- **Audit Logging**: Asynchronous, sanitized audit logging (`AuditService`) capturing authentication, session revocation, and security events without recording tokens or hashes.

---

## 2. Database Changes & Normalized Schema Plan

To maintain enterprise query performance and avoid a monolithic employee table, Phase 3 establishes a fully normalized data model:

```
Organization
├── Branch (Physical offices with GPS coordinates for attendance geofencing)
├── Department (Business units with assigned department head)
└── Designation (Job profiles with hierarchy levels 1-10)

Employee
├── EmployeeEmployment (Contract, branch/dept/designation links, manager, workMode)
├── EmployeeContact (Work email, personal email, phone, residential address)
├── EmergencyContact (1-to-many emergency contacts with primary flag)
├── EmployeeHistory (Immutable audit log of career & organization transitions)
└── EmployeeDocumentMetadata (Document types, verification, expiry dates)
```

### 2.1 Entity Details

1. **`Organization`**:
   - Fields: `name`, `legalName`, `code` (unique), `logo`, `email`, `phone`, `website`, `address`, `city`, `state`, `country`, `timezone`, `currency`, `isActive`, timestamps.
   - Deletion Policy: Soft-deactivation (`isActive = false`) to preserve historical integrity.

2. **`Branch`** (Geofence-Ready):
   - Fields: `organizationId`, `name`, `code`, `address`, `city`, `state`, `postalCode`, `country`, `latitude` (Float), `longitude` (Float), `timezone`, `isActive`, timestamps.
   - Unique: `[organizationId, code]`.
   - _Future Attendance Readiness_: High-precision coordinates and timezones are recorded in Phase 3 so Phase 4/5 geofencing can be enabled without database migrations.

3. **`Department`**:
   - Fields: `organizationId`, `name`, `code`, `description`, `departmentHeadId` (nullable Employee ID), `isActive`, timestamps.
   - Unique: `[organizationId, code]`.

4. **`Designation`**:
   - Fields: `organizationId`, `departmentId` (optional), `name`, `code`, `description`, `level` (Int 1-10), `isActive`, timestamps.
   - Unique: `[organizationId, code]`.

5. **`Employee`**:
   - Fields: `userId` (optional link to User), `organizationId`, `employeeCode`, `firstName`, `middleName`, `lastName`, `displayName`, `profilePhoto`, `dateOfBirth`, `gender` (Enum: `MALE`, `FEMALE`, `NON_BINARY`, `PREFER_NOT_TO_SAY`), `status` (Enum: `PROBATION`, `ACTIVE`, `ON_NOTICE`, `RESIGNED`, `TERMINATED`, `EXITED`), `joiningDate`, `exitDate`, `isActive`, timestamps.
   - Unique: `[organizationId, employeeCode]`, `[userId]`.

6. **`EmployeeEmployment`**:
   - Fields: `employeeId` (1:1), `branchId`, `departmentId`, `designationId`, `managerId` (Employee ID), `employmentType` (`FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`, `CONSULTANT`), `employmentStatus` (Enum), `joiningDate`, `probationEndDate`, `confirmationDate`, `noticePeriodDays`, `workMode` (`OFFICE`, `HYBRID`, `REMOTE`), timestamps.

7. **`EmployeeContact`**:
   - Fields: `employeeId` (1:1), `workEmail` (unique), `personalEmail`, `phone`, `alternatePhone`, `address`, `city`, `state`, `postalCode`, `country`, timestamps.

8. **`EmergencyContact`**:
   - Fields: `employeeId`, `name`, `relationship`, `phone`, `alternatePhone`, `address`, `isPrimary` (Boolean), timestamps.

9. **`EmployeeHistory`**:
   - Fields: `employeeId`, `eventType` (`JOINED`, `DEPARTMENT_CHANGED`, `DESIGNATION_CHANGED`, `MANAGER_CHANGED`, `BRANCH_CHANGED`, `PROMOTED`, `TRANSFERRED`, `STATUS_CHANGED`, `WORK_MODE_CHANGED`, `EXITED`), `previousValue`, `newValue`, `performedById`, `timestamp`, `metadata` (JSON).

10. **`EmployeeDocumentMetadata`**:
    - Fields: `employeeId`, `documentType`, `documentNumber`, `fileName`, `fileSize`, `mimeType`, `issueDate`, `expiryDate`, `isVerified`, `verifiedAt`, timestamps.

---

## 3. Module Structure Plan

### Backend (`apps/api/src/modules/`)

```
apps/api/src/modules/
├── organization/
│   ├── dto/
│   │   └── organization.dto.ts      # DTOs for Org, Branch, Dept, Designation
│   ├── organization.controller.ts   # REST endpoints for Org, Branches, Depts, Designations
│   ├── organization.service.ts      # Core business logic & soft-deactivation guards
│   ├── organization.service.spec.ts # Unit & integration test suite
│   └── organization.module.ts       # Module registration with AuditModule & Prisma
├── employees/
│   ├── dto/
│   │   └── employee.dto.ts          # Create, Update, StatusTransition, Filters DTOs
│   ├── employees.controller.ts      # Directory, Profile, Status, Import/Export, Me endpoints
│   ├── employees.service.ts         # Query scoping, hierarchy cycle checks, lifecycle engine
│   ├── employees.service.spec.ts    # Service tests (scoping, hierarchy, import preview, lifecycle)
│   └── employees.module.ts          # Module export
```

### Frontend (`apps/web/src/app/`)

```
apps/web/src/app/
├── organization/
│   └── page.tsx                     # Organization management (Tabs: Branches, Depts, Designations)
├── employees/
│   ├── page.tsx                     # Employee Directory with search, filters, export, import modal
│   ├── new/
│   │   └── page.tsx                 # 5-step transactional employee onboarding wizard
│   └── [id]/
│       └── page.tsx                 # Full profile (Overview, Employment, Contact, Docs, History)
├── org-chart/
│   └── page.tsx                     # Interactive hierarchical tree with zoom & filtering
└── profile/
    └── page.tsx                     # Self-profile view linked to authenticated user's record
```

---

## 4. API Plan

All endpoints prefixed with `/api/v1` and protected by `JwtAuthGuard`, `RolesGuard`, and `PermissionsGuard`.

### Organization & Hierarchy

- `GET /api/v1/organizations/overview` (`ORGANIZATION_VIEW`): KPI counts of branches, depts, designations, headcount.
- `GET /api/v1/organizations/current` (`ORGANIZATION_VIEW`): Full tenant profile.
- `PUT /api/v1/organizations/current` (`ORGANIZATION_UPDATE`): Update tenant profile.
- `GET /api/v1/branches` (`BRANCH_VIEW`): List branches with active employee counts.
- `POST /api/v1/branches` (`BRANCH_CREATE`): Create branch with latitude/longitude/timezone.
- `PUT /api/v1/branches/:id` (`BRANCH_UPDATE`): Update branch details.
- `DELETE /api/v1/branches/:id` (`BRANCH_DELETE`): Soft-deactivate branch (guarded against active assignments).
- `GET /api/v1/departments` (`DEPARTMENT_VIEW`): List departments with assigned heads.
- `POST /api/v1/departments` (`DEPARTMENT_CREATE`): Create department.
- `PUT /api/v1/departments/:id` (`DEPARTMENT_UPDATE`): Update department.
- `DELETE /api/v1/departments/:id` (`DEPARTMENT_DELETE`): Soft-deactivate department.
- `GET /api/v1/designations` (`DESIGNATION_VIEW`): List designations with levels.
- `POST /api/v1/designations` (`DESIGNATION_CREATE`): Create designation with level.
- `PUT /api/v1/designations/:id` (`DESIGNATION_UPDATE`): Update designation.
- `DELETE /api/v1/designations/:id` (`DESIGNATION_DELETE`): Soft-deactivate designation.

### Employees & Hierarchy

- `GET /api/v1/employees` (`EMPLOYEE_VIEW`): Scoped employee listing with pagination, search, and filters.
- `GET /api/v1/employees/me` (Authenticated): Current logged-in user's full profile.
- `GET /api/v1/employees/:id` (`EMPLOYEE_VIEW`): Detailed normalized employee profile (scoped).
- `POST /api/v1/employees` (`EMPLOYEE_CREATE`): Transactional multi-table employee creation.
- `PUT /api/v1/employees/:id` (`EMPLOYEE_UPDATE`): Update employee and record career history.
- `PATCH /api/v1/employees/:id/status` (`EMPLOYEE_UPDATE`): Controlled state machine transition.
- `DELETE /api/v1/employees/:id` (`EMPLOYEE_DELETE`): Soft-deactivate employee.
- `GET /api/v1/employees/:id/history` (`EMPLOYEE_HISTORY_VIEW`): Chronological career audit trail.
- `GET /api/v1/org-chart` (`ORG_CHART_VIEW`): Hierarchical tree from Executive to individual contributors.
- `POST /api/v1/employees/import/preview` (`EMPLOYEE_IMPORT`): Multipart CSV/Excel parse & row diagnostics.
- `POST /api/v1/employees/import/confirm` (`EMPLOYEE_IMPORT`): Transactional bulk commit.
- `GET /api/v1/employees/export` (`EMPLOYEE_EXPORT`): Stream scoped CSV or Excel export.

---

## 5. Employee Lifecycle & Manager Hierarchy

### 5.1 Controlled Status State Machine

```
PROBATION ────► ACTIVE ────► ON_NOTICE ────► EXITED
    │              │             ▲
    ├──────────────┼─────────────┘
    ▼              ▼
TERMINATED      RESIGNED
```

- Disallow arbitrary jumps (e.g. `EXITED` → `PROBATION` is strictly rejected).
- Each transition requires a reason and generates a `STATUS_CHANGED` history entry.

### 5.2 Manager Reporting & Cycle Detection

- Direct link: `Employee.managerId -> Employee`.
- Validation checks:
  1. `employeeId !== managerId` (self-management rejected).
  2. Manager must exist, be active, and belong to the same organization.
  3. Recursive ancestor inspection verifies that the chosen manager does not report (directly or indirectly) to this employee.

---

## 6. Data Access Scope Architecture

Enforced at the service query layer using Prisma filters:

- **`ADMIN`**: Global organization filter: `{ organizationId: user.organizationId }`.
- **`HR`**: Organization employee filter: `{ organizationId: user.organizationId }`.
- **`MANAGER`**: Recursive team filter:
  $$\text{Target IDs} = \{\text{Subordinates recursively reporting to user}\} \cup \{\text{user's own employee ID}\}$$
- **`EMPLOYEE`**: Self only: `{ userId: user.id }`.

Attempts to query outside authorized scope return HTTP 404 (`Not found or unauthorized scope`), preventing IDOR enumeration.

---

## 7. UI Screens & User Experience

- **Organization Management (`/organization`)**: KPI summary cards, tabbed views for Branches, Departments, Designations, search, edit modals, and deactivation confirmation dialogs.
- **Employee Directory (`/employees`)**: Search by name/code/email/phone, multi-select filters, status badges, CSV export, and bulk import modal with row error indicators.
- **Onboarding Wizard (`/employees/new`)**: 5-step form (Basic Info → Employment → Contact → Emergency Contacts → Review & Submit).
- **Employee Profile (`/employees/[id]`)**: Tabbed profile (Overview, Employment, Contact, Documents metadata, Career History), edit dialog, and lifecycle transition modal.
- **Org Chart (`/org-chart`)**: Expandable/collapsible interactive node tree, zoom controls, branch/dept filters, and profile links.
- **Self Profile (`/profile`)**: Live display of authenticated employee's profile and security entitlements.

---

## 8. Permissions Added (22 Total)

- **Organization**: `ORGANIZATION_VIEW`, `ORGANIZATION_UPDATE`
- **Branch**: `BRANCH_VIEW`, `BRANCH_CREATE`, `BRANCH_UPDATE`, `BRANCH_DELETE`
- **Department**: `DEPARTMENT_VIEW`, `DEPARTMENT_CREATE`, `DEPARTMENT_UPDATE`, `DEPARTMENT_DELETE`
- **Designation**: `DESIGNATION_VIEW`, `DESIGNATION_CREATE`, `DESIGNATION_UPDATE`, `DESIGNATION_DELETE`
- **Employee**: `EMPLOYEE_VIEW`, `EMPLOYEE_CREATE`, `EMPLOYEE_UPDATE`, `EMPLOYEE_DELETE`
- **Operations**: `EMPLOYEE_IMPORT`, `EMPLOYEE_EXPORT`, `EMPLOYEE_HISTORY_VIEW`, `ORG_CHART_VIEW`

---

## 9. Testing & Quality Gates

- **Unit & Integration Tests**:
  - `organization.service.spec.ts`: CRUD, duplicate codes, soft-deactivation protection.
  - `employees.service.spec.ts`: Data scoping, hierarchy cycle detection, status transition rules, import preview diagnostics, CSV/Excel export.
- **Security Tests**: IDOR rejection for peer employees and cross-manager teams.
- **Quality Gates**:
  1. `pnpm turbo run typecheck` (0 errors across 7 packages)
  2. `pnpm turbo run lint` (0 warnings or errors)
  3. `pnpm --filter @hrms/api test` (all test suites passing)
  4. `pnpm turbo run build` (Next.js & NestJS production compilation)

---

## 10. Migration Strategy

1. **Step 1**: Create and apply Prisma migration (`20261008115918_org_and_employee_management`) to add normalized tables and enums while preserving Phase 1/2 structures.
2. **Step 2**: Update `seed.ts` with organization, branches, departments, designations, permissions, and initial employee reporting hierarchy.
3. **Step 3**: Implement backend organization and employee modules with scoping, hierarchy validation, and audit integration.
4. **Step 4**: Implement frontend pages (`/organization`, `/employees`, `/employees/new`, `/employees/[id]`, `/org-chart`, `/profile`).
5. **Step 5**: Run full quality verification gates (typecheck, lint, test, build).
