/**
 * Deterministic Daily Attendance Calculation Engine
 * Pure, authoritative, fully testable calculation service based on:
 * - Raw attendance events (CHECK_IN, CHECK_OUT, BREAK_START, BREAK_END)
 * - Attendance sessions (OPEN, COMPLETED, AUTO_CLOSED)
 * - Assigned shift timings and working days
 * - Historically effective attendance policy rules
 *
 * Guarantees:
 * 1. Never silently assumes or fabricates missing checkout time.
 * 2. Does not classify employees as ABSENT before considering assigned schedules,
 *    weekly rest days, holidays, and future leave integrations.
 * 3. Accurately handles timezone boundaries and overnight shifts.
 * 4. Deterministically distinguishes:
 *    PRESENT, HALF_DAY, ABSENT, INCOMPLETE, PENDING_REVIEW, HOLIDAY, WEEK_OFF, NOT_SCHEDULED.
 */

import { AttendanceDayStatus } from '@hrms/types';

export interface RawAttendanceEventSummary {
  id?: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';
  eventTimestamp: Date;
  geofenceStatus?: 'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'LOW_ACCURACY' | 'EXEMPT' | 'FAILED' | string;
  sessionId?: string | null;
}

export interface AttendanceSessionSummary {
  id?: string;
  sessionNumber?: number;
  checkInTime: Date;
  checkOutTime?: Date | null;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  status: 'OPEN' | 'COMPLETED' | 'AUTO_CLOSED' | string;
  events?: RawAttendanceEventSummary[];
}

export interface ShiftTimingSpec {
  id?: string;
  name?: string;
  code?: string;
  startTime: string; // "HH:mm" in 24h format e.g. "09:00"
  endTime: string; // "HH:mm" in 24h format e.g. "18:00"
  isOvernight?: boolean;
  workDays?: number[]; // [1,2,3,4,5] (1=Mon, 7=Sun)
  breakDurationMinutes?: number;
}

export interface AttendancePolicyRules {
  id?: string;
  code?: string;
  standardWorkMinutes?: number; // default: 480 (8 hrs)
  halfDayThresholdMinutes?: number; // default: 240 (4 hrs)
  fullDayThresholdMinutes?: number; // default: 420 (7 hrs)
  gracePeriodMinutes?: number; // default: 15 mins
  maxCheckInDelayMinutes?: number; // default: 120 mins
  maxDailyBreakMinutes?: number; // default: 60 mins
  workingDayStartHour?: number; // default: 5 (05:00 AM cutoff)
  overnightShiftAllowed?: boolean;
  timezone?: string; // default: Asia/Kolkata
  markLateStatus?: boolean; // default: false (keeps PRESENT with isLate flag, or LATE if true)
}

export interface DailyCalculationInput {
  workingDate: string; // "YYYY-MM-DD"
  events?: RawAttendanceEventSummary[];
  sessions?: AttendanceSessionSummary[];
  shift?: ShiftTimingSpec | null;
  policy: AttendancePolicyRules;
  isHoliday?: boolean;
  isApprovedLeave?: boolean;
  leaveType?: string | null;
  referenceNow?: Date; // Authoritative instant for day-in-progress check
}

export interface DailyCalculationOutput {
  workingDate: string;
  firstCheckIn: Date | null;
  lastCheckOut: Date | null;

  // Durations (minutes & decimal hours rounded to 2 decimal places)
  grossMinutes: number;
  grossHours: number;
  breakDurationMinutes: number;
  breakDurationHours: number;
  breakDeductionMinutes: number;
  netWorkMinutes: number;
  netWorkHours: number;

  // Shift timing & deviations
  lateMinutes: number;
  isLate: boolean;
  earlyDepartureMinutes: number;
  isEarlyDeparture: boolean;

  // Overtime candidate
  isOvertimeCandidate: boolean;
  overtimeCandidateMinutes: number;
  overtimeCandidateHours: number;

  // Sessions & Quality
  totalSessions: number;
  completedSessionsCount: number;
  incompleteSessionsCount: number;
  hasIncompleteSessions: boolean;
  incompleteSessionIds: string[];

  // Exceptions & Review flags
  hasPendingReview: boolean;
  pendingReviewReasons: string[];

  // Resolved Daily Status
  status: AttendanceDayStatus;
  statusReason: string;

  // Scheduling flags
  isHoliday: boolean;
  isWeekOff: boolean;
  isNotScheduled: boolean;
  isApprovedLeave: boolean;
}

/**
 * 1. Helper: Extract Date components in target IANA timezone
 */
export function getTimezoneParts(date: Date, timezone: string = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);
  const second = parseInt(getPart('second'), 10);

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hour, minute, second, dateStr };
}

/**
 * 2. Helper: Convert a (dateStr, "HH:mm") wall clock in a specific timezone to an exact UTC Date
 */
export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string = 'Asia/Kolkata',
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = getTimezoneParts(approxUtc, timezone);

  const targetWallClockMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const currentWallClockMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const offsetDiffMs = targetWallClockMs - currentWallClockMs;
  return new Date(approxUtc.getTime() + offsetDiffMs);
}

/**
 * 3. Helper: Resolve working day date string for an arbitrary timestamp based on cutoff hour
 */
export function resolveWorkingDay(
  timestamp: Date,
  workingDayStartHour: number = 5,
  timezone: string = 'Asia/Kolkata',
): { workingDateStr: string; localHour: number } {
  const parts = getTimezoneParts(timestamp, timezone);

  if (parts.hour < workingDayStartHour) {
    const prevDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1));
    const prevParts = getTimezoneParts(prevDate, 'UTC');
    return {
      workingDateStr: prevParts.dateStr,
      localHour: parts.hour,
    };
  }

  return {
    workingDateStr: parts.dateStr,
    localHour: parts.hour,
  };
}

/**
 * 4. Helper: Calculate shift boundaries (including overnight shifts)
 */
export function calculateShiftWindow(
  shift: ShiftTimingSpec,
  workingDateStr: string,
  graceMinutes: number = 15,
  timezone: string = 'Asia/Kolkata',
) {
  const [startHour, startMin] = shift.startTime.split(':').map(Number);
  const [endHour, endMin] = shift.endTime.split(':').map(Number);

  const shiftStartDate = zonedDateTimeToUtc(workingDateStr, shift.startTime, timezone);
  const graceEndDate = new Date(shiftStartDate.getTime() + graceMinutes * 60 * 1000);

  let isOvernight = shift.isOvernight ?? false;
  if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
    isOvernight = true;
  }

  const [y, m, d] = workingDateStr.split('-').map(Number);
  const endCalendarDate = isOvernight
    ? new Date(Date.UTC(y, m - 1, d + 1))
    : new Date(Date.UTC(y, m - 1, d));
  const endDateStr = endCalendarDate.toISOString().split('T')[0];
  const shiftEndDate = zonedDateTimeToUtc(endDateStr, shift.endTime, timezone);

  const scheduledMinutes = Math.max(
    0,
    Math.round((shiftEndDate.getTime() - shiftStartDate.getTime()) / (60 * 1000)),
  );

  return {
    workingDate: workingDateStr,
    shiftStartDate,
    shiftEndDate,
    graceEndDate,
    scheduledMinutes,
    isOvernight,
  };
}

/**
 * 5. Deterministic Daily Attendance Calculator
 */
export function calculateDailyAttendance(params: DailyCalculationInput): DailyCalculationOutput {
  const {
    workingDate,
    events = [],
    sessions = [],
    shift = null,
    policy,
    isHoliday = false,
    isApprovedLeave = false,
    leaveType = null,
    referenceNow = new Date(),
  } = params;

  const timezone = policy.timezone || 'Asia/Kolkata';
  const cutoffHour = policy.workingDayStartHour ?? 5;
  const graceMinutes = policy.gracePeriodMinutes ?? 15;
  const standardWorkMinutes = policy.standardWorkMinutes ?? 480;
  const halfDayThresholdMinutes = policy.halfDayThresholdMinutes ?? 240;
  const fullDayThresholdMinutes = policy.fullDayThresholdMinutes ?? 420;
  const maxDailyBreakMinutes = policy.maxDailyBreakMinutes ?? 60;

  // ---------------------------------------------------------------------------
  // A. Shift and Schedule Resolution
  // ---------------------------------------------------------------------------
  const [wY, wM, wD] = workingDate.split('-').map(Number);
  // Compute day of week for workingDate in UTC midnight
  const dayDate = new Date(Date.UTC(wY, wM - 1, wD, 12, 0, 0));
  const jsDay = dayDate.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const isoDay = jsDay === 0 ? 7 : jsDay; // 1 = Mon ... 7 = Sun

  const isNotScheduled = !shift;
  const workDays = shift?.workDays || [1, 2, 3, 4, 5];
  const isWeekOff = !isNotScheduled && !workDays.includes(isoDay);

  let shiftWindow = null;
  if (shift) {
    shiftWindow = calculateShiftWindow(shift, workingDate, graceMinutes, timezone);
  }

  // Next-day cutoff instant (e.g. 05:00 AM on the day following workingDate)
  const nextDay = new Date(Date.UTC(wY, wM - 1, wD + 1));
  const nextDayStr = nextDay.toISOString().split('T')[0];
  const cutoffInstant = zonedDateTimeToUtc(
    nextDayStr,
    `${String(cutoffHour).padStart(2, '0')}:00`,
    timezone,
  );

  const isCutoffPassed = referenceNow.getTime() >= cutoffInstant.getTime();
  const isShiftEnded = shiftWindow
    ? referenceNow.getTime() >= shiftWindow.shiftEndDate.getTime()
    : isCutoffPassed;

  // ---------------------------------------------------------------------------
  // B. Event and Session Extraction
  // ---------------------------------------------------------------------------
  // 1. First Check-in: earliest checkInTime or CHECK_IN event
  let firstCheckIn: Date | null = null;
  const allCheckInTimes: Date[] = [];

  for (const s of sessions) {
    if (s.checkInTime) allCheckInTimes.push(new Date(s.checkInTime));
  }
  for (const ev of events) {
    if (ev.eventType === 'CHECK_IN' && ev.eventTimestamp) {
      allCheckInTimes.push(new Date(ev.eventTimestamp));
    }
  }

  if (allCheckInTimes.length > 0) {
    allCheckInTimes.sort((a, b) => a.getTime() - b.getTime());
    firstCheckIn = allCheckInTimes[0];
  }

  // 2. Completed Sessions and Last Check-out
  // CRITICAL: "Never silently assume missing checkout time"
  const completedSessions = sessions.filter(
    (s) => (s.status === 'COMPLETED' || s.checkOutTime) && s.checkOutTime != null,
  );

  let lastCheckOut: Date | null = null;
  if (completedSessions.length > 0) {
    const validCheckOuts = completedSessions
      .map((s) => new Date(s.checkOutTime!))
      .sort((a, b) => b.getTime() - a.getTime());
    lastCheckOut = validCheckOuts[0];
  }

  // 3. Incomplete Sessions detection
  const incompleteSessions = sessions.filter((s) => {
    if (s.status === 'AUTO_CLOSED') return true;
    if (s.status === 'OPEN' && (isCutoffPassed || !s.checkOutTime)) return true;
    if (!s.checkOutTime) return true;
    return false;
  });

  const incompleteSessionIds = incompleteSessions.map((s) => s.id || 'unnamed-session');
  const hasIncompleteSessions = incompleteSessions.length > 0;

  // ---------------------------------------------------------------------------
  // C. Duration Calculations (Gross, Break, Net)
  // ---------------------------------------------------------------------------
  let grossMinutes = 0;
  for (const s of completedSessions) {
    if (s.checkInTime && s.checkOutTime) {
      const inMs = new Date(s.checkInTime).getTime();
      const outMs = new Date(s.checkOutTime).getTime();
      if (outMs > inMs) {
        grossMinutes += Math.round((outMs - inMs) / 60000);
      }
    }
  }

  // If no sessions passed but checkIn and checkOut events exist
  if (sessions.length === 0 && firstCheckIn && lastCheckOut) {
    const diffMs = lastCheckOut.getTime() - firstCheckIn.getTime();
    if (diffMs > 0) {
      grossMinutes = Math.round(diffMs / 60000);
    }
  }

  const grossHours = Math.round((grossMinutes / 60) * 100) / 100;

  // Break duration: sum session.totalBreakMinutes or calculate from break events
  let breakDurationMinutes = sessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
  if (breakDurationMinutes === 0 && events.length > 0) {
    // Calculate break pairs from events if session total was 0
    let currentBreakStart: Date | null = null;
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.eventTimestamp).getTime() - new Date(b.eventTimestamp).getTime(),
    );
    for (const ev of sortedEvents) {
      if (ev.eventType === 'BREAK_START') {
        currentBreakStart = new Date(ev.eventTimestamp);
      } else if (ev.eventType === 'BREAK_END' && currentBreakStart) {
        const diffMs = new Date(ev.eventTimestamp).getTime() - currentBreakStart.getTime();
        breakDurationMinutes += Math.max(0, Math.round(diffMs / 60000));
        currentBreakStart = null;
      }
    }
  }

  const breakDurationHours = Math.round((breakDurationMinutes / 60) * 100) / 100;
  const breakDeductionMinutes = Math.min(breakDurationMinutes, maxDailyBreakMinutes);

  const netWorkMinutes = Math.max(0, grossMinutes - breakDeductionMinutes);
  const netWorkHours = Math.round((netWorkMinutes / 60) * 100) / 100;

  // ---------------------------------------------------------------------------
  // D. Shift Timing Deviations (Late Arrival & Early Departure)
  // ---------------------------------------------------------------------------
  let lateMinutes = 0;
  let isLate = false;
  let earlyDepartureMinutes = 0;
  let isEarlyDeparture = false;

  if (shiftWindow && firstCheckIn) {
    if (firstCheckIn.getTime() > shiftWindow.graceEndDate.getTime()) {
      const lateDiffMs = firstCheckIn.getTime() - shiftWindow.shiftStartDate.getTime();
      lateMinutes = Math.max(0, Math.floor(lateDiffMs / 60000));
      isLate = true;
    }
  }

  if (shiftWindow && lastCheckOut) {
    if (lastCheckOut.getTime() < shiftWindow.shiftEndDate.getTime()) {
      const earlyDiffMs = shiftWindow.shiftEndDate.getTime() - lastCheckOut.getTime();
      earlyDepartureMinutes = Math.max(0, Math.floor(earlyDiffMs / 60000));
      isEarlyDeparture = true;
    }
  }

  // ---------------------------------------------------------------------------
  // E. Overtime Candidate
  // ---------------------------------------------------------------------------
  let overtimeCandidateMinutes = 0;
  let isOvertimeCandidate = false;

  if (netWorkMinutes > standardWorkMinutes) {
    overtimeCandidateMinutes = netWorkMinutes - standardWorkMinutes;
    isOvertimeCandidate = true;
  }
  const overtimeCandidateHours = Math.round((overtimeCandidateMinutes / 60) * 100) / 100;

  // ---------------------------------------------------------------------------
  // F. Exceptions and Pending Review Reasons
  // ---------------------------------------------------------------------------
  const pendingReviewReasons: string[] = [];

  for (const ev of events) {
    if (ev.geofenceStatus === 'OUTSIDE_GEOFENCE') {
      if (!pendingReviewReasons.includes('OUTSIDE_GEOFENCE_EVENT')) {
        pendingReviewReasons.push('OUTSIDE_GEOFENCE_EVENT');
      }
    } else if (ev.geofenceStatus === 'LOW_ACCURACY') {
      if (!pendingReviewReasons.includes('LOW_GPS_ACCURACY')) {
        pendingReviewReasons.push('LOW_GPS_ACCURACY');
      }
    }
  }

  if (breakDurationMinutes > maxDailyBreakMinutes) {
    pendingReviewReasons.push('EXCESSIVE_BREAK_DURATION');
  }

  if (hasIncompleteSessions && isCutoffPassed) {
    pendingReviewReasons.push('MISSING_CHECKOUT');
  }

  if (grossMinutes > 960) {
    pendingReviewReasons.push('SUSPICIOUS_LONG_HOURS');
  }

  const hasPendingReview = pendingReviewReasons.length > 0;

  // ---------------------------------------------------------------------------
  // G. Deterministic Attendance Status Resolution
  // ---------------------------------------------------------------------------
  let status: AttendanceDayStatus = 'PENDING';
  let statusReason = '';

  // 1. Leave Precedence
  if (isApprovedLeave) {
    if (leaveType === 'HALF_DAY') {
      if (netWorkMinutes >= halfDayThresholdMinutes) {
        status = 'HALF_DAY';
        statusReason = 'Worked half day with approved half-day leave';
      } else {
        status = 'ON_LEAVE';
        statusReason = 'Approved half-day leave';
      }
    } else {
      status = 'ON_LEAVE';
      statusReason = 'Approved leave';
    }
  }
  // 2. Holiday Precedence
  else if (isHoliday) {
    if (netWorkMinutes >= fullDayThresholdMinutes) {
      status = 'PRESENT';
      statusReason = 'Worked full day on public holiday';
    } else if (netWorkMinutes >= halfDayThresholdMinutes) {
      status = 'HALF_DAY';
      statusReason = 'Worked half day on public holiday';
    } else {
      status = 'HOLIDAY';
      statusReason = 'Recognized public holiday';
    }
  }
  // 3. Employee with NO Punches
  else if (!firstCheckIn) {
    if (isNotScheduled) {
      status = 'NOT_SCHEDULED';
      statusReason = 'No shift assigned for this working date';
    } else if (isWeekOff) {
      status = 'WEEK_OFF';
      statusReason = 'Scheduled weekly rest day';
    } else {
      // Scheduled working day without punches
      if (isCutoffPassed || isShiftEnded) {
        status = 'ABSENT';
        statusReason = 'No check-in recorded for scheduled shift';
      } else {
        status = 'PENDING';
        statusReason = 'Scheduled shift in progress or upcoming';
      }
    }
  }
  // 4. Employee with Punches
  else {
    // Check if session is incomplete (unclosed and cutoff passed)
    if (
      hasIncompleteSessions &&
      (isCutoffPassed || sessions.some((s) => s.status === 'AUTO_CLOSED'))
    ) {
      status = 'INCOMPLETE';
      statusReason = 'Check-in recorded without valid check-out (incomplete session)';
    } else if (!lastCheckOut && !isCutoffPassed) {
      // Active open session currently in progress
      status = 'PENDING';
      statusReason = 'Attendance session currently open';
    } else if (
      pendingReviewReasons.includes('OUTSIDE_GEOFENCE_EVENT') ||
      pendingReviewReasons.includes('SUSPICIOUS_LONG_HOURS')
    ) {
      status = 'PENDING_REVIEW';
      statusReason = `Pending manager review: ${pendingReviewReasons.join(', ')}`;
    } else if (netWorkMinutes >= fullDayThresholdMinutes) {
      status = policy.markLateStatus && isLate ? 'LATE' : 'PRESENT';
      statusReason = isLate ? 'Present (Late arrival)' : 'Present (Full day)';
    } else if (netWorkMinutes >= halfDayThresholdMinutes) {
      status = 'HALF_DAY';
      statusReason = 'Net working time meets half-day threshold';
    } else {
      // Net work time is below half-day threshold
      if (isCutoffPassed || isShiftEnded) {
        status = 'ABSENT';
        statusReason = 'Net working time below half-day threshold';
      } else {
        status = 'PENDING';
        statusReason = 'Partial work completed, day in progress';
      }
    }
  }

  return {
    workingDate,
    firstCheckIn,
    lastCheckOut,

    grossMinutes,
    grossHours,
    breakDurationMinutes,
    breakDurationHours,
    breakDeductionMinutes,
    netWorkMinutes,
    netWorkHours,

    lateMinutes,
    isLate,
    earlyDepartureMinutes,
    isEarlyDeparture,

    isOvertimeCandidate,
    overtimeCandidateMinutes,
    overtimeCandidateHours,

    totalSessions: sessions.length,
    completedSessionsCount: completedSessions.length,
    incompleteSessionsCount: incompleteSessions.length,
    hasIncompleteSessions,
    incompleteSessionIds,

    hasPendingReview,
    pendingReviewReasons,

    status,
    statusReason,

    isHoliday,
    isWeekOff,
    isNotScheduled,
    isApprovedLeave,
  };
}
