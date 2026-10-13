# Enterprise HRMS Testing Guide & Automated Validation Framework

**Document Version**: 1.0.0  
**Phase**: Phase 14 — Automated Testing, End-to-End Validation & Bug Fixing  
**Scope**: `@hrms/api` (NestJS backend), `@hrms/web` (Next.js frontend), `@hrms/types`, `@hrms/database`

---

## 1. LOCAL TEST ENVIRONMENT

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 12.8.0`
- **Turborepo**: `^2.4.4`
- **Docker & PostgreSQL**: PostgreSQL 16 running on port `5434` (or configured via `DATABASE_URL`)

### Environment Setup

```bash
# Install dependencies across all monorepo workspaces
pnpm install

# Generate Prisma Client models
pnpm --filter @hrms/database run generate

# Verify TypeScript compilation across all packages
pnpm run typecheck
```

---

## 2. EXECUTING TESTS

### Full Monorepo Test Suite

Runs all frontend and backend test suites concurrently via Turborepo:

```bash
# Run all tests across the monorepo
pnpm test
# or
npx turbo run test
```

### Backend API Tests (`@hrms/api`)

```bash
# Run all backend test suites (64 suites, 1,106 tests)
pnpm --filter @hrms/api test

# Run targeted test suites
npx jest src/modules/auth/phase14-e2e-workflows-and-validation.spec.ts
npx jest src/modules/auth/phase13-security-hardening.spec.ts
npx jest src/modules/employees/employees.service.spec.ts
npx jest src/modules/leave/leave.service.spec.ts
npx jest src/modules/attendance/attendance.service.spec.ts
npx jest src/modules/payroll/tests/payroll-run-orchestration.spec.ts
```

### Frontend Web Tests (`@hrms/web`)

```bash
# Run all frontend unit and hook test suites (3 suites, 13 tests)
pnpm --filter @hrms/web test

# Run individual frontend spec
pnpm --filter @hrms/web test src/tests/usePermissions.spec.ts
pnpm --filter @hrms/web test src/tests/useNavigation.spec.ts
pnpm --filter @hrms/web test src/tests/formatting-utils.spec.ts
```

---

## 3. MONOREPO BUILD & ARTIFACT VALIDATION

To verify production builds and compile-time static safety:

```bash
# Typecheck all 7 packages
pnpm run typecheck

# Full production build (API + Next.js web application)
pnpm run build
```

---

## 4. TEST ARCHITECTURE & MODULE COVERAGE

### Backend Test Matrix (`@hrms/api`)

| Module                  | Spec Files                                                                                                          | Key Scenarios Covered                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Auth & Security**     | `auth.service.spec.ts`, `security-review.spec.ts`, `phase13-security-hardening.spec.ts`                             | Argon2id hashing, timing safety, token rotation, lockout, CSV formula injection defense, rate limiting, audit scrubbing |
| **RBAC & Workflows**    | `phase14-e2e-workflows-and-validation.spec.ts`, `access-control.service.spec.ts`, `rbac.guards.spec.ts`             | 4 roles (ADMIN, HR, MANAGER, EMPLOYEE), Workflows A to G, tenant isolation, cross-employee IDOR prevention              |
| **Employees & Org**     | `employees.service.spec.ts`, `hierarchy.service.spec.ts`, `organization.service.spec.ts`                            | Onboarding, manager ancestry validation, cycle detection, transition lifecycle, CSV/XLSX export                         |
| **Attendance**          | `attendance.service.spec.ts`, `attendance-security.spec.ts`, `policy-evaluator.util.spec.ts`                        | Geofence verification, shift cutoff, check-in/out, idempotent exception logging, privacy coordinate masking             |
| **Leave & Absences**    | `leave.service.spec.ts`, `leave-validation.service.spec.ts`, `leave-calculator.service.spec.ts`                     | Date ranges, annual boundary enforcement, approval ledger deduction, balance carryover                                  |
| **Performance**         | `review-cycles.service.spec.ts`, `self-assessment.service.spec.ts`, `manager-reviews.service.spec.ts`               | Review cycles, rating calculations, self & manager reviews, 9-box grids                                                 |
| **Payroll & Finance**   | `payroll-calculation-engine.spec.ts`, `payroll-run-orchestration.spec.ts`, `payroll-security-gate.spec.ts`          | 2-decimal precision, itemized components, approval workflow, locked run immutability, payslip isolation                 |
| **Reports & Analytics** | `mis-report-library.service.spec.ts`, `executive-dashboard.service.spec.ts`, `attendance-analytics.service.spec.ts` | Metric dictionary, date/department filtering, aggregation correctness, empty dataset safety                             |

### Frontend Test Matrix (`@hrms/web`)

| Test File                  | Focus                     | Scenarios Covered                                                                                                    |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `usePermissions.spec.ts`   | Authorization Hooks       | ADMIN role override, granular permission matching, `hasAnyPermission`, `hasAllPermissions`, unauthenticated fallback |
| `useNavigation.spec.ts`    | Role & Navigation Scoping | Sidebar tab filtering based on active role and granted permissions, preview vs authenticated mode                    |
| `formatting-utils.spec.ts` | Display Utilities         | INR currency formatting (`formatCurrency`), date parsing (`formatDate`), status labels (`formatStatusLabel`)         |

---

## 5. DEFECTS RESOLVED & REGRESSION COVERAGE

1. **[P1] Missing Frontend Test Infrastructure**:
   - _Defect_: `apps/web` had no test runner or frontend unit test suite.
   - _Fix_: Configured Jest (`ts-jest`) in `apps/web` with path mapping and React hooks headless mocks.
   - _Regression Spec_: `apps/web/src/tests/usePermissions.spec.ts`, `useNavigation.spec.ts`, `formatting-utils.spec.ts`.
2. **[P1] Concurrent Build Cache Contention**:
   - _Defect_: Simultaneous Next.js dev server and production build clashed over `.next` directory locks.
   - _Fix_: Decoupled compilation pipelines and verified clean build artifacts across all 37 pages.
3. **[P2] Shared Display Formatting Inconsistencies**:
   - _Defect_: Currency and status formatters were duplicated ad-hoc in individual report components with inconsistent NaN and empty-value handling.
   - _Fix_: Implemented centralized `apps/web/src/lib/formatters.ts` with comprehensive null-safety.
4. **[P0/P1] Cross-Module E2E Workflow Regression**:
   - _Defect_: Need for regression verification across all 4 roles and business workflows A through G.
   - _Fix_: Added `phase14-e2e-workflows-and-validation.spec.ts` covering onboarding, leave approvals, attendance idempotency, payroll precision, locked run immutability, and payslip isolation.

---

## 6. TEST DATA FIXTURES & ISOLATION POLICY

- **Non-Destructive Testing**: All tests use isolated synthetic test fixtures with zero dependencies on real employee records or live payroll accounts.
- **Tenant Isolation**: Every database operation is bound to a synthetic `organizationId` (`org-phase14-enterprise`).
- **Cryptographic Mocking**: High-entropy keys and synthetic tokens are generated deterministically in tests.
