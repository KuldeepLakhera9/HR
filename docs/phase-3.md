# Phase 3 — Organization and Employee Management

## Overview

Phase 3 delivers a production-grade, highly normalized organizational structure and employee management foundation for PeopleOS HRMS. This foundation provides the enterprise data architecture, hierarchy traversal, query-level data scoping, and immutable audit logs necessary to power future Phase 4 & Phase 5 modules (Attendance geofencing, Official Visits, WFH, Leave, Approvals, MIS, Payroll, and Performance).

---

## 1. Architectural Highlights

- **Normalized Domain Models**: Instead of a monolithic employee record, data is partitioned into logical normalized entities:
  - `Organization`: Enterprise tenant profile, legal identity, currency, timezone, active status.
  - `Branch`: Multi-location offices preserving exact GPS coordinates (`latitude`, `longitude`, `timezone`) for future attendance geofencing.
  - `Department`: Functional divisions with reporting heads and descriptions.
  - `Designation`: Job titles, role descriptions, and hierarchical seniority levels (1-10).
  - `Employee`: Core persona identity, codes, name components, date of birth, gender, status.
  - `EmployeeEmployment`: Contract metadata, branch/dept/designation links, manager relationship, employment type, work mode, probation/confirmation dates, notice periods.
  - `EmployeeContact`: Work email, personal email, phone numbers, and physical residential address.
  - `EmergencyContact`: 1-to-many emergency contacts with relationship, phone numbers, and primary contact designation.
  - `EmployeeHistory`: Immutable audit history recording organization transitions (`JOINED`, `DEPARTMENT_CHANGED`, `DESIGNATION_CHANGED`, `MANAGER_CHANGED`, `BRANCH_CHANGED`, `PROMOTED`, `TRANSFERRED`, `STATUS_CHANGED`, `WORK_MODE_CHANGED`, `EXITED`).
  - `EmployeeDocumentMetadata`: Document records, file types, verification status, and expiry metadata.

- **Non-Destructive Soft Deactivation**:
  - Historical organization entities (Branches, Departments, Designations) and employees are protected against physical deletion when historical records or active employees reference them.
  - Entities support controlled `isActive: boolean` status with audit logging.

- **Manager Hierarchy & Cycle Prevention**:
  - Direct manager relationship: `Employee.managerId -> Employee`.
  - Recursive ancestor verification prevents self-management and circular reporting loops (e.g. A reports to B while B reports to A).

- **Controlled Employee Lifecycle State Machine**:
  - Enforced status lifecycle: `PROBATION` → `ACTIVE` → `ON_NOTICE` → `EXITED` or `TERMINATED` / `RESIGNED`.
  - Illegal status jumps (e.g. `EXITED` → `PROBATION`) are rejected at the service layer.

- **Query-Level Data Scoping (Backend Enforcement)**:
  - `ADMIN`: Global organizational visibility.
  - `HR`: Organization-wide HR and employee visibility.
  - `MANAGER`: Scoped strictly to recursive team hierarchy (direct and indirect reports) plus self.
  - `EMPLOYEE`: Scoped strictly to self profile (`userId = user.id`).
  - Scoping is enforced in Prisma queries, preventing any IDOR or direct API abuse.

- **Bulk Import & Export**:
  - CSV and Excel (`.xlsx`) parsing and multi-pass pre-validation.
  - Two-phase workflow: Upload → Validate & Preview (row-level errors) → Transactional Confirm.
  - Secure CSV/Excel export respecting authorized role and data scoping.

---

## 2. Granular Permissions Added

| Permission              | Category     | Description                               |
| ----------------------- | ------------ | ----------------------------------------- |
| `ORGANIZATION_VIEW`     | Organization | View enterprise overview and profiles     |
| `ORGANIZATION_UPDATE`   | Organization | Update organization settings              |
| `BRANCH_VIEW`           | Branch       | List and view branch locations            |
| `BRANCH_CREATE`         | Branch       | Create new office branches                |
| `BRANCH_UPDATE`         | Branch       | Update branch details and GPS coordinates |
| `BRANCH_DELETE`         | Branch       | Deactivate or archive branch records      |
| `DEPARTMENT_VIEW`       | Department   | View organizational departments           |
| `DEPARTMENT_CREATE`     | Department   | Create new departments                    |
| `DEPARTMENT_UPDATE`     | Department   | Update department details or head         |
| `DEPARTMENT_DELETE`     | Department   | Deactivate department records             |
| `DESIGNATION_VIEW`      | Designation  | View job designations and levels          |
| `DESIGNATION_CREATE`    | Designation  | Create new job titles/designations        |
| `DESIGNATION_UPDATE`    | Designation  | Update designations or levels             |
| `DESIGNATION_DELETE`    | Designation  | Deactivate designations                   |
| `EMPLOYEE_VIEW`         | Employee     | View employee directory and profiles      |
| `EMPLOYEE_CREATE`       | Employee     | Onboard new employees                     |
| `EMPLOYEE_UPDATE`       | Employee     | Edit employee profile and assignments     |
| `EMPLOYEE_DELETE`       | Employee     | Deactivate or archive employee records    |
| `EMPLOYEE_IMPORT`       | Employee     | Bulk upload employees via CSV/Excel       |
| `EMPLOYEE_EXPORT`       | Employee     | Export employee data to CSV/Excel         |
| `EMPLOYEE_HISTORY_VIEW` | Employee     | View immutable career audit history       |
| `ORG_CHART_VIEW`        | Organization | View interactive organizational hierarchy |

---

## 3. UI Screens Implemented

1. **Organization Management (`/organization`)**:
   - Executive KPI cards: Active Branches, Departments, Designations, Total Headcount.
   - Tabbed management for Branches, Departments, and Designations.
   - Integrated search, filtering, and live employee counts.
   - Modals for creating and editing entities, and confirmation dialogs for safe deactivation.
2. **Employee Directory (`/employees`)**:
   - High-performance data table using shared HRMS design system.
   - Search by name, code, email, or phone.
   - Filters: Department, Branch, Employment Status, Work Mode.
   - Bulk CSV/Excel export and bulk import modal with preview and row-level error reporting.
3. **Add Employee Flow (`/employees/new`)**:
   - 5-step onboarding wizard:
     1. Basic Information (Code, First/Middle/Last Name, DOB, Gender).
     2. Employment (Branch, Dept, Designation, Manager, Type, Work Mode, Notice Period).
     3. Contact Information (Work email, Personal email, Phone, Address).
     4. Emergency Contact (Name, Relationship, Phone, Primary flag).
     5. Review & Submit (Summary preview, transactional creation).
4. **Employee Profile (`/employees/[id]`)**:
   - Tabbed layout: Overview, Employment Details, Contact & Emergency, Documents, Career History.
   - Status transition action modal with reason logging.
   - Edit Profile dialog with audit history recording.
5. **Interactive Org Chart (`/org-chart`)**:
   - Visual hierarchical tree: Executive → Managers → Individual Contributors.
   - Expand/collapse branch nodes with direct report counts.
   - Zoom controls (+ / - / reset) and department/branch filtering.
   - Direct link to employee profiles.
6. **Self Profile (`/profile`)**:
   - Connects authenticated user to their own employee record with access scope indicators and direct link to their full profile tabs.

---

## 4. Test Verification

- **API Unit & Integration Tests**: 10 test suites, 152 tests passing cleanly (`pnpm --filter @hrms/api test`).
- **TypeScript Typecheck**: Clean compilation across all 7 monorepo packages (`pnpm turbo run typecheck`).
- **ESLint Code Quality**: Clean lint with zero warnings or errors (`pnpm turbo run lint`).
- **Production Build**: Clean static and dynamic Next.js 14 and NestJS compilation (`pnpm turbo run build`).
