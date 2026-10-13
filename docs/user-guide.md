# PeopleOS HRMS — End-User & Operational Guide

**Document ID:** `USER-GUIDE-001`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Audience:** Enterprise Employees, Managers, HR Professionals, and System Administrators  
**Access Portal:** Internal Corporate URL (`https://hrms.internal.corp`)  
**Classification:** Internal User Guide

---

## 1. Getting Started

### 1.1 Supported Browsers & Access Requirements

PeopleOS HRMS is an internal, web-based platform. To ensure complete functionality, responsive design, and cryptographic security, use an organization-managed device with an approved modern browser:

- **Google Chrome:** Version 118 or higher (Recommended).
- **Microsoft Edge:** Version 118 or higher.
- **Mozilla Firefox:** Version 120 or higher.
- **Apple Safari:** Version 17 or higher (macOS / iOS).

> **Network Requirement:** You must be connected to the corporate local network (LAN) or authenticated via the corporate VPN. Network Access Control (NAC) automatically verifies device compliance.

### 1.2 Signing In and Signing Out

1. Navigate to the internal application address: `https://hrms.internal.corp`.
2. On the login screen, enter your corporate email address and password.
3. Click **Sign In**. Upon successful authentication, you will be directed to your role-specific dashboard.
4. **Signing Out:** To end your session securely, click on your user avatar in the top-right corner of the application header and select **Sign Out**. Always sign out when leaving a shared workstation.

### 1.3 Recovering Access (Password Reset)

If you have forgotten your password or your account is locked:

1. Click the **Forgot Password?** link on the login page.
2. Enter your registered work email address and submit the request.
3. You will receive an email containing a secure, time-limited password reset link (valid for 30 minutes).
4. Click the link to set a new password that satisfies corporate complexity requirements (minimum 8 characters, containing uppercase, lowercase, numbers, and symbols).
5. If you do not receive the email, contact your IT Service Desk or HR administrator.

---

## 2. Administrator (ADMIN) Guide

The `ADMIN` role is responsible for system governance, organization topology, security audits, and global settings.

### 2.1 Organization & Hierarchy Configuration

- **Access:** Navigate to **Organization** from the main navigation sidebar.
- **Managing Branches:** Add and configure physical office locations, geofences, and standard work hours.
- **Managing Departments & Designations:** Create and maintain corporate departments and job designations that structure the employee directory.

### 2.2 User & Role Management

- **Access:** Navigate to **Roles & Permissions** or **Settings**.
- **Role Assignment:** Assign system roles (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`) to user accounts.
- **Session Revocation:** View active sessions and terminate unauthorized or orphaned sessions if an anomaly is suspected.

### 2.3 System Audit Log Explorer

- **Access:** Navigate to **Audit Logs**.
- **Inspecting Events:** Review chronological records of all privileged actions (e.g., `USER_LOGIN`, `PAYROLL_RUN_LOCKED`, `EMPLOYEE_STATUS_CHANGED`).
- **Filtering:** Filter logs by Date Range, Action Type, Actor User ID, or Entity UUID.

---

## 3. Human Resources (HR) Guide

The `HR` role manages employee lifecycles, attendance exception queues, leave administration, MIS analytics, and the payroll engine.

### 3.1 Employee Lifecycle Management

- **Access:** Navigate to **Employees**.
- **Onboarding an Employee:** Click **Add Employee**. Populate personal details, contact information, branch assignment, department, designation, and reporting manager.
- **Managing Dossiers:** View and update employee employment details, probation periods, emergency contacts, and statutory identifiers.
- **Offboarding an Employee:** Update the employee status to `INACTIVE` with an exit date upon completion of exit clearances.

### 3.2 Attendance & Exception Processing

- **Access:** Navigate to **Attendance** $\rightarrow$ **Exceptions Queue**.
- **Reviewing Anomaly Flags:** Review records flagged with `SHORT_HOURS`, `MISSING_PUNCH`, or `LATE_ARRIVAL`.
- **Resolving Exceptions:** Review employee punch correction requests, adjust hours when justified, and clear flags to prevent unearned Loss of Pay (LOP).

### 3.3 Leave Administration & Policies

- **Access:** Navigate to **Leave** $\rightarrow$ **Admin View**.
- **Policy Configuration:** Maintain annual leave allocations, carry-forward limits, and sandwich rules.
- **Account Ledger Balances:** Inspect employee balance ledgers, process manual adjustments, and view department leave calendars.

### 3.4 Enterprise Payroll Processing

- **Access:** Navigate to **Payroll**.
- **Step 1: Period Creation:** Open the target monthly period (e.g., November 2026).
- **Step 2: Run Calculation:** Click **New Payroll Run**, select the scope (All Employees or Branch), and trigger calculation.
- **Step 3: Review Exceptions:** Inspect the **Exceptions** tab for unassigned structures, negative net pay, or missing bank details.
- **Step 4: Approval & Locking:** Submit the run for review. Once approved, click **Lock Run** to finalize calculations.
- **Step 5: Publish Payslips:** Click **Publish Payslips** to make payslips immediately available in Employee Self-Service.

---

## 4. Manager (MANAGER) Guide

The `MANAGER` role oversees team operations, reviews requests, and tracks direct reports' attendance and performance.

### 4.1 Team Roster & Direct Reports

- **Access:** Navigate to **Team**.
- **Overview:** View all direct and indirect reports, their current status (Present, On Leave, WFH, Official Visit), and contact details.

### 4.2 Reviewing & Approving Requests

- **Access:** Navigate to **Requests** or the **Pending Approvals** widget on your dashboard.
- **Leave Requests:** Review dates, leave type, reason, and team schedule overlap before selecting **Approve** or **Reject**.
- **Work-From-Home (WFH) & Official Visits:** Verify task justifications and travel itineraries before approving outdoor or remote work days.

### 4.3 Performance Appraisals & Goal Setting

- **Access:** Navigate to **Performance** $\rightarrow$ **Manager Reviews**.
- **Conducting Reviews:** When an active review cycle is open, inspect direct reports' self-assessments, provide competency ratings (1–5), and record development action plans.

---

## 5. Employee Self-Service (EMPLOYEE) Guide

All organizational personnel have access to self-service features for their own personal records.

### 5.1 Daily Attendance Tracking

- **Access:** Navigate to **Attendance**.
- **Clocking In/Out:** Click **Check In** upon beginning your workday. The system will record your timestamp and active work mode (Office, WFH, or Official Visit).
- **Viewing History:** Review your daily logs, working hours, and punch timestamps.

### 5.2 Submitting Leave & Remote Work Requests

- **Access:** Navigate to **Leave** or **WFH**.
- **Applying for Leave:** Click **Apply Leave**, select the leave type (e.g., Paid Leave, Sick Leave, Casual Leave), specify start and end dates, provide a brief reason, and submit.
- **Tracking Status:** Monitor whether your request is `PENDING`, `APPROVED`, or `REJECTED` in real time.

### 5.3 Accessing Payslips

- **Access:** Navigate to **Payslips** (under Self-Service).
- **Viewing Details:** Click on any published pay period to inspect earnings, deductions, PF contributions, and net pay.
- **Downloading PDF:** Click **Download PDF** to generate an official digital payslip formatted in Indian Rupees (INR) with masked bank account and PAN details.

### 5.4 Secure Document Vault

- **Access:** Navigate to **Documents**.
- **Uploading Files:** Upload identity documents (PAN card, Aadhaar, degree certificates) in PDF, PNG, or JPEG format (maximum 10 MB).
- **Verification Status:** Track whether HR has marked your documents as `PENDING`, `VERIFIED`, or `REJECTED`.
