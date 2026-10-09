import {
  resolveWorkingDay,
  calculateShiftWindow,
  evaluateSessionTiming,
  ShiftTimingSpec,
  AttendancePolicyRules,
} from './policy-evaluator.util';

describe('Attendance Policy Evaluator (Pure Functions)', () => {
  describe('resolveWorkingDay (Cutoff Hour Strategy)', () => {
    it('should map punches at 09:30 AM to current date (2026-10-09)', () => {
      // 09:30 AM IST = 04:00 UTC
      const punchTime = new Date('2026-10-09T04:00:00.000Z');
      const res = resolveWorkingDay(punchTime, 5, 'Asia/Kolkata');
      expect(res.workingDateStr).toBe('2026-10-09');
    });

    it('should map punches before 05:00 AM (e.g. 03:30 AM) to prior date (2026-10-08)', () => {
      // 03:30 AM IST on Oct 9 = Oct 8 22:00 UTC
      const punchTime = new Date('2026-10-08T22:00:00.000Z');
      const res = resolveWorkingDay(punchTime, 5, 'Asia/Kolkata');
      expect(res.workingDateStr).toBe('2026-10-08');
    });

    it('should map punches exactly at 05:00 AM cutoff to current date', () => {
      // 05:00 AM IST on Oct 9 = Oct 8 23:30 UTC
      const punchTime = new Date('2026-10-08T23:30:00.000Z');
      const res = resolveWorkingDay(punchTime, 5, 'Asia/Kolkata');
      expect(res.workingDateStr).toBe('2026-10-09');
    });
  });

  describe('calculateShiftWindow', () => {
    it('should calculate standard day shift window (09:00 to 18:00)', () => {
      const shift: ShiftTimingSpec = {
        startTime: '09:00',
        endTime: '18:00',
        isOvernight: false,
      };

      const window = calculateShiftWindow(shift, '2026-10-09', 15, 'Asia/Kolkata');
      expect(window.isOvernight).toBe(false);
      expect(window.scheduledMinutes).toBe(540); // 9 hours
      expect(window.shiftStartDate.toISOString()).toContain('2026-10-09T09:00:00');
      expect(window.graceEndDate.toISOString()).toContain('2026-10-09T09:15:00');
      expect(window.shiftEndDate.toISOString()).toContain('2026-10-09T18:00:00');
    });

    it('should calculate overnight shift window spanning next day (22:00 to 06:00)', () => {
      const shift: ShiftTimingSpec = {
        startTime: '22:00',
        endTime: '06:00',
        isOvernight: true,
      };

      const window = calculateShiftWindow(shift, '2026-10-09', 15, 'Asia/Kolkata');
      expect(window.isOvernight).toBe(true);
      expect(window.scheduledMinutes).toBe(480); // 8 hours
      expect(window.shiftStartDate.toISOString()).toContain('2026-10-09T22:00:00');
      expect(window.shiftEndDate.toISOString()).toContain('2026-10-10T06:00:00');
    });
  });

  describe('evaluateSessionTiming', () => {
    const defaultShift: ShiftTimingSpec = {
      startTime: '09:00',
      endTime: '18:00',
      isOvernight: false,
    };

    const defaultPolicy: AttendancePolicyRules = {
      standardWorkMinutes: 480, // 8 hrs
      halfDayThresholdMinutes: 240, // 4 hrs
      fullDayThresholdMinutes: 420, // 7 hrs
      gracePeriodMinutes: 15,
      maxDailyBreakMinutes: 60,
      timezone: 'Asia/Kolkata',
    };

    it('should evaluate on-time arrival within grace period as PRESENT (09:12 AM)', () => {
      // Check-in: 09:12 AM IST (03:42 UTC), Check-out: 18:00 PM IST (12:30 UTC)
      const checkIn = new Date('2026-10-09T03:42:00.000Z');
      const checkOut = new Date('2026-10-09T12:30:00.000Z'); // 528 gross mins

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: defaultPolicy,
        totalBreakMinutes: 45,
        workingDate: '2026-10-09',
      });

      expect(res.isLate).toBe(false);
      expect(res.lateArrivalMinutes).toBe(0);
      expect(res.grossMinutes).toBe(528);
      expect(res.breakDeductionMinutes).toBe(45);
      expect(res.netWorkMinutes).toBe(483);
      expect(res.status).toBe('PRESENT');
      expect(res.overtimeMinutes).toBe(3); // 483 - 480 = 3 mins OT
    });

    it('should evaluate late arrival past grace period as LATE (09:25 AM)', () => {
      // Check-in: 09:25 AM IST (03:55 UTC) -> 25 mins late
      const checkIn = new Date('2026-10-09T03:55:00.000Z');
      const checkOut = new Date('2026-10-09T12:30:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: defaultPolicy,
        workingDate: '2026-10-09',
      });

      expect(res.isLate).toBe(true);
      expect(res.lateArrivalMinutes).toBe(25);
      expect(res.status).toBe('LATE');
    });

    it('should evaluate early exit before shift end (16:30 PM)', () => {
      // Check-in: 09:00 AM IST (03:30 UTC), Check-out: 16:30 PM IST (11:00 UTC) -> 90 mins early exit
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T11:00:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: defaultPolicy,
        workingDate: '2026-10-09',
      });

      expect(res.earlyDepartureMinutes).toBe(90);
      expect(res.grossMinutes).toBe(450);
      expect(res.status).toBe('PRESENT'); // 450 >= 420 full day
    });

    it('should evaluate HALF_DAY when working between 240 and 420 minutes', () => {
      // 5 hours gross (300 mins)
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T08:30:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: defaultPolicy,
        workingDate: '2026-10-09',
      });

      expect(res.netWorkMinutes).toBe(300);
      expect(res.status).toBe('HALF_DAY');
    });

    it('should evaluate ABSENT when net work is less than half day threshold (e.g. 150 mins)', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T06:00:00.000Z'); // 150 mins

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: defaultPolicy,
        workingDate: '2026-10-09',
      });

      expect(res.netWorkMinutes).toBe(150);
      expect(res.status).toBe('ABSENT');
    });

    it('should flag MISSING_CHECKOUT and mark ABSENT when session is unclosed at cutoff reconciliation', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: null,
        shift: defaultShift,
        policy: defaultPolicy,
        isDayCompleted: true,
        workingDate: '2026-10-09',
      });

      expect(res.isMissingCheckout).toBe(true);
      expect(res.grossMinutes).toBe(0);
      expect(res.status).toBe('ABSENT');
    });

    it('should return PENDING status when session is still open during active day', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: null,
        shift: defaultShift,
        policy: defaultPolicy,
        isDayCompleted: false,
        workingDate: '2026-10-09',
      });

      expect(res.status).toBe('PENDING');
      expect(res.isMissingCheckout).toBe(false);
    });

    it('should cap break deduction at maxDailyBreakMinutes', () => {
      const checkIn = new Date('2026-10-09T03:30:00.000Z');
      const checkOut = new Date('2026-10-09T12:30:00.000Z'); // 540 mins

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: defaultShift,
        policy: { ...defaultPolicy, maxDailyBreakMinutes: 60 },
        totalBreakMinutes: 120, // Excess breaks taken (2 hrs)
        workingDate: '2026-10-09',
      });

      expect(res.breakDeductionMinutes).toBe(60); // Capped at 60
      expect(res.netWorkMinutes).toBe(480);
    });

    it('should evaluate overnight shift work times accurately across midnight', () => {
      const nightShift: ShiftTimingSpec = {
        startTime: '22:00',
        endTime: '06:00',
        isOvernight: true,
      };

      // Check-in: Oct 9 22:00 IST (16:30 UTC), Check-out: Oct 10 06:00 IST (00:30 UTC) = 480 mins
      const checkIn = new Date('2026-10-09T16:30:00.000Z');
      const checkOut = new Date('2026-10-10T00:30:00.000Z');

      const res = evaluateSessionTiming({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        shift: nightShift,
        policy: defaultPolicy,
        totalBreakMinutes: 30,
        workingDate: '2026-10-09',
      });

      expect(res.grossMinutes).toBe(480);
      expect(res.breakDeductionMinutes).toBe(30);
      expect(res.netWorkMinutes).toBe(450);
      expect(res.status).toBe('PRESENT');
      expect(res.isLate).toBe(false);
    });
  });
});
