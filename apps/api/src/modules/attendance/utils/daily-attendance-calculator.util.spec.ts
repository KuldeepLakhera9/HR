import {
  calculateDailyAttendance,
  zonedDateTimeToUtc,
  ShiftTimingSpec,
  AttendancePolicyRules,
} from './daily-attendance-calculator.util';

describe('Daily Attendance Calculation Service (Deterministic Engine)', () => {
  const defaultPolicy: AttendancePolicyRules = {
    standardWorkMinutes: 480, // 8 hrs
    halfDayThresholdMinutes: 240, // 4 hrs
    fullDayThresholdMinutes: 420, // 7 hrs
    gracePeriodMinutes: 15,
    maxDailyBreakMinutes: 60,
    workingDayStartHour: 5, // 05:00 AM cutoff
    timezone: 'Asia/Kolkata',
  };

  const defaultDayShift: ShiftTimingSpec = {
    startTime: '09:00',
    endTime: '18:00',
    isOvernight: false,
    workDays: [1, 2, 3, 4, 5], // Monday - Friday
    breakDurationMinutes: 60,
  };

  const overnightShift: ShiftTimingSpec = {
    startTime: '22:00',
    endTime: '06:00',
    isOvernight: true,
    workDays: [1, 2, 3, 4, 5],
    breakDurationMinutes: 60,
  };

  describe('1. Timezone Boundaries & Wall Clock Mapping', () => {
    it('should correctly map wall clock time to UTC instant in Asia/Kolkata (+05:30)', () => {
      // 09:00 AM IST on 2026-10-09 = 03:30 AM UTC
      const utcDate = zonedDateTimeToUtc('2026-10-09', '09:00', 'Asia/Kolkata');
      expect(utcDate.toISOString()).toBe('2026-10-09T03:30:00.000Z');
    });

    it('should correctly map wall clock time to UTC instant in America/New_York (EDT, UTC-4)', () => {
      // 09:00 AM EDT on 2026-10-09 = 13:00 UTC
      const utcDate = zonedDateTimeToUtc('2026-10-09', '09:00', 'America/New_York');
      expect(utcDate.toISOString()).toBe('2026-10-09T13:00:00.000Z');
    });

    it('should evaluate punches across different timezones deterministically', () => {
      const nyPolicy: AttendancePolicyRules = {
        ...defaultPolicy,
        timezone: 'America/New_York',
      };

      // 09:10 AM EDT (04 mins before grace end of 09:15)
      const checkInUtc = new Date('2026-10-09T13:10:00.000Z');
      const checkOutUtc = new Date('2026-10-09T22:00:00.000Z'); // 18:00 EDT (530 mins)

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: nyPolicy,
        sessions: [
          {
            checkInTime: checkInUtc,
            checkOutTime: checkOutUtc,
            totalWorkMinutes: 530,
            totalBreakMinutes: 50,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.status).toBe('PRESENT');
      expect(result.isLate).toBe(false);
      expect(result.lateMinutes).toBe(0);
      expect(result.netWorkMinutes).toBe(480); // 530 - 50 = 480
    });
  });

  describe('2. Overnight Shifts (Midnight Crossing)', () => {
    it('should calculate accurate window and durations for overnight shift (22:00 to 06:00)', () => {
      // Check-in at 22:00 IST (16:30 UTC Oct 9), Check-out at 06:00 IST next day (00:30 UTC Oct 10)
      const checkIn = new Date('2026-10-09T16:30:00.000Z');
      const checkOut = new Date('2026-10-10T00:30:00.000Z'); // 480 mins gross

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: overnightShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 480,
            totalBreakMinutes: 30,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.grossMinutes).toBe(480);
      expect(result.breakDurationMinutes).toBe(30);
      expect(result.breakDeductionMinutes).toBe(30);
      expect(result.netWorkMinutes).toBe(450);
      expect(result.status).toBe('PRESENT');
      expect(result.isLate).toBe(false);
      expect(result.isEarlyDeparture).toBe(false);
    });

    it('should detect late check-in on overnight shift past grace period', () => {
      // Shift starts 22:00 IST (16:30 UTC). Grace ends 22:15 IST (16:45 UTC).
      // Check-in at 22:25 IST (16:55 UTC) -> 25 mins late
      const checkIn = new Date('2026-10-09T16:55:00.000Z');
      const checkOut = new Date('2026-10-10T00:30:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: overnightShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 455,
            totalBreakMinutes: 0,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(25);
      expect(result.status).toBe('PRESENT');
    });

    it('should detect early departure on overnight shift ending next morning', () => {
      // Shift ends 06:00 IST (00:30 UTC Oct 10).
      // Check-out at 05:15 IST (23:45 UTC Oct 9) -> 45 mins early departure
      const checkIn = new Date('2026-10-09T16:30:00.000Z');
      const checkOut = new Date('2026-10-09T23:45:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: overnightShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 435,
            totalBreakMinutes: 0,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.isEarlyDeparture).toBe(true);
      expect(result.earlyDepartureMinutes).toBe(45);
    });
  });

  describe('3. Missing Events & Incomplete Sessions (Strict No-Hallucination Rule)', () => {
    it('should never silently assume missing checkout time and mark status INCOMPLETE after cutoff', () => {
      // Check-in at 09:00 IST (03:30 UTC), but employee never checked out.
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      // Cutoff is Oct 10 05:00 AM IST (Oct 9 23:30 UTC)
      const afterCutoff = new Date('2026-10-10T06:00:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            id: 'sess-unclosed',
            checkInTime: checkIn,
            checkOutTime: null,
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            status: 'AUTO_CLOSED',
          },
        ],
        referenceNow: afterCutoff,
      });

      expect(result.lastCheckOut).toBeNull();
      expect(result.grossMinutes).toBe(0);
      expect(result.netWorkMinutes).toBe(0);
      expect(result.hasIncompleteSessions).toBe(true);
      expect(result.incompleteSessionIds).toContain('sess-unclosed');
      expect(result.status).toBe('INCOMPLETE');
      expect(result.statusReason).toContain('incomplete session');
    });

    it('should mark PENDING while active day is in progress with an open session', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      // Active day (11:00 AM IST = 05:30 UTC Oct 9)
      const midDay = new Date('2026-10-09T05:30:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            id: 'sess-active',
            checkInTime: checkIn,
            checkOutTime: null,
            totalWorkMinutes: 0,
            totalBreakMinutes: 0,
            status: 'OPEN',
          },
        ],
        referenceNow: midDay,
      });

      expect(result.lastCheckOut).toBeNull();
      expect(result.status).toBe('PENDING');
      expect(result.statusReason).toContain('Attendance session currently open');
    });
  });

  describe('4. Partial-Day Cases (HALF_DAY, Late, Early Exit)', () => {
    it('should classify as HALF_DAY when net work minutes are between 240 and 419 minutes', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T08:30:00.000Z'); // 300 mins gross

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 300,
            totalBreakMinutes: 0,
            status: 'COMPLETED',
          },
        ],
        referenceNow: new Date('2026-10-10T06:00:00.000Z'),
      });

      expect(result.netWorkMinutes).toBe(300);
      expect(result.netWorkHours).toBe(5);
      expect(result.status).toBe('HALF_DAY');
    });

    it('should accurately calculate late minutes and early departure on completed day', () => {
      // Shift is 09:00 to 18:00 IST. Grace period: 15 mins (09:15).
      // Check-in at 09:30 IST (04:00 UTC) -> 30 mins late.
      // Check-out at 17:00 IST (11:30 UTC) -> 60 mins early departure.
      const checkIn = new Date('2026-10-09T04:00:00.000Z');
      const checkOut = new Date('2026-10-09T11:30:00.000Z'); // 450 mins gross

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 450,
            totalBreakMinutes: 0,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(30);
      expect(result.isEarlyDeparture).toBe(true);
      expect(result.earlyDepartureMinutes).toBe(60);
      expect(result.status).toBe('PRESENT'); // 450 >= 420 full day
    });
  });

  describe('5. Overtime Candidate Calculation', () => {
    it('should flag overtime candidate when net work exceeds standardWorkMinutes (480 mins)', () => {
      // 10 hours work (600 mins gross, 20 mins break = 580 mins net -> 100 mins overtime)
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T13:30:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 600,
            totalBreakMinutes: 20,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.netWorkMinutes).toBe(580);
      expect(result.isOvertimeCandidate).toBe(true);
      expect(result.overtimeCandidateMinutes).toBe(100);
      expect(result.overtimeCandidateHours).toBe(1.67);
      expect(result.status).toBe('PRESENT');
    });
  });

  describe('6. Non-Scheduled, Rest Days & Zero Punch Classification', () => {
    it('should classify unpunched day as NOT_SCHEDULED if no shift is assigned', () => {
      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: null, // No shift assigned
        policy: defaultPolicy,
        sessions: [],
        referenceNow: new Date('2026-10-10T06:00:00.000Z'),
      });

      expect(result.isNotScheduled).toBe(true);
      expect(result.status).toBe('NOT_SCHEDULED');
    });

    it('should classify unpunched weekend as WEEK_OFF according to shift workDays', () => {
      // 2026-10-11 is a Sunday (day 7). defaultDayShift workDays is [1, 2, 3, 4, 5].
      const result = calculateDailyAttendance({
        workingDate: '2026-10-11',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [],
        referenceNow: new Date('2026-10-12T06:00:00.000Z'),
      });

      expect(result.isWeekOff).toBe(true);
      expect(result.status).toBe('WEEK_OFF');
    });

    it('should classify unpunched scheduled workday as ABSENT after cutoff has passed', () => {
      // 2026-10-09 is Friday (day 5, scheduled workday).
      // Reference time is after cutoff on Saturday morning.
      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [],
        referenceNow: new Date('2026-10-10T06:00:00.000Z'),
      });

      expect(result.status).toBe('ABSENT');
      expect(result.statusReason).toContain('No check-in recorded');
    });

    it('should NEVER prematurely mark an unpunched scheduled workday as ABSENT before shift ends', () => {
      // On Friday at 10:00 AM IST (04:30 UTC), day is active; employee might be late or checking in soon.
      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [],
        referenceNow: new Date('2026-10-09T04:30:00.000Z'),
      });

      expect(result.status).toBe('PENDING');
      expect(result.statusReason).toContain('in progress or upcoming');
    });
  });

  describe('7. Holidays and Approved Leave Integrations', () => {
    it('should classify unpunched day as HOLIDAY when isHoliday is true', () => {
      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        isHoliday: true,
        sessions: [],
        referenceNow: new Date('2026-10-10T06:00:00.000Z'),
      });

      expect(result.isHoliday).toBe(true);
      expect(result.status).toBe('HOLIDAY');
    });

    it('should classify unpunched day as ON_LEAVE when isApprovedLeave is true', () => {
      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        isApprovedLeave: true,
        sessions: [],
        referenceNow: new Date('2026-10-10T06:00:00.000Z'),
      });

      expect(result.isApprovedLeave).toBe(true);
      expect(result.status).toBe('ON_LEAVE');
    });

    it('should classify as PRESENT if employee worked full day on a public holiday', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T12:00:00.000Z'); // 510 mins

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        isHoliday: true,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 510,
            totalBreakMinutes: 30,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.isHoliday).toBe(true);
      expect(result.status).toBe('PRESENT');
      expect(result.statusReason).toContain('Worked full day on public holiday');
    });
  });

  describe('8. Exceptions & Pending Review Flags', () => {
    it('should flag PENDING_REVIEW if punch occurred outside geofence', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T12:00:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 510,
            totalBreakMinutes: 0,
            status: 'COMPLETED',
          },
        ],
        events: [
          {
            eventType: 'CHECK_IN',
            eventTimestamp: checkIn,
            geofenceStatus: 'OUTSIDE_GEOFENCE',
          },
          {
            eventType: 'CHECK_OUT',
            eventTimestamp: checkOut,
            geofenceStatus: 'VERIFIED',
          },
        ],
      });

      expect(result.hasPendingReview).toBe(true);
      expect(result.pendingReviewReasons).toContain('OUTSIDE_GEOFENCE_EVENT');
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should cap break deduction and flag EXCESSIVE_BREAK_DURATION exception', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T12:30:00.000Z'); // 540 mins gross

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy, // maxDailyBreakMinutes = 60
        sessions: [
          {
            checkInTime: checkIn,
            checkOutTime: checkOut,
            totalWorkMinutes: 540,
            totalBreakMinutes: 120, // 2 hours break taken
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.breakDurationMinutes).toBe(120);
      expect(result.breakDeductionMinutes).toBe(60); // Capped at 60
      expect(result.netWorkMinutes).toBe(480);
      expect(result.pendingReviewReasons).toContain('EXCESSIVE_BREAK_DURATION');
    });
  });

  describe('9. Multiple Sessions Per Day Reconciliation', () => {
    it('should sum multiple valid sessions on the same working date correctly', () => {
      // Session 1: 09:00 to 13:00 (240 mins)
      const in1 = new Date('2026-10-09T03:30:00.000Z');
      const out1 = new Date('2026-10-09T07:30:00.000Z');
      // Session 2: 14:00 to 18:00 (240 mins)
      const in2 = new Date('2026-10-09T08:30:00.000Z');
      const out2 = new Date('2026-10-09T12:30:00.000Z');

      const result = calculateDailyAttendance({
        workingDate: '2026-10-09',
        shift: defaultDayShift,
        policy: defaultPolicy,
        sessions: [
          {
            sessionNumber: 1,
            checkInTime: in1,
            checkOutTime: out1,
            totalWorkMinutes: 240,
            totalBreakMinutes: 10,
            status: 'COMPLETED',
          },
          {
            sessionNumber: 2,
            checkInTime: in2,
            checkOutTime: out2,
            totalWorkMinutes: 240,
            totalBreakMinutes: 10,
            status: 'COMPLETED',
          },
        ],
      });

      expect(result.totalSessions).toBe(2);
      expect(result.completedSessionsCount).toBe(2);
      expect(result.firstCheckIn).toEqual(in1);
      expect(result.lastCheckOut).toEqual(out2);
      expect(result.grossMinutes).toBe(480);
      expect(result.breakDurationMinutes).toBe(20);
      expect(result.netWorkMinutes).toBe(460);
      expect(result.status).toBe('PRESENT');
    });
  });
});
