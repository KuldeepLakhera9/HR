# Official Visits & Outdoor Duty (OD) Operations Guide

## 1. Overview & Policy Definition

An **Official Visit** (also known as Outdoor Duty or Client Field Work) authorizes an employee to perform work away from their designated office location. Typical use cases include:

- Client architecture and business meetings
- On-site installations, audits, or support visits
- Vendor evaluations and facility inspections
- Roaming sales or inspection activities

---

## 2. Visit Lifecycle & State Transitions

Official Visits follow an explicit, deterministic state machine:

```
[Draft] -> [Submitted] -> [Approved] -> [In Progress] -> [Completed]
               |               |
               v               v
          [Rejected]     [Cancelled] / [Expired]
```

### State Definitions

- **`DRAFT`**: An incomplete or unsaved draft maintained by the employee.
- **`SUBMITTED`**: Submitted by the employee and pending manager/HR review.
- **`APPROVED`**: Formally authorized by a hierarchical manager or HR Admin.
- **`REJECTED`**: Declined by the reviewer with documented feedback.
- **`IN_PROGRESS`**: Automatically transitioned upon the first successful field check-in on or after the scheduled start date.
- **`COMPLETED`**: Concluded upon final check-out or arrival of the end date.
- **`CANCELLED`**: Cancelled before visit commencement or formally voided by HR.
- **`EXPIRED`**: Approved visit whose end date has passed without attendance activity.

---

## 3. Governance Policies

### 3.1 Strict Maker-Checker & Anti-Self-Approval

- **Rule**: No employee or manager may approve their own visit request.
- **Enforcement**: Any approval attempt where `request.employee.userId === approver.userId` is rejected with `403 SELF_APPROVAL_DISALLOWED`.
- **Hierarchical Review**: Managers can only view and decide requests submitted by employees within their recursive reporting subtree (`HierarchyService.isSubordinateOf`).

### 3.2 Material Modification Reapproval Trigger

- If an employee edits **non-material** fields (e.g., general remarks or contact phone numbers) of an `APPROVED` visit, the approval remains intact.
- If an employee updates **material** parameters—specifically the **dates** (`startDate`, `endDate`) or **destinations** (`destinationName`, `latitude`, `longitude`, `radiusMeters`)—the system immediately resets the visit status to `SUBMITTED`, logs an audit entry (`VISIT_REAPPROVAL_TRIGGERED`), and requires manager reapproval. Field check-in is disabled until re-approved.

### 3.3 Commencement Cancellation Policy

- **Prior to Start Date**: Employees may freely cancel pending or approved visits by supplying a cancellation reason.
- **On or After Start Date / During In-Progress**: Self-cancellation by the employee is blocked with `403 VISIT_ALREADY_COMMENCED`. Cancellation of commenced visits requires manager or HR intervention to maintain attendance audit integrity.

### 3.4 Overlapping Visit Prevention

- Employees cannot submit overlapping visit requests for the same working calendar dates. Overlaps are detected and rejected with `409 REQUEST_OVERLAP_CONFLICT`.

---

## 4. Destination Geofencing & Location Verification

### 4.1 Geofenced Destinations

Each visit defines one or more destinations with:

- Target destination name and address
- Target GPS coordinates (`latitude`, `longitude`)
- Allowed geofence radius (default: 200m; configurable up to 1000m)
- `isGeofenceRequired: true`

When the employee performs a check-in in `OFFICIAL_VISIT` mode:

1. Client submits device coordinates and accuracy radius.
2. Server validates GPS freshness ($\le 300$ seconds) and accuracy ($\le 150$ meters).
3. Server calculates Haversine distance to each authorized destination.
4. If within radius of any destination, check-in succeeds.
5. Verification record is logged to `visit_location_verifications`.

### 4.2 Roaming Visits (`isGeofenceRequired: false`)

For roaming field activities (sales visits, continuous site inspections) where coordinates cannot be pinned in advance, HR/Managers can authorize `isGeofenceRequired = false`. In this mode, coordinates are validated for sanity but perimeter boundaries are exempted.

---

## 5. Location Privacy & Evidence Access

To preserve employee privacy and comply with data minimization regulations:

1. **Background Tracking Prohibited**: Coordinates are captured strictly at punch execution (on check-in and check-out). Background location polling is forbidden.
2. **Access Control**:
   - **Employees & Managers**: See perimeter verification outcomes (e.g., "Inside Perimeter", "124m away"), but raw decimal coordinates are redacted (`undefined`).
   - **HR / Admins**: Granted access to raw coordinates in `visit_location_verifications` exclusively for compliance audits and dispute investigations.
3. **Data Retention**: Verification records are retained for 90 days in active storage, then archived in compliance with enterprise retention schedules.
