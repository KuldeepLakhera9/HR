# Leave Calculation and Validation Engine: Accounting Boundaries and Policy Dynamics

## 1. Architectural Overview

The Leave Calculation and Validation Engine (`LeaveCalculatorService` & `LeaveValidationService`) provides deterministic, audit-proof, server-side leave evaluation for the HRMS.

The engine acts as the authoritative gatekeeper between employee requests and the immutable double-entry leave ledger (`LeaveLedgerService`), ensuring that:

- Every chargeable day calculation is deterministic and independent of client-side or browser clocks.
- Organization work calendars, branch-specific holiday lists, and employee shift schedules dictate working days.
- Overlapping requests across Leaves, Official Visits, and Work-From-Home schedules are proactively detected and blocked.
- Multi-constraint validations (notice periods, duration caps, document requirements) are evaluated pre-flight and revalidated atomically inside database transactions.

---

## 2. Chargeable Leave Counting Behavior

### 2.1 Date Range and Work Schedule Resolution

When an employee applies for leave over a date range `[startDate, endDate]`:

1. **Normalization**: Both dates are normalized to UTC Midnight (`00:00:00.000Z`) to avoid daylight saving or timezone boundary drifts.
2. **Shift Calendar Lookup**: The employee's active `ShiftAssignment` determines their weekly working days (e.g., `[1, 2, 3, 4, 5]` for Monday through Friday). Non-working days are classified as `weekendDays`.
3. **Holiday Lookup**: The branch-specific and organization-wide gazetted holidays (`Holiday` table) falling within the range are resolved.

### 2.2 Standard Day Counting Formula

By default, for standard policies:
$$\text{Chargeable Days} = \text{Total Calendar Days} - \text{Weekend Days} - \text{Holiday Days}$$

_Example_: An employee applies from Friday, Oct 16 to Monday, Oct 19.

- Total calendar days = 4 (Fri, Sat, Sun, Mon)
- Weekend days = 2 (Sat, Sun)
- Holiday days = 0
- Chargeable days = 2 (Fri, Mon)

### 2.3 The "Sandwich Rule" Behavior

If the assigned `LeavePolicy` has `countWeekendsAsLeave = true` and `countHolidaysAsLeave = true`, intervening non-working days enclosed by leave days are treated as chargeable leave.

- When an employee takes Friday and the following Monday off under a sandwich policy, Saturday and Sunday are counted, resulting in **4 chargeable days**.
- If a gazetted holiday falls between leave days, it is counted as chargeable.
- The engine marks `isSandwichApplied = true` and generates a structured warning `SANDWICH_RULE_APPLIED` for user transparency.

### 2.4 Half-Day Rules

- Supported durations: `FIRST_HALF` (morning) and `SECOND_HALF` (afternoon).
- **Single-Day Invariant**: Half-day leave is strictly permitted for a single calendar day (`startDate == endDate`). Multi-day half-day applications are rejected with `HALF_DAY_MULTI_DAY_PROHIBITED`.
- **Policy Invariant**: If `leaveType.allowHalfDay = false`, half-day requests are rejected with `HALF_DAY_NOT_ALLOWED`.
- **Chargeable Weight**: Exactly `0.5` days are deducted and reserved on the ledger.

---

## 3. Leave-Year Boundaries and Multi-Year Handling

### 3.1 Accounting Period Isolation

Leave entitlements, accruals, reservations, and consumptions are maintained in `LeaveBalanceAccount` keyed by `(organizationId, employeeId, leaveTypeId, leaveYear)`.

Annual carry-forwards, lapsing of unused casual leaves, and annual entitlement grants are strictly segmented by leave year (e.g., calendar year 2026).

### 3.2 Cross-Boundary Policy Rule (`CROSS_LEAVE_YEAR_BOUNDARY`)

To prevent corruption of annual ledger balances and ensure accurate carry-forward accounting:

- **No single leave application may span across a leave-year boundary.**
- _Example_: An application from Dec 28, 2026 to Jan 4, 2027 is **blocked** with error code `CROSS_LEAVE_YEAR_BOUNDARY`.
- **Resolution**: The employee must submit two distinct applications:
  1. Dec 28, 2026 to Dec 31, 2026 (deducted from 2026 balance ledger).
  2. Jan 1, 2027 to Jan 4, 2027 (deducted from 2027 balance ledger after annual opening grants/carry-forward).

---

## 4. Policy Changes and Mid-Year Transitions

### 4.1 Effective-Date Policy Scoping

Employees are assigned policies via `EmployeeLeavePolicyAssignment` with `effectiveFrom` and optional `effectiveTo`.

- When an employee applies for leave, the engine queries the assignment whose validity encloses the leave period:
  $$\text{effectiveFrom} \le \text{endDate} \quad \text{AND} \quad (\text{effectiveTo IS NULL} \lor \text{effectiveTo} \ge \text{startDate})$$
- When an organization updates an employee's policy mid-year (e.g., probation completion increasing entitlement from 6 to 18 days):
  - A new `EmployeeLeavePolicyAssignment` is inserted with `effectiveFrom = probationEndDate`.
  - The previous assignment's `effectiveTo` is closed.
  - An administrative balance adjustment (`ADJUSTMENT` transaction) is posted to record the delta in `allocatedBalance`.

### 4.2 Leave Type Deactivation

If an organization deactivates a leave type (`isActive = false`), existing approved leaves remain valid on the ledger, but all new applications and calculations fail immediately with `LEAVE_TYPE_INACTIVE_OR_NOT_FOUND`.

---

## 5. Concurrency and Transactional Integrity

### 5.1 Pre-Flight vs In-Transaction Validation

To guarantee zero double-spending and eliminate race conditions under concurrent requests:

1. **Phase 1: Pre-flight preview (`validateLeaveApplication(..., false)`)**:
   - Calculates duration and previews balance availability without locking.
   - Returns structured errors and warnings for immediate frontend UI feedback.
2. **Phase 2: In-transaction revalidation (`validateLeaveApplication(..., true)`)**:
   - Inside `prisma.$transaction(async (tx) => { ... })`:
     - Re-verifies date overlap against `LeaveRequest`, `OfficialVisit`, and `WfhRequest`.
     - Re-verifies balance sufficiency under active transaction isolation.
     - Executes row lock / updates `LeaveBalanceAccount` atomically.
     - Creates the pending reservation transaction (`LeaveBalanceTransaction` with `RESERVATION`).

### 5.2 Concurrent Approval Safeguard

When an approver acts on a leave request:

- The system re-checks for any conflicting _approved_ leave, visit, or WFH schedule inside the approval transaction before transitioning the status to `APPROVED` and converting the reservation to `CONSUMED`.

---

## 6. Structured Error Reference

| Error Code                         | HTTP Status | Description                                                            |
| :--------------------------------- | :---------- | :--------------------------------------------------------------------- |
| `INVALID_DATE_FORMAT`              | 400         | The start or end date could not be parsed.                             |
| `END_DATE_BEFORE_START_DATE`       | 400         | End date is earlier than start date.                                   |
| `CROSS_LEAVE_YEAR_BOUNDARY`        | 400         | Leave crosses annual accounting boundary. Separate requests required.  |
| `LEAVE_TYPE_INACTIVE_OR_NOT_FOUND` | 400         | Leave type is not configured or deactivated.                           |
| `HALF_DAY_NOT_ALLOWED`             | 400         | Leave type policy prohibits half-day leaves.                           |
| `HALF_DAY_MULTI_DAY_PROHIBITED`    | 400         | Half-day leave must be for a single calendar day.                      |
| `NO_ASSIGNED_POLICY`               | 400         | No active policy assignment found for the employee.                    |
| `INSUFFICIENT_NOTICE_PERIOD`       | 400         | Request violated minimum advance notice days.                          |
| `ZERO_CHARGEABLE_DAYS`             | 400         | Selected range contains 0 working days (weekends/holidays only).       |
| `MAX_CONSECUTIVE_DAYS_EXCEEDED`    | 400         | Requested duration exceeds policy maximum consecutive days.            |
| `SUPPORTING_DOCUMENT_REQUIRED`     | 400         | Mandatory attachment missing for leave exceeding threshold days.       |
| `INSUFFICIENT_LEAVE_BALANCE`       | 400         | Requested days exceed available closing balance.                       |
| `NEGATIVE_BALANCE_LIMIT_EXCEEDED`  | 400         | Requested overdraft exceeds policy negative balance limit.             |
| `OVERLAPPING_LEAVE_REQUEST`        | 409         | Conflicting pending or approved leave request exists for the employee. |
| `OVERLAPPING_OFFICIAL_VISIT`       | 409         | Conflicting pending or approved official visit exists.                 |
| `OVERLAPPING_WFH_REQUEST`          | 409         | Conflicting pending or approved work-from-home schedule exists.        |

---

## 7. Verification and Test Coverage

The engine is covered by automated unit and integration tests:

- `apps/api/src/modules/leave/leave-calculator.service.spec.ts` (10 tests)
- `apps/api/src/modules/leave/leave-validation.service.spec.ts` (21 tests)
- `apps/api/src/modules/leave/leave.service.spec.ts` (20 tests)
- Total module test count: **51 passing unit tests**.
- Total API test suite count: **538 passing tests across 25 suites**.
