# Work From Home (WFH) Policy & Operations Guide

## 1. Purpose & Scope

The Work From Home (WFH) policy governs remote work authorization across PeopleOS HRMS organizations. It enables structured, auditable remote work arrangements while maintaining attendance accountability, shift compliance, and employee privacy.

---

## 2. Duration Types & Shift Boundaries

Employees can request remote work under four duration models:

### 2.1 `FULL_DAY`

- **Definition**: The employee works remotely for the entire scheduled shift.
- **Attendance**: Remote check-in authorized within the scheduled shift arrival window; check-out at shift completion.
- **Summary**: Credited as a full working day with `primaryAttendanceMode = WFH`.

### 2.2 `FIRST_HALF`

- **Definition**: The employee works remotely during the first half of the scheduled shift and commutes to the office for the afternoon.
- **Window**: Remote check-in permitted between shift start and shift midpoint (e.g., 09:00 to 13:30 for a 09:00–18:00 shift).
- **Afternoon Transit**: Employee checks out remotely, commutes, and punches into the office for their afternoon session.
- **Reconciliation**: Total working hours across both sessions are aggregated in `AttendanceDailySummary`.

### 2.3 `SECOND_HALF`

- **Definition**: The employee works from the office during morning hours and completes the afternoon shift remotely.
- **Window**: Remote check-in permitted strictly from shift midpoint onwards. Morning check-in must occur at the office.
- **Boundary Protection**: Check-in attempts in `WFH` mode prior to shift midpoint against a `SECOND_HALF` approval are rejected with `400 WFH_HALF_DAY_MISMATCH`.

### 2.4 `CUSTOM_RANGE`

- **Definition**: Consecutive multi-day remote work authorization (e.g., Monday through Wednesday).
- **Validation**: Bounded by normalized UTC date boundaries. Check-in authorized on any included working day.

---

## 3. Privacy-by-Design Remote Attendance

PeopleOS HRMS enforces privacy minimization for remote work:

- **Zero Residential GPS Tracking**: In `WFH` mode, exact employee home GPS coordinates are **never** captured or persisted.
- **Punch Telemetry**: Check-in events record `latitude: 0, longitude: 0, accuracyMeters: null`.
- **Audit Verification**: System verifies punch authenticity through network IP address, browser user-agent signatures, and authenticated session tokens.

---

## 4. Approval Governance & Security

1. **Strict Maker-Checker**:
   - Self-approval is strictly barred. Managers attempting to approve their own remote requests receive `403 SELF_APPROVAL_DISALLOWED`.
2. **Hierarchical Scoping**:
   - Managers may only view and decide requests submitted by direct and indirect reports within their reporting subtree.
   - Cross-team approval attempts return `403 FORBIDDEN_OUTSIDE_SCOPE`.
3. **Overlap Conflict Prevention**:
   - Employees cannot submit overlapping WFH requests, nor hold an active `OfficialVisit` and `WFH` on the same calendar day.
   - Violations are rejected with `409 REQUEST_OVERLAP_CONFLICT`.
4. **Cancellation Rules**:
   - Employees may cancel pending or approved WFH requests before the start date.
   - Once the scheduled date begins, cancellation requires managerial or HR authorization.

---

## 5. HR Leadership Policy Considerations

The following organizational policy levers are exposed for executive HR governance:

| Policy Area                        | Current Implementation               | HR Decision Options                                                                 |
| :--------------------------------- | :----------------------------------- | :---------------------------------------------------------------------------------- |
| **Consecutive Days Cap**           | Unmetered (Manager discretion)       | Recommend capping at 2–3 days per week to maintain team cohesion.                   |
| **Prior Notice Lead Time**         | Real-time / same-day supported       | Configurable minimum notice window (e.g., 24 hours prior) for planned requests.     |
| **Emergency Retroactive Requests** | Requires HR regularization exception | HR can enable manager exception approval for emergency same-day remote days.        |
| **Transit Window Allowance**       | Flexible between half-day sessions   | Allow 60–90 minutes non-deducted travel time between morning and afternoon punches. |
