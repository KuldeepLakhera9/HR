# Attendance Policies & Shift Evaluation Rules

## 1. Policy Framework Overview

PeopleOS HRMS evaluates attendance through declarative, organizational policies linked to structured shift assignments. Attendance policies define strict, objective rules for working hour thresholds, arrival tolerances, break allowances, overnight shifts, and regularization workflows.

---

## 2. Policy Rule Configuration (`AttendancePolicy`)

| Configuration Parameter   | Type    | Default Value  | Description                                                        |
| :------------------------ | :------ | :------------: | :----------------------------------------------------------------- |
| `standardWorkMinutes`     | Integer | `480` (8 hrs)  | Expected daily productive working time                             |
| `halfDayThresholdMinutes` | Integer | `240` (4 hrs)  | Minimum net work required to qualify for Half Day credit           |
| `fullDayThresholdMinutes` | Integer | `420` (7 hrs)  | Minimum net work required to qualify for Full Day (Present) credit |
| `gracePeriodMinutes`      | Integer |      `15`      | Window after shift start where check-in is not penalized as Late   |
| `maxDailyBreakMinutes`    | Integer |      `60`      | Maximum allowable unpaid or paid daily break duration              |
| `workingDayStartHour`     | Integer | `5` (05:00 AM) | Daily cutoff hour demarcating one working day from the next        |
| `geofenceEnforcement`     | Boolean |     `true`     | When true, rejects office check-in outside authorized geofence     |
| `allowMultipleSessions`   | Boolean |     `true`     | Allows employees to check in/out multiple times in a single day    |
| `timezone`                | String  | `Asia/Kolkata` | Authoritative organization timezone (e.g. `America/New_York`)      |

---

## 3. Shift Configuration (`Shift`)

Shifts define the scheduled working window and scheduled days of the week:

- **Start & End Times**: Stored as 24-hour wall clock strings (e.g., `09:00`, `18:00`).
- **Overnight Flag (`isOvernight`)**: Set to `true` when shift end time is earlier in wall clock time than start time (e.g., `22:00` to `06:00`).
- **Work Days (`workDays`)**: Array of ISO weekday integers `[1, 2, 3, 4, 5]` (Monday through Friday). Days outside this list are automatically classified as `WEEK_OFF`.
- **Break Duration (`breakDurationMinutes`)**: Scheduled break allotment (default `60` minutes).

---

## 4. Deterministic Calculation Rules

### 4.1 Working Day Resolution (Cutoff Hour Strategy)

Punches are mapped to a normalized calendar date using the organizational `workingDayStartHour` (default: 05:00 AM local time):

- **Formula**:
  $$\text{WorkingDate} = \begin{cases} \text{PunchDate} - 1 \text{ day}, & \text{if } \text{PunchHour} < \text{workingDayStartHour} \\ \text{PunchDate}, & \text{if } \text{PunchHour} \ge \text{workingDayStartHour} \end{cases}$$
- **Example**: A punch at 02:30 AM on October 10th belongs to the working day of **October 9th**.

### 4.2 Grace Periods and Late Arrival

- Shift Start Time: $T_{\text{start}}$
- Grace End Time: $T_{\text{grace}} = T_{\text{start}} + \text{gracePeriodMinutes}$
- First Check-in: $T_{\text{in}}$
- **Evaluation**:
  - If $T_{\text{in}} \le T_{\text{grace}}$: Employee is on time (`isLate = false`, `lateMinutes = 0`).
  - If $T_{\text{in}} > T_{\text{grace}}$: Employee is late (`isLate = true`).
  - Late duration calculated from scheduled start: $\text{lateMinutes} = \lfloor(T_{\text{in}} - T_{\text{start}}) / 60000\rfloor$.

### 4.3 Early Departure

- Shift End Time: $T_{\text{end}}$
- Last Check-out: $T_{\text{out}}$
- **Evaluation**:
  - If $T_{\text{out}} < T_{\text{end}}$: Employee left early (`isEarlyDeparture = true`).
  - Departure deficit: $\text{earlyDepartureMinutes} = \lfloor(T_{\text{end}} - T_{\text{out}}) / 60000\rfloor$.

### 4.4 Break Deductions and Net Work Duration

Gross working time is the elapsed duration between check-in and check-out across all completed sessions.

- **Formula**:
  $$\text{GrossMinutes} = \sum (\text{SessionCheckOut} - \text{SessionCheckIn})$$
  $$\text{BreakDeduction} = \text{TotalBreakMinutes}$$
  $$\text{NetWorkMinutes} = \max(0, \text{GrossMinutes} - \text{BreakDeduction})$$
  $$\text{NetWorkHours} = \text{round}\left(\frac{\text{NetWorkMinutes}}{60}, 2\right)$$

### 4.5 Daily Attendance Status Thresholds

The status of a completed day is determined strictly by net work time:

1. **`PRESENT`**: $\text{NetWorkMinutes} \ge \text{fullDayThresholdMinutes}$ (Default: $\ge 420$ mins / 7 hrs).
2. **`HALF_DAY`**: $\text{halfDayThresholdMinutes} \le \text{NetWorkMinutes} < \text{fullDayThresholdMinutes}$ (Default: 240–419 mins).
3. **`ABSENT`**: $\text{NetWorkMinutes} < \text{halfDayThresholdMinutes}$ (Default: $< 240$ mins / 4 hrs).

### 4.6 Overtime Candidate Detection

- If $\text{NetWorkMinutes} > \text{standardWorkMinutes}$ (Default: $> 480$ mins / 8 hrs):
  - `isOvertimeCandidate = true`
  - $\text{overtimeCandidateMinutes} = \text{NetWorkMinutes} - \text{standardWorkMinutes}$

---

## 5. Overnight Shift Mechanics (Midnight Window)

When `isOvernight = true`:

1. The shift window begins on Date $D$ at `startTime` (e.g. 2026-10-09 22:00).
2. The shift window ends on Date $D + 1$ at `endTime` (e.g. 2026-10-10 06:00).
3. Check-ins occurring up to 3 hours before start time or check-outs up to 4 hours after end time are associated with the overnight shift beginning on Date $D$.
4. All punches are recorded in authoritative UTC, preventing issues when local clocks change for Daylight Saving Time.

---

## 6. Strict No-Hallucination Policy for Missing Checkouts

When an employee checks in but does not check out:

1. While the working day is in progress, the status is `PENDING`.
2. Once the 05:00 AM cutoff passes on the following day, the missing checkout reconciliation worker (`reconcileMissingCheckouts`) flags the session.
3. The session status transitions to `AUTO_CLOSED` (`checkOutTime: null`).
4. The daily summary status is set to `INCOMPLETE` with `grossMinutes: 0` and `netWorkMinutes: 0`.
5. An `AttendanceException` of type `MISSING_CHECKOUT` is created.
6. The employee or HR must submit an `AttendanceCorrectionRequest` with proof of departure time to regularize the record.

---

## 7. Attendance Modes & Geofence Enforcement

1. **`OFFICE` (Default)**:
   - Requires employee to be physically within the geofence perimeter (default: 100–200m) of an assigned active `OfficeLocation`.
   - GPS coordinate validation:
     - Accuracy must be $\le 150$ meters.
     - Timestamp must be within 5 minutes of server time.
2. **`WFH` (Work From Home)**:
   - Disabled by default. Only accessible if employee has an active approved WFH request or policy exemption.
3. **`OFFICIAL_VISIT`**:
   - Geofence check is bypassed; coordinates and address notes are logged as an off-site client or project visit.
