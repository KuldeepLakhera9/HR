/**
 * Pure, Testable Attendance Policy & Shift Evaluator
 * Does NOT hardcode organizational timings; evaluates against dynamic policy rules.
 */

import { AttendanceDayStatus } from '@hrms/types';
export * from './daily-attendance-calculator.util';

export interface ShiftTimingSpec {
  startTime: string; // "HH:mm" in 24h format e.g. "09:00"
  endTime: string; // "HH:mm" in 24h format e.g. "18:00"
  isOvernight?: boolean;
  workDays?: number[]; // [1,2,3,4,5] (1=Mon, 7=Sun)
  breakDurationMinutes?: number;
}

export interface AttendancePolicyRules {
  standardWorkMinutes?: number; // default: 480 (8 hrs)
  halfDayThresholdMinutes?: number; // default: 240 (4 hrs)
  fullDayThresholdMinutes?: number; // default: 420 (7 hrs)
  gracePeriodMinutes?: number; // default: 15 mins
  maxCheckInDelayMinutes?: number; // default: 120 mins
  maxDailyBreakMinutes?: number; // default: 60 mins
  workingDayStartHour?: number; // default: 5 (05:00 AM cutoff)
  overnightShiftAllowed?: boolean;
  timezone?: string;
}

export interface ShiftWindow {
  workingDate: string; // "YYYY-MM-DD"
  shiftStartDate: Date; // Resolved start instant
  shiftEndDate: Date; // Resolved end instant
  graceEndDate: Date; // Resolved grace threshold instant
  scheduledMinutes: number; // Total planned duration in minutes
  isOvernight: boolean;
}

export interface SessionEvaluationParams {
  checkInTime: Date;
  checkOutTime?: Date | null;
  shift?: ShiftTimingSpec | null;
  policy?: AttendancePolicyRules;
  totalBreakMinutes?: number;
  isDayCompleted?: boolean;
  workingDate?: string;
  isHolidayOrWeekend?: boolean;
}

export interface EvaluatedSessionResult {
  workingDate: string;
  lateArrivalMinutes: number;
  earlyDepartureMinutes: number;
  grossMinutes: number;
  breakDeductionMinutes: number;
  netWorkMinutes: number;
  overtimeMinutes: number;
  status: AttendanceDayStatus;
  isMissingCheckout: boolean;
  isLate: boolean;
}

/**
 * 1. Helper: Format Date components in target IANA timezone
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
 * 2. Resolve Working Day Cutoff (Overnight Strategy)
 * Punches before workingDayStartHour (e.g. 05:00 AM) map to previous calendar day.
 */
export function resolveWorkingDay(
  timestamp: Date,
  workingDayStartHour: number = 5,
  timezone: string = 'Asia/Kolkata',
): { workingDateStr: string; localHour: number } {
  const parts = getTimezoneParts(timestamp, timezone);

  if (parts.hour < workingDayStartHour) {
    // Subtract 1 calendar day
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
 * 3. Calculate Scheduled Shift Window (including overnight shifts)
 */
export function calculateShiftWindow(
  shift: ShiftTimingSpec,
  workingDateStr: string,
  graceMinutes: number = 15,
  _timezone: string = 'Asia/Kolkata',
): ShiftWindow {
  const [startHour, startMin] = shift.startTime.split(':').map(Number);
  const [endHour, endMin] = shift.endTime.split(':').map(Number);

  const [y, m, d] = workingDateStr.split('-').map(Number);

  // We construct UTC dates corresponding to the wall clock time in target timezone
  // For precise comparison without third-party libraries:
  const baseStart = new Date(Date.UTC(y, m - 1, d, startHour, startMin, 0));
  const graceEnd = new Date(baseStart.getTime() + graceMinutes * 60 * 1000);

  let isOvernight = shift.isOvernight ?? false;
  if (endHour < startHour || (endHour === startHour && endMin < startMin)) {
    isOvernight = true;
  }

  const endDayOffset = isOvernight ? 1 : 0;
  const baseEnd = new Date(Date.UTC(y, m - 1, d + endDayOffset, endHour, endMin, 0));

  const scheduledMinutes = Math.round((baseEnd.getTime() - baseStart.getTime()) / (60 * 1000));

  return {
    workingDate: workingDateStr,
    shiftStartDate: baseStart,
    shiftEndDate: baseEnd,
    graceEndDate: graceEnd,
    scheduledMinutes,
    isOvernight,
  };
}

/**
 * 4. Pure Session & Policy Timing Evaluator
 */
export function evaluateSessionTiming(params: SessionEvaluationParams): EvaluatedSessionResult {
  const {
    checkInTime,
    checkOutTime,
    shift,
    policy = {},
    totalBreakMinutes = 0,
    isDayCompleted = false,
    workingDate,
    isHolidayOrWeekend = false,
  } = params;

  const timezone = policy.timezone || 'Asia/Kolkata';
  const cutoffHour = policy.workingDayStartHour ?? 5;
  const gracePeriod = policy.gracePeriodMinutes ?? 15;
  const standardWorkMinutes = policy.standardWorkMinutes ?? 480;
  const halfDayThreshold = policy.halfDayThresholdMinutes ?? 240;
  const fullDayThreshold = policy.fullDayThresholdMinutes ?? 420;
  const maxBreakMinutes = policy.maxDailyBreakMinutes ?? 60;

  // Resolve working date if not explicitly provided
  const resolvedDateStr =
    workingDate || resolveWorkingDay(checkInTime, cutoffHour, timezone).workingDateStr;

  // Calculate gross work duration
  let grossMinutes = 0;
  let isMissingCheckout = false;

  if (checkOutTime) {
    const diffMs = checkOutTime.getTime() - checkInTime.getTime();
    grossMinutes = Math.max(0, Math.round(diffMs / (60 * 1000)));
  } else if (isDayCompleted) {
    isMissingCheckout = true;
    grossMinutes = 0; // Unclosed session at end of cutoff
  } else {
    // Day in progress
    grossMinutes = 0;
  }

  // Break deduction (capped at max daily break if break deduction applies)
  const breakDeductionMinutes = Math.min(totalBreakMinutes, maxBreakMinutes);
  const netWorkMinutes = Math.max(0, grossMinutes - breakDeductionMinutes);

  // Overtime minutes
  const overtimeMinutes =
    netWorkMinutes > standardWorkMinutes ? netWorkMinutes - standardWorkMinutes : 0;

  // Shift Timing: late arrival and early departure
  let lateArrivalMinutes = 0;
  let earlyDepartureMinutes = 0;
  let isLate = false;

  if (shift) {
    const shiftWindow = calculateShiftWindow(shift, resolvedDateStr, gracePeriod, timezone);

    // Normalize checkIn wall clock against shift start
    // Convert checkIn to UTC wall clock on workingDate
    const checkInParts = getTimezoneParts(checkInTime, timezone);
    const [wY, wM, wD] = resolvedDateStr.split('-').map(Number);
    const dayOffset = checkInParts.day - wD; // 0 for same day, 1 for next day morning
    const normalizedCheckIn = new Date(
      Date.UTC(
        wY,
        wM - 1,
        wD + (dayOffset > 0 ? dayOffset : 0),
        checkInParts.hour,
        checkInParts.minute,
        checkInParts.second,
      ),
    );

    if (normalizedCheckIn > shiftWindow.graceEndDate) {
      const lateDiffMs = normalizedCheckIn.getTime() - shiftWindow.shiftStartDate.getTime();
      lateArrivalMinutes = Math.max(0, Math.round(lateDiffMs / (60 * 1000)));
      isLate = true;
    }

    if (checkOutTime) {
      const checkOutParts = getTimezoneParts(checkOutTime, timezone);
      const outDayOffset = checkOutParts.day - wD;
      const normalizedCheckOut = new Date(
        Date.UTC(
          wY,
          wM - 1,
          wD + (outDayOffset > 0 ? outDayOffset : 0),
          checkOutParts.hour,
          checkOutParts.minute,
          checkOutParts.second,
        ),
      );

      if (normalizedCheckOut < shiftWindow.shiftEndDate) {
        const earlyDiffMs = shiftWindow.shiftEndDate.getTime() - normalizedCheckOut.getTime();
        earlyDepartureMinutes = Math.max(0, Math.round(earlyDiffMs / (60 * 1000)));
      }
    }
  }

  // Determine Daily Status
  let status: AttendanceDayStatus = 'PENDING';

  if (isHolidayOrWeekend) {
    status = netWorkMinutes >= fullDayThreshold ? 'PRESENT' : 'WEEKEND_OFF';
  } else if (!checkOutTime && !isDayCompleted) {
    status = 'PENDING';
  } else if (isMissingCheckout) {
    status = 'ABSENT';
  } else if (netWorkMinutes >= fullDayThreshold) {
    status = isLate ? 'LATE' : 'PRESENT';
  } else if (netWorkMinutes >= halfDayThreshold) {
    status = 'HALF_DAY';
  } else {
    status = 'ABSENT';
  }

  return {
    workingDate: resolvedDateStr,
    lateArrivalMinutes,
    earlyDepartureMinutes,
    grossMinutes,
    breakDeductionMinutes,
    netWorkMinutes,
    overtimeMinutes,
    status,
    isMissingCheckout,
    isLate,
  };
}
