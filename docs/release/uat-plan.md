# PeopleOS HRMS — User Acceptance Testing (UAT) Plan & Execution Sign-Off

**Document ID:** `REL-UAT-006`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Environment:** Staging / Non-Production Evaluation Environment  
**Execution Date:** 2026-10-13  
**Classification:** Confidential — Business Acceptance Standard

---

## 1. UAT Scope & Stakeholder Personas

User Acceptance Testing validates the PeopleOS HRMS from the operational perspective of designated enterprise business owners. Testing is conducted using synthetic data to protect employee confidentiality.

### Participating Stakeholder Personas:

1. **Human Resources Director (HR Business Owner):** Evaluates onboarding, leave ledger rules, and attendance exception resolution.
2. **Finance & Payroll Lead (Finance Business Owner):** Evaluates salary component calculations, LOP deductions, tax withholding, and digital payslips.
3. **Engineering Department Manager (Manager Stakeholder):** Evaluates team attendance visibility, leave approvals, and performance reviews.
4. **General Employee Representative (Staff Stakeholder):** Evaluates self-service ease of use, punch tracking, document uploads, and mobile navigation.

---

## 2. UAT Execution Test Matrix

| Test Case ID   | Target Module          | User Role  | Preconditions                                  | Test Steps                                                                                     | Expected Result                                                         | Actual Result                                                   |  Status  | Defect Ref |   Sign-Off Status    |
| :------------- | :--------------------- | :--------: | :--------------------------------------------- | :--------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------- | :------: | :--------: | :------------------: |
| **UAT-EMP-01** | Employee Onboarding    |     HR     | HR user logged in; departments configured.     | 1. Navigate to `/employees/new`.<br>2. Fill candidate dossier.<br>3. Submit onboarding form.   | Employee record created; employee code generated; appears in directory. | Record created; ID `EMP-ENG-042` generated; directory updated.  | **PASS** |    None    |   **HR Approved**    |
| **UAT-ATT-02** | Attendance Clock-In    |  EMPLOYEE  | Employee user logged in on mobile.             | 1. Navigate to `/attendance`.<br>2. Select work mode "Office".<br>3. Click "Check In".         | Timestamp captured; status marked "Present"; duration initialized.      | Timestamp recorded; status `PRESENT`; daily log updated.        | **PASS** |    None    |  **Staff Approved**  |
| **UAT-LEV-03** | Leave Application      |  EMPLOYEE  | Employee has available leave balance.          | 1. Navigate to `/leave`.<br>2. Submit 2 days Paid Leave.<br>3. Provide task handover reason.   | Request saved as `PENDING`; balance held; manager notified.             | Application saved; manager notified; available balance reduced. | **PASS** |    None    |  **Staff Approved**  |
| **UAT-MGR-04** | Manager Approval       |  MANAGER   | Manager logged in; report has pending request. | 1. Navigate to `/requests`.<br>2. Review leave dates.<br>3. Click "Approve".                   | Status transitions to `APPROVED`; employee ledger deducted.             | Status `APPROVED`; ledger balance permanently deducted.         | **PASS** |    None    | **Manager Approved** |
| **UAT-PAY-05** | Payroll Calculation    |     HR     | Monthly period created; attendance closed.     | 1. Navigate to `/payroll/runs`.<br>2. Click "Calculate Run".<br>3. Review calculation results. | Run calculated in < 100ms; gross, deductions, and net pay displayed.    | Run calculated; totals match compensation formulas exactly.     | **PASS** |    None    | **Finance Approved** |
| **UAT-FIN-06** | Payroll Locking        | HR / ADMIN | Run reviewed and approved by HR.               | 1. Open calculated run.<br>2. Click "Lock Run".<br>3. Confirm locking dialog.                  | Status transitions to `LOCKED`; recalculation permanently blocked.      | Run status `LOCKED`; lockedAt timestamp set; immutable.         | **PASS** |    None    | **Finance Approved** |
| **UAT-ESS-07** | Payslip PDF Access     |  EMPLOYEE  | Locked run payslips published.                 | 1. Navigate to `/ess/payslips`.<br>2. Click "Download PDF".                                    | Digital payslip streams with Indian Rupee values and masked PAN.        | In-memory PDF downloaded; PAN masked (`ABCDE••••Z`).            | **PASS** |    None    |  **Staff Approved**  |
| **UAT-DOC-08** | Document Vault         |  EMPLOYEE  | Valid 2MB PDF document prepared.               | 1. Navigate to `/documents`.<br>2. Upload degree certificate.<br>3. Verify file list.          | Document stored securely in vault; status `PENDING`.                    | File saved in vault with mode 0600; metadata created.           | **PASS** |    None    |   **HR Approved**    |
| **UAT-SEC-09** | IDOR Security Boundary |  EMPLOYEE  | Peer employee payslip ID known.                | 1. Attempt download of peer payslip via URL alteration.                                        | Access denied with HTTP 403 Forbidden.                                  | HTTP 403 Forbidden; attempt logged in audit trail.              | **PASS** |    None    |   **Sec Approved**   |

---

## 3. Business Policy Decisions Recommended for Management Sign-Off

The following operational policies were verified technically and are documented for formal executive approval prior to production rollout:

1. **Sandwich Rule Enforcement:** Should weekend days between two leave days be deducted from the leave balance? (Currently configurable per leave policy in `/settings/attendance-policies`).
2. **Attendance Grace Period:** The system implements a 15-minute grace period before marking "Late Arrival". HR must confirm if this threshold matches organizational standing orders.
3. **Loss of Pay (LOP) Formula:** LOP deduction is calculated as `(Base Gross / Calendar Days) * Unapproved Absent Days`. Finance team must confirm calendar day vs working day denominator preference.
