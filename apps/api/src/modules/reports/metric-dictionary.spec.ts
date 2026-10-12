import {
  MetricDefinitionDto,
  ExecutiveDashboardSummaryDto,
  WorkforceHeadcountAnalyticsDto,
} from '@hrms/types';

describe('Phase 10 — Step 1: Metric Dictionary & Data Definitions Specification Tests', () => {
  describe('M-WF-01: Active Headcount Calculation Engine', () => {
    interface EmployeeSample {
      id: string;
      status: string;
      isActive: boolean;
      joiningDate: string;
      exitDate: string | null;
      deletedAt: string | null;
    }

    function calculateActiveHeadcount(employees: EmployeeSample[], asOfDateStr: string): number {
      const asOf = new Date(asOfDateStr).getTime();
      const validStatuses = new Set(['ACTIVE', 'PROBATION', 'ON_NOTICE']);

      return employees.filter((e) => {
        if (!e.isActive || e.deletedAt !== null) return false;
        if (!validStatuses.has(e.status)) return false;
        const joinTime = new Date(e.joiningDate).getTime();
        if (joinTime > asOf) return false;
        if (e.exitDate) {
          const exitTime = new Date(e.exitDate).getTime();
          if (exitTime <= asOf) return false;
        }
        return true;
      }).length;
    }

    it('correctly includes ACTIVE, PROBATION, and ON_NOTICE employees who joined on or before asOfDate', () => {
      const employees: EmployeeSample[] = [
        {
          id: '1',
          status: 'ACTIVE',
          isActive: true,
          joiningDate: '2026-01-01',
          exitDate: null,
          deletedAt: null,
        },
        {
          id: '2',
          status: 'PROBATION',
          isActive: true,
          joiningDate: '2026-06-01',
          exitDate: null,
          deletedAt: null,
        },
        {
          id: '3',
          status: 'ON_NOTICE',
          isActive: true,
          joiningDate: '2026-01-01',
          exitDate: '2026-11-30',
          deletedAt: null,
        }, // Future exit
        {
          id: '4',
          status: 'EXITED',
          isActive: false,
          joiningDate: '2025-01-01',
          exitDate: '2026-05-01',
          deletedAt: null,
        }, // Past exit
        {
          id: '5',
          status: 'TERMINATED',
          isActive: false,
          joiningDate: '2026-02-01',
          exitDate: '2026-08-01',
          deletedAt: null,
        },
        {
          id: '6',
          status: 'ACTIVE',
          isActive: true,
          joiningDate: '2026-11-01',
          exitDate: null,
          deletedAt: null,
        }, // Future join
        {
          id: '7',
          status: 'ACTIVE',
          isActive: false,
          joiningDate: '2026-01-01',
          exitDate: null,
          deletedAt: null,
        }, // Inactive
        {
          id: '8',
          status: 'ACTIVE',
          isActive: true,
          joiningDate: '2026-01-01',
          exitDate: null,
          deletedAt: '2026-09-01',
        }, // Soft-deleted
      ];

      const count = calculateActiveHeadcount(employees, '2026-10-12');
      expect(count).toBe(3); // id 1, 2, 3
    });
  });

  describe('M-WF-03: Annualized Attrition Rate Formula', () => {
    function calculateAnnualizedAttritionRate(
      periodExits: number,
      startHeadcount: number,
      endHeadcount: number,
      periodDays: number,
    ): number {
      const avgHeadcount = (startHeadcount + endHeadcount) / 2;
      if (avgHeadcount <= 0 || periodDays <= 0) {
        return 0.0;
      }
      const rawRate = (periodExits / avgHeadcount) * (365.25 / periodDays) * 100;
      return Math.round(rawRate * 100) / 100; // Round to 2 decimal places
    }

    it('calculates deterministic annualized attrition rate matching specification', () => {
      // 4 exits over 181 days with average headcount of 102
      const rate = calculateAnnualizedAttritionRate(4, 100, 104, 181);
      expect(rate).toBe(7.91);
    });

    it('safely handles zero headcount or zero period days without division by zero', () => {
      expect(calculateAnnualizedAttritionRate(0, 0, 0, 30)).toBe(0.0);
      expect(calculateAnnualizedAttritionRate(5, 100, 100, 0)).toBe(0.0);
    });
  });

  describe('M-ATT-01: Attendance Rate & Working Days Denominator', () => {
    interface AttendanceSummaryRecord {
      status: string;
    }

    function calculateAttendanceRate(summaries: AttendanceSummaryRecord[]): {
      rate: number;
      expectedWorkingDays: number;
      presentEquivalentDays: number;
    } {
      let presentCount = 0;
      let halfDayCount = 0;
      let holidayCount = 0;
      let weekOffCount = 0;
      let leaveCount = 0;

      for (const s of summaries) {
        if (s.status === 'PRESENT') presentCount++;
        else if (s.status === 'HALF_DAY') halfDayCount++;
        else if (s.status === 'HOLIDAY') holidayCount++;
        else if (s.status === 'WEEK_OFF' || s.status === 'WEEKEND_OFF') weekOffCount++;
        else if (s.status === 'ON_LEAVE') leaveCount++;
      }

      const totalEvaluated = summaries.length;
      const expectedWorkingDays = totalEvaluated - (holidayCount + weekOffCount + leaveCount);

      if (expectedWorkingDays <= 0) {
        return { rate: 0.0, expectedWorkingDays: 0, presentEquivalentDays: 0 };
      }

      const presentEquivalentDays = presentCount + halfDayCount * 0.5;
      const rate = Math.round((presentEquivalentDays / expectedWorkingDays) * 1000) / 10;

      return { rate, expectedWorkingDays, presentEquivalentDays };
    }

    it('calculates attendance rate with approved leaves deducted from denominator', () => {
      const records: AttendanceSummaryRecord[] = [
        ...Array(20).fill({ status: 'PRESENT' }),
        ...Array(2).fill({ status: 'HALF_DAY' }),
        { status: 'ABSENT' },
        ...Array(2).fill({ status: 'ON_LEAVE' }),
        ...Array(5).fill({ status: 'WEEK_OFF' }),
      ];

      const result = calculateAttendanceRate(records);
      expect(result.expectedWorkingDays).toBe(23); // 30 - (5 + 2)
      expect(result.presentEquivalentDays).toBe(21.0); // 20 + (2 * 0.5)
      expect(result.rate).toBe(91.3);
    });
  });

  describe('M-ATT-02: On-Time Arrival Compliance', () => {
    function calculateOnTimeRate(records: Array<{ lateMinutes: number; firstCheckIn: boolean }>) {
      const punches = records.filter((r) => r.firstCheckIn);
      if (punches.length === 0) return 0.0;
      const onTime = punches.filter((r) => r.lateMinutes === 0).length;
      return Math.round((onTime / punches.length) * 1000) / 10;
    }

    it('evaluates punctuality strictly against zero late minutes', () => {
      const data = [
        ...Array(88).fill({ lateMinutes: 0, firstCheckIn: true }),
        ...Array(12).fill({ lateMinutes: 15, firstCheckIn: true }),
      ];
      expect(calculateOnTimeRate(data)).toBe(88.0);
    });
  });

  describe('M-LV-01: Approved Leave Utilization', () => {
    function calculateLeaveUtilization(
      allocatedDays: number,
      requests: Array<{ status: string; chargeableDays: number }>,
    ) {
      if (allocatedDays <= 0) return 0.0;
      const approvedConsumed = requests
        .filter((r) => r.status === 'APPROVED')
        .reduce((sum, r) => sum + r.chargeableDays, 0);

      return Math.round((approvedConsumed / allocatedDays) * 1000) / 10;
    }

    it('counts ONLY approved requests and uses authoritative chargeableDays', () => {
      const requests = [
        { status: 'APPROVED', chargeableDays: 3.0 },
        { status: 'APPROVED', chargeableDays: 1.5 },
        { status: 'SUBMITTED', chargeableDays: 2.0 }, // Excluded (pending)
        { status: 'REJECTED', chargeableDays: 4.0 }, // Excluded
        { status: 'CANCELLED', chargeableDays: 1.0 }, // Excluded
      ];

      const rate = calculateLeaveUtilization(18.0, requests);
      expect(rate).toBe(25.0); // 4.5 / 18.0 = 25%
    });
  });

  describe('M-WF-01: Approval Turnaround Time (TAT) & SLA Aging', () => {
    function calculateAverageTAT(
      decisions: Array<{ createdAt: string; decidedAt: string; status: string }>,
    ) {
      const completed = decisions.filter((d) => d.status === 'APPROVED' || d.status === 'REJECTED');
      if (completed.length === 0) return 0.0;

      const totalHours = completed.reduce((sum, d) => {
        const diffMs = new Date(d.decidedAt).getTime() - new Date(d.createdAt).getTime();
        return sum + diffMs / (1000 * 60 * 60);
      }, 0);

      return Math.round((totalHours / completed.length) * 10) / 10;
    }

    function calculateAgingBuckets(pendingRequests: Array<{ createdAt: string }>, nowStr: string) {
      const now = new Date(nowStr).getTime();
      let under24 = 0;
      let between24And48 = 0;
      let between48And72 = 0;
      let over72 = 0;

      for (const r of pendingRequests) {
        const ageHours = (now - new Date(r.createdAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < 24) under24++;
        else if (ageHours < 48) between24And48++;
        else if (ageHours < 72) between48And72++;
        else over72++;
      }

      const total = pendingRequests.length;
      const slaBreached = between48And72 + over72;
      const slaBreachRatio = total > 0 ? Math.round((slaBreached / total) * 1000) / 10 : 0.0;

      return {
        under24,
        between24And48,
        between48And72,
        over72,
        slaBreachRatio,
      };
    }

    it('calculates exact decimal hour turnaround time across resolved decisions', () => {
      const decisions = [
        {
          createdAt: '2026-10-01T10:00:00Z',
          decidedAt: '2026-10-01T14:00:00Z',
          status: 'APPROVED',
        }, // 4h
        {
          createdAt: '2026-10-01T09:00:00Z',
          decidedAt: '2026-10-01T21:00:00Z',
          status: 'APPROVED',
        }, // 12h
        {
          createdAt: '2026-10-01T12:00:00Z',
          decidedAt: '2026-10-02T12:00:00Z',
          status: 'REJECTED',
        }, // 24h
        { createdAt: '2026-10-01T12:00:00Z', decidedAt: '', status: 'SUBMITTED' }, // Pending excluded
      ];

      expect(calculateAverageTAT(decisions)).toBe(13.3);
    });

    it('partitions pending backlog into strict aging buckets and computes SLA breach ratio', () => {
      const now = '2026-10-10T12:00:00Z';
      const pending = [
        { createdAt: '2026-10-10T02:00:00Z' }, // 10h -> under24
        { createdAt: '2026-10-09T00:00:00Z' }, // 36h -> 24-48
        { createdAt: '2026-10-08T00:00:00Z' }, // 60h -> 48-72 (breached)
        { createdAt: '2026-10-06T00:00:00Z' }, // 108h -> over72 (breached)
      ];

      const aging = calculateAgingBuckets(pending, now);
      expect(aging.under24).toBe(1);
      expect(aging.between24And48).toBe(1);
      expect(aging.between48And72).toBe(1);
      expect(aging.over72).toBe(1);
      expect(aging.slaBreachRatio).toBe(50.0); // 2 of 4 breached
    });
  });

  describe('M-PM-01: Performance Review Cycle Completion Rate', () => {
    function calculateCycleCompletionRate(
      participants: Array<{ status: string }>,
      finalizedCount: number,
    ) {
      const eligible = participants.filter(
        (p) => p.status !== 'EXEMPTED' && p.status !== 'WITHDRAWN',
      ).length;

      if (eligible <= 0) return 0.0;
      return Math.round((finalizedCount / eligible) * 1000) / 10;
    }

    it('excludes exempted participants from denominator', () => {
      const participants = [
        ...Array(48).fill({ status: 'ENROLLED' }),
        ...Array(2).fill({ status: 'EXEMPTED' }),
      ];

      const rate = calculateCycleCompletionRate(participants, 40);
      expect(rate).toBe(83.3); // 40 / 48 = 83.3%
    });
  });

  describe('Privacy Suppression Rule (Small-Cell k < 5)', () => {
    function applySmallCellSuppression<T extends { count: number }>(
      items: T[],
      kThreshold = 5,
    ): { items: Array<T & { isSuppressed: boolean }>; totalSuppressed: number } {
      let totalSuppressed = 0;
      const result = items.map((item) => {
        if (item.count > 0 && item.count < kThreshold) {
          totalSuppressed += item.count;
          return { ...item, isSuppressed: true };
        }
        return { ...item, isSuppressed: false };
      });

      return { items: result, totalSuppressed };
    }

    it('flags cohorts with fewer than 5 members as suppressed', () => {
      const tiers = [
        { label: 'Outstanding', count: 12 },
        { label: 'Needs Improvement', count: 2 }, // k < 5
        { label: 'Meets Expectations', count: 25 },
      ];

      const outcome = applySmallCellSuppression(tiers);
      expect(outcome.items[0].isSuppressed).toBe(false);
      expect(outcome.items[1].isSuppressed).toBe(true);
      expect(outcome.items[2].isSuppressed).toBe(false);
      expect(outcome.totalSuppressed).toBe(2);
    });
  });
});
