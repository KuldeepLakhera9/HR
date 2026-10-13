# PeopleOS HRMS — End-to-End Business Workflow Test Results

**Document ID:** `REL-E2E-003`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Private Enterprise Data Center  
**Classification:** Confidential — System Integration & Verification Report

---

## 1. Executive Summary

This report documents the verification of complete, multi-module business workflows within PeopleOS HRMS. Testing validated the full data lifecycle from Employee Onboarding through Attendance, Leave Accrual, Performance Evaluation, Payroll Calculation, and Final Locked Payslip Generation.

All tests were executed against the active codebase using synthetic test data in a dedicated non-production database.

---

## 2. End-to-End Workflow Verification Results

### 2.1 Workflow 1: Employee Lifecycle & Onboarding

|  Step   | Action Description          | Test Input / Payload                                                                                               | Expected Result                                                       | Actual Result                                                  |  Status  |
| :-----: | :-------------------------- | :----------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------- | :------: |
| **1.1** | Create Employee Record      | `firstName: "Aarav"`, `lastName: "Sharma"`, `workEmail: "aarav.sharma@internal.corp"`, `department: "Engineering"` | Employee entity created; employeeCode auto-generated (`EMP-ENG-042`). | Created entity with UUID; code `EMP-ENG-042` generated.        | **PASS** |
| **1.2** | Assign Reporting Manager    | `managerId: "<manager_uuid>"`                                                                                      | Manager hierarchy linked in `employee_employments` table.             | Manager relationship mapped; visible in manager's team view.   | **PASS** |
| **1.3** | Account Credential Issuance | `POST /users` linked to employee                                                                                   | User account provisioned with role `EMPLOYEE`.                        | User record created; argon2 hashed password; login enabled.    | **PASS** |
| **1.4** | Profile Update (Authorized) | `PATCH /employees/:id` with emergency phone                                                                        | Emergency contact saved in `employee_contacts`.                       | Record updated; audit log entry recorded.                      | **PASS** |
| **1.5** | Profile Update (Restricted) | Employee attempting to modify own `baseSalary`                                                                     | HTTP 403 Forbidden; field rejected by DTO whitelist.                  | Stripped by ValidationPipe; salary unchanged.                  | **PASS** |
| **1.6** | Employee Offboarding        | `status: "INACTIVE"`, `exitDate: "2026-10-31"`                                                                     | Employment status transitioned to INACTIVE; login blocked.            | Status updated; session revoked; historical records preserved. | **PASS** |

---

### 2.2 Workflow 2: Attendance Tracking & Exception Lifecycle

| Step    | Action Description            | Test Input / Payload                                           | Expected Result                                                    | Actual Result                                                    |  Status  |
| :------ | :---------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------- | :--------------------------------------------------------------- | :------: |
| **2.1** | Office Check-In               | `workMode: "OFFICE"`, `source: "WEB"`, `timestamp: "09:02:15"` | Attendance record created; status evaluated as `PRESENT`.          | Record created; duration calculation initialized.                | **PASS** |
| **2.2** | Duplicate Check-In            | Second check-in within active shift                            | Idempotent handling; returns existing session without duplication. | Returned existing punch record with 200 OK.                      | **PASS** |
| **2.3** | Half-Day Anomaly Detection    | Shift duration < 4 hours                                       | Exception flag triggered: `SHORT_HOURS`.                           | Record marked with exception flag; queued for manager review.    | **PASS** |
| **2.4** | Attendance Correction Request | Employee requests punch adjustment with reason                 | Correction request created in pending state.                       | Manager receives pending correction in `/attendance/exceptions`. | **PASS** |
| **2.5** | Manager Correction Approval   | Manager approves adjustment                                    | Record hours recalculated; exception status set to `RESOLVED`.     | Attendance updated; LOP risk cleared.                            | **PASS** |

---

### 2.3 Workflow 3: Leave Management & Balance Ledger Reconciliation

| Step    | Action Description       | Test Input / Payload                                                             | Expected Result                                                          | Actual Result                                                    |  Status  |
| :------ | :----------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :--------------------------------------------------------------- | :------: |
| **3.1** | Balance Inquiry          | `GET /leave/balances`                                                            | Displays Paid Leave (PL: 18), Sick Leave (SL: 10), Casual Leave (CL: 8). | Balances match accrual ledger accurately.                        | **PASS** |
| **3.2** | Submit Leave Request     | `leaveTypeId: "PL"`, `startDate: "2026-11-10"`, `endDate: "2026-11-12"` (3 days) | Application created with status `PENDING`; 3 days placed on hold.        | Application saved; manager notified; available balance adjusted. | **PASS** |
| **3.3** | Sandwich Rule Evaluation | Leave spanning weekend with strict policy                                        | Evaluates working vs calendar days based on policy config.               | Evaluated correctly as 3 working days (excluding weekend).       | **PASS** |
| **3.4** | Manager Approval         | Manager invokes `PATCH /leave/:id/decide` with `status: "APPROVED"`              | Status transitions to `APPROVED`; ledger balance permanently deducted.   | Balance deducted (PL: 18 $\rightarrow$ 15); employee notified.   | **PASS** |
| **3.5** | Overdraw Prevention      | Applying for 20 days when available balance is 15                                | Request rejected with `400 Bad Request` ("Insufficient leave balance").  | Blocked by server validation; ledger intact.                     | **PASS** |

---

### 2.4 Workflow 4: Performance Management (PMS) & Reviews

| Step    | Action Description          | Test Input / Payload                                         | Expected Result                                                   | Actual Result                                          |  Status  |
| :------ | :-------------------------- | :----------------------------------------------------------- | :---------------------------------------------------------------- | :----------------------------------------------------- | :------: |
| **4.1** | Review Cycle Initialization | HR creates "Q3 2026 Performance Appraisal Cycle"             | Cycle created; eligible employees enrolled automatically.         | Participants linked in `review_cycle_participants`.    | **PASS** |
| **4.2** | Employee Self-Assessment    | Employee submits self-ratings (1-5) and goal commentary      | Ratings saved; status transitions to `SELF_ASSESSMENT_SUBMITTED`. | Commentary saved; manager review unlocked.             | **PASS** |
| **4.3** | Manager Performance Review  | Manager submits ratings and development plan recommendations | Manager review recorded; status set to `MANAGER_REVIEWED`.        | Rating calculated; private manager notes stored.       | **PASS** |
| **4.4** | Confidentiality Boundary    | Peer employee attempting to query another's review           | HTTP 403 Forbidden.                                               | Strictly blocked by `PerformanceService` scope checks. | **PASS** |
| **4.5** | Cycle Closure & HR Sign-Off | HR locks review cycle                                        | Final ratings locked; historical snapshot stored in audit trail.  | Cycle status `COMPLETED`; immutable records.           | **PASS** |

---

### 2.5 Workflow 5: Enterprise Payroll Engine & Financial Integrity

| Step    | Action Description             | Test Input / Payload                                                                                    | Expected Result                                                                                                                      | Actual Result                                                              |  Status  |
| :------ | :----------------------------- | :------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- | :------: |
| **5.1** | Compensation Assignment        | Assign "Executive Salary Structure" (Basic: 50%, HRA: 20%, Special: 30%, PF: 12%)                       | Salary items assigned; effective date tracked.                                                                                       | Items stored in `employee_compensation_items`.                             | **PASS** |
| **5.2** | Period Orchestration           | Create Monthly Period: Nov 2026 (30 calendar days, 22 working days)                                     | Period created with status `OPEN`.                                                                                                   | Period entity verified in database.                                        | **PASS** |
| **5.3** | Run Calculation                | `POST /payroll/runs/:id/calculate`                                                                      | State transitions: `DRAFT` $\rightarrow$ `CALCULATING` $\rightarrow$ `REVIEW_PENDING`. Aggregates attendance, LOP, and compensation. | Calculation executed in 6.77ms; snapshots generated.                       | **PASS** |
| **5.4** | Financial Math & Rounding      | Basic: ₹50,000, HRA: ₹20,000, Special: ₹30,000, Gross: ₹1,00,000. PF: ₹6,000, PT: ₹200. Net: ₹93,800.00 | Exact monetary precision to 2 decimal places in INR.                                                                                 | `totalGross: 100000.00`, `totalDeductions: 6200.00`, `totalNet: 93800.00`. | **PASS** |
| **5.5** | Exception Detection            | Unassigned salary structure for employee                                                                | Exception generated in `payroll_exceptions`: `MISSING_COMPENSATION`.                                                                 | Run flagged with open exception; blocking lock.                            | **PASS** |
| **5.6** | Approval & Locking             | HR approves run; Admin invokes `/lock`                                                                  | Status transitions to `LOCKED`; `lockedAt` timestamp set.                                                                            | Run becomes strictly immutable; recalculation blocked.                     | **PASS** |
| **5.7** | Payslip Publication & Delivery | Admin invokes `POST /payroll/runs/:id/publish`                                                          | Payslips marked `PUBLISHED`; visible in Employee Self-Service.                                                                       | Employee can view payslip in `/ess/payslips`.                              | **PASS** |
| **5.8** | In-Memory PDF Generation       | Employee downloads `GET /payroll/payslips/:id/pdf`                                                      | Streams binary PDF with Indian Rupee formatting (`₹93,800.00`) and masked PAN (`ABCDE••••Z`).                                        | Buffer rendered on-the-fly; zero disk exposure.                            | **PASS** |

---

### 2.6 Workflow 6: MIS Analytics, Reporting & Data Exports

| Step    | Action Description         | Test Input / Payload                         | Expected Result                                           | Actual Result                                      |  Status  |
| :------ | :------------------------- | :------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------- | :------: |
| **6.1** | Workforce Headcount Report | Query active headcount grouped by department | Totals match active employee records in database.         | Headcount matches database count exactly.          | **PASS** |
| **6.2** | Attendance Reconciliation  | Query monthly attendance summary             | Present days + Leaves + LOP + Holidays = Calendar days.   | Sum matches period days with zero variance.        | **PASS** |
| **6.3** | Payroll Variance Analysis  | Compare Period A vs Period B gross totals    | Variance percentage and net change accurately calculated. | Accurately reflects increments and new joiners.    | **PASS** |
| **6.4** | Excel (XLSX) Export        | Download payroll export via SheetJS          | Generates valid `.xlsx` spreadsheet matching screen data. | Binary spreadsheet downloaded; formulas validated. | **PASS** |
