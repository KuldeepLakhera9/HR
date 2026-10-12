# Phase 10: Enterprise Metric Dictionary & Data Definitions

**PeopleOS Self-Hosted Enterprise HRMS**  
_Document Version: 1.0.0 — Authoritative Institutional Specification_

---

## 1. Architectural Principles & Standards

1. **Server-Authoritative Aggregations**:
   - All metric calculations, percentages, ratios, and averages must be computed deterministically on the backend.
   - Dashboards, tables, CSV exports, and drill-downs must consume the exact same pre-aggregated payload or calculation engine. Frontend clients must never perform independent statistical derivation.
2. **Consistent Denominators & Period Alignment**:
   - Snapshot metrics (e.g. Current Active Headcount) must never be blended into historical flow metrics (e.g. Monthly Attrition Rate) without explicit period normalization.
   - Zero denominators must safely return `0.0` or `null` (with explicit `isCalculable: false` indicator) rather than dividing by zero or producing `NaN`/`Infinity`.
3. **Timezone & Date Normalization**:
   - All period boundaries are normalized to the Organization's configured timezone (`organization.timezone`, defaulting to `Asia/Kolkata` / `+05:30`).
   - Daily records are evaluated at UTC midnight boundary corresponding to the local calendar day.
4. **Precision and Rounding**:
   - Monetary balances and days: `Decimal(5, 2)` / rounded to 2 decimal places.
   - Rates and percentages: standard double precision rounded to 1 decimal place (e.g. `94.6%`) or 2 decimal places for attrition.
   - Working hours and turnaround times: rounded to 1 decimal place (e.g. `8.4` hours).
5. **Data Privacy & Small-Cell Suppression**:
   - Any demographic or rating breakdown resulting in a cohort of fewer than **5 employees** ($k < 5$) must be masked or combined into an aggregate grouping to prevent individual de-anonymization.

---

## 2. Workforce & Headcount Metrics

### M-WF-01: Active Headcount

- **Business Purpose**: Core baseline metric representing the total productive workforce employed by the organization as of a specific target date.
- **Formula**:
  $$\text{Active Headcount}(T) = \sum [e \in \text{Employees} \mid \text{isActive} = \text{true} \land \text{joiningDate} \le T \land (\text{exitDate} \text{ is null} \lor \text{exitDate} > T) \land \text{status} \in \{\text{ACTIVE}, \text{PROBATION}, \text{ON\_NOTICE}\}]$$
- **Source Model & Service**:
  - Model: `Employee`, `EmployeeEmployment`.
  - Service: `WorkforceAnalyticsService` / `EmployeesService`.
- **Time Period & Timezone**: Point-in-time snapshot as of end-of-day $T$ in Organization timezone.
- **Numerator / Denominator**: Count of matching active employee records. Denominator: N/A.
- **Cancelled / Pending / Incomplete Treatment**:
  - `status: PROBATION` $\to$ **Included** (active employees serving probationary period).
  - `status: ON_NOTICE` $\to$ **Included** (active employees serving exit notice period).
  - `status: RESIGNED` $\to$ **Excluded** if `exitDate` has passed or marked inactive; **Included** if still serving notice (`status: ON_NOTICE`).
  - `status: TERMINATED` / `EXITED` $\to$ **Excluded**.
  - Soft-deleted (`deletedAt is not null`) $\to$ **Excluded**.
- **Permission Scope**:
  - `ADMIN`, `HR`: Organization-wide, cross-department, cross-branch.
  - `MANAGER`: Scoped strictly to reporting hierarchy (`HierarchyService.getSubordinates`).
  - `EMPLOYEE`: Denied.
- **Data-Quality Limitations**:
  - Reconstructing historical headcount prior to the creation of the database relies on the integrity of `joiningDate` and `exitDate`. Employees whose exit dates were not captured historically will appear as active in retrospective queries.
- **Deterministic Test Fixture**:
  - _Given_: 10 employees in DB.
    - 6 with `status: ACTIVE`, `joiningDate: 2026-01-01`, `exitDate: null`.
    - 2 with `status: PROBATION`, `joiningDate: 2026-06-01`, `exitDate: null`.
    - 1 with `status: ON_NOTICE`, `joiningDate: 2026-01-01`, `exitDate: 2026-11-30`.
    - 1 with `status: EXITED`, `joiningDate: 2025-01-01`, `exitDate: 2026-05-01`.
  - _Query Date_: `2026-10-12`.
  - _Expected Result_: Active Headcount = **9**.

---

### M-WF-02: Period Joiners (New Hires)

- **Business Purpose**: Measures recruitment velocity and workforce expansion during a defined window.
- **Formula**:
  $$\text{Period Joiners}(T_1, T_2) = \sum [e \in \text{Employees} \mid e.\text{joiningDate} \ge T_1 \land e.\text{joiningDate} \le T_2 \land e.\text{deletedAt is null}]$$
- **Source Model & Service**: `Employee`, `EmployeeHistory` (`eventType: JOINED`).
- **Time Period & Timezone**: Bounded date range $[T_1, T_2]$ in Organization timezone.
- **Treatment of Re-hires**: Counted as a new joiner for the period if `joiningDate` represents the new engagement contract.
- **Permission Scope**: `ADMIN`, `HR` (Org-wide); `MANAGER` (Team-scoped).
- **Deterministic Test Fixture**:
  - _Given_: 3 employees joining on `2026-09-15`, `2026-10-01`, `2026-10-15`.
  - _Period_: `2026-10-01` to `2026-10-31`.
  - _Expected Result_: Period Joiners = **2**.

---

### M-WF-03: Period Exits & Annualized Attrition Rate

- **Business Purpose**: Monitors employee turnover and retention health across departments and branches.
- **Formula**:
  $$\text{Period Exits}(T_1, T_2) = \sum [e \in \text{Employees} \mid e.\text{exitDate} \ge T_1 \land e.\text{exitDate} \le T_2 \land e.\text{status} \in \{\text{RESIGNED}, \text{TERMINATED}, \text{EXITED}\}]$$
  $$\text{Average Headcount} = \frac{\text{Active Headcount}(T_1) + \text{Active Headcount}(T_2)}{2}$$
  $$ \text{Annualized Attrition Rate} = \begin{cases}
  0.0\% & \text{if } \text{Average Headcount} = 0 \lor \text{Days} = 0 \\
  \left(\frac{\text{Period Exits}}{\text{Average Headcount}}\right) \times \left(\frac{365.25}{\text{Days}}\right) \times 100\% & \text{otherwise}
  \end{cases}$$
  $$
- **Numerator / Denominator**:
  - Numerator: Period Exits.
  - Denominator: Average active headcount over the window.
- **Time Period & Timezone**: Configurable date range ($Days = T_2 - T_1 + 1$).
- **Involuntary vs. Voluntary Attrition**:
  - **[HR REVIEW REQUIRED]**: Currently `status: TERMINATED` and `status: RESIGNED` are combined in gross attrition. If policy requires separating voluntary from involuntary turnover, `exitReason` / metadata classification must be approved.
- **Permission Scope**: `ADMIN`, `HR` (Org-wide); `MANAGER` (Team-scoped, where team size $\ge 5$).
- **Deterministic Test Fixture**:
  - _Given_:
    - Active Headcount at $T_1$ (`2026-01-01`): 100.
    - Active Headcount at $T_2$ (`2026-06-30`, 181 days): 104.
    - Exits in period: 4.
  - _Average Headcount_: $(100 + 104) / 2 = 102$.
  - _Calculation_: $(4 / 102) \times (365.25 / 181) \times 100\% = 0.039215 \times 2.01795 \times 100\% = 7.91\%$.
  - _Expected Result_: Annualized Attrition Rate = **7.91%**.

---

## 3. Attendance & Punctuality Metrics

### M-ATT-01: Attendance Rate

- **Business Purpose**: Core operational efficiency metric evaluating the percentage of scheduled workforce capacity actually present at work.
- **Formula**:
  $$\text{Attendance Rate} = \frac{\text{Present Equivalent Days}}{\text{Expected Working Days}} \times 100\%$$
  Where:
  $$\text{Present Equivalent Days} = \text{Count}(\text{PRESENT}) + 0.5 \times \text{Count}(\text{HALF\_DAY})$$
  $$\text{Expected Working Days} = \text{Total Evaluated Summaries} - (\text{Count}(\text{HOLIDAY}) + \text{Count}(\text{WEEK\_OFF}) + \text{Count}(\text{WEEKEND\_OFF}) + \text{Count}(\text{ON\_LEAVE}))$$
- **Source Model & Service**: `AttendanceDailySummary`, `AttendanceReportingService`.
- **Time Period & Timezone**: Daily, Weekly, or Monthly range $[T_1, T_2]$ based on UTC midnight normalized working days.
- **Treatment of Special Conditions**:
  - `ON_LEAVE` $\to$ **Deducted from Expected Working Days** (approved planned absence does not penalize attendance rate).
  - `HOLIDAY` and `WEEK_OFF` $\to$ **Deducted from Expected Working Days**.
  - `WFH` / `Official Visit` $\to$ Counted as **PRESENT** (provided status is marked `PRESENT` with mode `REMOTE` or `FIELD`).
  - `INCOMPLETE` / `PENDING_REVIEW` $\to$ Evaluated as **0.0** until reconciled or approved via attendance correction.
  - `ABSENT` $\to$ Counted as 0.0 against Expected Working Days.
- **Permission Scope**: `ADMIN`, `HR` (Org-wide); `MANAGER` (Direct & Indirect reports); `EMPLOYEE` (Personal only).
- **Deterministic Test Fixture**:
  - _Given_: 1 employee over 30 calendar days:
    - 20 days `PRESENT`
    - 2 days `HALF_DAY`
    - 1 day `ABSENT`
    - 2 days `ON_LEAVE`
    - 5 days `WEEK_OFF`
  - _Expected Working Days_: $30 - (5 + 2) = 23$ days.
  - _Present Equivalent Days_: $20 + (2 \times 0.5) = 21$ days.
  - _Calculation_: $(21 / 23) \times 100\% = 91.304\%$.
  - _Expected Result_: Attendance Rate = **91.3%**.

---

### M-ATT-02: On-Time Arrival Rate & Punctuality Compliance

- **Business Purpose**: Measures workforce adherence to scheduled shift start times and grace allowances.
- **Formula**:
  $$\text{On-Time Arrival Rate} = \frac{\sum [s \in \text{Summaries} \mid s.\text{firstCheckIn} \text{ is not null} \land s.\text{lateMinutes} = 0]}{\sum [s \in \text{Summaries} \mid s.\text{firstCheckIn} \text{ is not null}]} \times 100\%$$
- **Source Model**: `AttendanceDailySummary` (`lateMinutes`, `firstCheckIn`).
- **Grace Period Logic**: Pre-calculated by Phase 4 attendance engine using `policy.gracePeriodMinutes`. If first punch is within shift start + grace window, `lateMinutes` is recorded as `0`.
- **Treatment of Non-Working Days**: Days with no check-in, holidays, and leaves are excluded from both numerator and denominator.
- **Permission Scope**: `ADMIN`, `HR`, `MANAGER`.
- **Deterministic Test Fixture**:
  - _Given_: 100 punch-ins recorded:
    - 88 check-ins with `lateMinutes = 0`
    - 12 check-ins with `lateMinutes > 0`
  - _Expected Result_: On-Time Arrival Rate = **88.0%**.

---

### M-ATT-03: Remote / Field Duty Utilization Ratio

- **Business Purpose**: Tracks organizational distribution between office presence, telecommuting (WFH), and outdoor client visits.
- **Formula**:
  $$\text{WFH Ratio} = \frac{\text{Count}(s \in \text{Summaries} \mid s.\text{status} = \text{PRESENT} \land s.\text{primaryAttendanceMode} = \text{REMOTE})}{\text{Count}(s \in \text{Summaries} \mid s.\text{status} = \text{PRESENT})} \times 100\%$$
  $$\text{Field Duty Ratio} = \frac{\text{Count}(s \in \text{Summaries} \mid s.\text{status} = \text{PRESENT} \land s.\text{primaryAttendanceMode} = \text{FIELD})}{\text{Count}(s \in \text{Summaries} \mid s.\text{status} = \text{PRESENT})} \times 100\%$$
- **Source Model**: `AttendanceDailySummary.primaryAttendanceMode`, linked to approved `WfhRequest` or `OfficialVisit`.
- **Deterministic Test Fixture**:
  - _Given_: 200 present workdays: 140 `OFFICE`, 40 `REMOTE`, 20 `FIELD`.
  - _Expected Result_: WFH Ratio = **20.0%**, Field Duty Ratio = **10.0%**, Office Ratio = **70.0%**.

---

## 4. Leave & Absence Metrics

### M-LV-01: Approved Leave Utilization

- **Business Purpose**: Evaluates consumption of accrued/allocated leave benefits and predicts year-end encashment or carry-forward liability.
- **Formula**:
  $$\text{Leave Utilization Rate} = \frac{\sum \text{chargeableDays} \text{ from } \text{LeaveRequests}(\text{status} = \text{APPROVED})}{\sum \text{allocatedBalance} \text{ from } \text{LeaveBalanceAccounts}(\text{leaveYear} = Y)} \times 100\%$$
- **Source Model & Service**: `LeaveRequest`, `LeaveBalanceAccount`, `LeaveService`.
- **Calendar vs. Working vs. Chargeable Days**:
  - $\text{Calendar Days} = \text{endDate} - \text{startDate} + 1$.
  - $\text{Chargeable Days}$: Authoritative days deducted from employee quota, excluding non-chargeable holidays and weekends unless policy mandates sandwich rule (`countHolidaysAsLeave = true`).
  - _Standard Rule_: **Metric uses `chargeableDays` strictly.**
- **Treatment of Requests**:
  - `APPROVED` $\to$ **Counted**.
  - `SUBMITTED` / `PENDING` $\to$ Tracked separately as _Pending Liability_; **Excluded from Utilization**.
  - `CANCELLED` / `REJECTED` $\to$ **Excluded**.
  - `HALF_DAY` $\to$ Recorded as $0.5$ chargeable days.
- **Permission Scope**: `ADMIN`, `HR`, `MANAGER`.
- **Deterministic Test Fixture**:
  - _Given_: Employee allocated 18 days for leave year 2026.
    - Approved Request 1: 3.0 days CL.
    - Approved Request 2: 1.5 days SL.
    - Pending Request 3: 2.0 days PL.
  - _Chargeable Consumed_: $3.0 + 1.5 = 4.5$ days.
  - _Utilization_: $(4.5 / 18.0) \times 100\% = 25.0\%$.
  - _Expected Result_: Leave Utilization Rate = **25.0%**.

---

### M-LV-02: Unplanned Absence Rate

- **Business Purpose**: Flags operational disruption caused by unscheduled absenteeism (unplanned sick leaves + unauthorized absences).
- **Formula**:
  $$\text{Unplanned Absence Rate} = \frac{\text{Unauthorized Absent Days} + \text{Emergency Sick Days}}{\text{Total Scheduled Work Days}} \times 100\%$$
- **Treatment**:
  - _Unauthorized Absent Days_: `AttendanceDailySummary.status == ABSENT` with no linked approved leave.
  - _Emergency Sick Days_: Approved Sick Leave submitted on or after the start date ($noticeDays = 0$).
- **Permission Scope**: `ADMIN`, `HR`, `MANAGER`.

---

## 5. Workflow & Approval Turnaround Metrics

### M-WF-01: Average Approval Turnaround Time (TAT)

- **Business Purpose**: Measures managerial responsiveness and identifies bottlenecks across HR operational workflows.
- **Formula**:
  $$\text{Approval TAT} = \frac{\sum_{i=1}^{N} (\text{decidedAt}_i - \text{createdAt}_i)}{N} \quad (\text{expressed in decimal hours})$$
  Where $N$ is the total number of requests decided within the period.
- **Source Models**:
  - Leave: `LeaveApproval.decidedAt` vs. `LeaveRequest.createdAt`.
  - WFH: `WfhApproval.decidedAt` vs. `WfhRequest.createdAt`.
  - Official Visit: `VisitApproval.decidedAt` vs. `OfficialVisit.createdAt`.
- **Numerator / Denominator**:
  - Numerator: Sum of elapsed hours between creation and formal decision.
  - Denominator: Total decided requests (`APPROVED` + `REJECTED`).
- **Treatment of Request States**:
  - `PENDING` / `SUBMITTED` $\to$ **Excluded from TAT**; tracked in Aging Buckets.
  - `CANCELLED` (withdrawn by employee prior to decision) $\to$ **Excluded**.
  - Multi-stage approvals $\to$ Evaluated per stage as well as total end-to-end resolution.
- **Permission Scope**: `ADMIN`, `HR`, `MANAGER`.
- **Deterministic Test Fixture**:
  - _Given_: 3 leave decisions in period:
    - Request A: submitted at `10:00`, approved at `14:00` (4.0 hrs).
    - Request B: submitted at `09:00`, approved at `21:00` (12.0 hrs).
    - Request C: submitted at `12:00`, rejected next day at `12:00` (24.0 hrs).
  - _Sum Hours_: $4.0 + 12.0 + 24.0 = 40.0$ hrs.
  - _Average TAT_: $40.0 / 3 = 13.33$ hrs.
  - _Expected Result_: Average Approval TAT = **13.3 hrs**.

---

### M-WF-02: Pending Queue Aging & SLA Breach Ratio

- **Business Purpose**: Prevents requests from stalling in manager inboxes; monitors operational SLA compliance ($< 48$ hours target).
- **Aging Buckets**:
  - **Bucket 1**: $< 24$ hours ($\text{Age} < 24\text{h}$) — _Normal_.
  - **Bucket 2**: $24\text{--}48$ hours ($24\text{h} \le \text{Age} < 48\text{h}$) — _Approaching SLA_.
  - **Bucket 3**: $48\text{--}72$ hours ($48\text{h} \le \text{Age} < 72\text{h}$) — _SLA Breached_.
  - **Bucket 4**: $> 72$ hours ($\text{Age} \ge 72\text{h}$) — _Critical Escalation_.
- **Formula for SLA Breach Ratio**:
  $$\text{SLA Breach Ratio} = \frac{\text{Count}(\text{Open Requests with Age} \ge 48\text{h})}{\text{Total Open Requests}} \times 100\%$$
- **Source Models**: `LeaveRequest`, `WfhRequest`, `OfficialVisit` where `status == SUBMITTED / PENDING`.

---

## 6. Performance Management Metrics

### M-PM-01: Review Cycle Completion Rate

- **Business Purpose**: Tracks organizational compliance during active performance review cycles.
- **Formula**:
  $$\text{Cycle Completion Rate} = \frac{\sum [r \in \text{PerformanceReviews} \mid r.\text{cycleId} = C \land r.\text{status} = \text{FINALIZED}]}{\sum [p \in \text{ReviewCycleParticipants} \mid p.\text{cycleId} = C \land p.\text{status} \ne \text{EXEMPTED}]} \times 100\%$$
- **Source Model**: `ReviewCycleParticipant`, `PerformanceReview`.
- **Treatment of Exempted / Withdrawn Participants**:
  - `status: EXEMPTED` (e.g. employee on medical sabbatical or joining after cutoff) $\to$ **Deducted from Denominator**.
  - `status: WITHDRAWN` $\to$ **Deducted from Denominator**.
  - `status: REOPENED` $\to$ Counted as incomplete until re-finalized.
- **Permission Scope**: `ADMIN`, `HR`, `MANAGER` (team scope).
- **Deterministic Test Fixture**:
  - _Given_: Review Cycle $C$ with 50 enrolled employees:
    - 40 reviews `FINALIZED`.
    - 5 reviews `MANAGER_REVIEW_SUBMITTED`.
    - 3 reviews `SELF_ASSESSMENT_SUBMITTED`.
    - 2 participants `EXEMPTED`.
  - _Denominator_: $50 - 2 = 48$ eligible participants.
  - _Numerator_: 40 finalized reviews.
  - _Calculation_: $(40 / 48) \times 100\% = 83.33\%$.
  - _Expected Result_: Cycle Completion Rate = **83.3%**.

---

### M-PM-02: Overdue Appraisal Ratio

- **Business Purpose**: Highlights pending appraisals requiring HR escalation or manager deadline nudges.
- **Formula**:
  $$\text{Overdue Appraisals} = \sum [p \in \text{Participants} \mid p.\text{status} = \text{ENROLLED} \land \text{ReviewStatus} \ne \text{FINALIZED} \land \text{CycleDeadline} < \text{Now}]$$
- **Deterministic Test Fixture**:
  - _Given_: 48 active participants; cycle deadline was yesterday. 40 are finalized, 8 are pending.
  - _Expected Result_: Overdue Appraisals = **8**.

---

### M-PM-03: Rating Distribution Breakdown

- **Business Purpose**: Calibrates performance assessment objectivity against standard organizational distribution guidelines.
- **Formula**:
  $$\text{Rating Tier \%} = \frac{\text{Count}(\text{Finalized Reviews with Score in Tier } [S_{min}, S_{max}])}{\text{Total Finalized Reviews in Cycle}} \times 100\%$$
  - Tier 1: $1.00 - 1.99$ (Needs Improvement)
  - Tier 2: $2.00 - 2.99$ (Developing)
  - Tier 3: $3.00 - 3.74$ (Meets Expectations)
  - Tier 4: $3.75 - 4.49$ (Exceeds Expectations)
  - Tier 5: $4.50 - 5.00$ (Outstanding)
- **Small-Cell Suppression ($k < 5$)**:
  - If any rating tier contains fewer than 5 employees in a department view, the tier count is suppressed or merged to protect appraisal confidentiality.
- **Provisional vs. Final Scores**:
  - **Rule**: Draft scores (`SELF_ASSESSMENT_DRAFT`, `MANAGER_REVIEW_DRAFT`) are strictly excluded. Only `FINALIZED` scores are reported in official analytics.

---

## 7. Unresolved Definitions Marked for HR Review

The following 3 items have operational nuances requiring formal organization sign-off:

1. **[HR REVIEW REQUIRED] Voluntary vs. Involuntary Turnover Classification**:
   - _Current State_: The system treats `RESIGNED`, `TERMINATED`, and `EXITED` as general exits.
   - _Recommendation_: Introduce an `exitSubcategory` (`VOLUNTARY_RESIGNATION`, `INVOLUNTARY_TERMINATION`, `RETIREMENT`, `MUTUAL_SEPARATION`) to report both gross and regret attrition rates.
2. **[HR REVIEW REQUIRED] Working-Hour Rounding for Partial Attendance**:
   - _Current State_: `HALF_DAY` is weighted as $0.5$ in attendance rates regardless of whether the employee worked 3.5 or 4.5 hours.
   - _Recommendation_: Maintain $0.5$ day equivalency for payroll and attendance rate calculation, while reporting actual minutes separately in daily average working hours.
3. **[HR REVIEW REQUIRED] Sandwich Rule Leave Count in Analytics**:
   - _Current State_: Leave analytics uses `chargeableDays`.
   - _Recommendation_: Confirm that leave utilization KPIs must track `chargeableDays` rather than `calendarDays`, so employee entitlement balances correspond exactly to the ledger.

---

## 8. Metric Verification Test Matrix

| Metric ID  | Test Suite        | Boundary Case Tested                                       | Target Value                     |
| :--------- | :---------------- | :--------------------------------------------------------- | :------------------------------- |
| `M-WF-01`  | `metrics.spec.ts` | Active status with future exit date vs. past exit date     | Include future, exclude past     |
| `M-WF-03`  | `metrics.spec.ts` | Zero headcount period (denominator safety)                 | Return `0.0%` without `NaN`      |
| `M-ATT-01` | `metrics.spec.ts` | Month with mixed holidays, leaves, half-days, and absences | Accurate working day denominator |
| `M-ATT-02` | `metrics.spec.ts` | Check-in exactly at shift start + grace allowance          | `lateMinutes = 0` (On-time)      |
| `M-LV-01`  | `metrics.spec.ts` | Chargeable days vs. pending approval requests              | Exclude pending from utilization |
| `M-WF-01`  | `metrics.spec.ts` | Decisions spanning midnight / multi-day approvals          | Exact decimal hour TAT           |
| `M-WF-02`  | `metrics.spec.ts` | Requests aging across 24h, 48h, 72h boundaries             | Strict bucket partitioning       |
| `M-PM-01`  | `metrics.spec.ts` | Excluded & exempted participants in cycle completion       | Deducted from denominator        |
| `M-PM-03`  | `metrics.spec.ts` | Small-cell group ($< 5$ employees) privacy suppression     | Masked cell flag enabled         |
