import { BadRequestException } from '@nestjs/common';
import { PayrollInputsService } from '../services/payroll-inputs.service';

describe('Phase 11.6: Payroll Inputs, Attendance, Leave, WFH & Lifecycle Integration', () => {
  let service: PayrollInputsService;
  let mockPrisma: any;

  const orgId = 'org-test-1';
  const empId = 'emp-1';
  const period = {
    id: 'period-2026-10',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.999Z'),
    totalDays: 31,
  };

  const defaultEmployee = {
    id: empId,
    employeeCode: 'EMP-001',
    displayName: 'Aarav Sharma',
    joiningDate: new Date('2025-01-01'),
    exitDate: null,
    status: 'ACTIVE',
    employment: {
      branchId: 'branch-blr',
      departmentId: 'dept-eng',
      designationId: 'desig-sde',
    },
    shiftAssignments: [
      {
        shift: {
          id: 'shift-gen',
          name: 'General Shift',
          workDays: [1, 2, 3, 4, 5], // Mon to Fri
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(defaultEmployee),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      wfhRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      officialVisit: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendanceCorrectionRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendanceException: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payrollRun: {
        findFirst: jest.fn(),
      },
      employeePayrollSnapshot: {
        findMany: jest.fn(),
      },
    };

    service = new PayrollInputsService(mockPrisma);
  });

  describe('1. Standard Working, Holidays & Weekly Offs', () => {
    it('should recognize full paid days when employee has standard attendance with no LOP', async () => {
      // 10 working days present, 0 leaves, 0 absences
      mockPrisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          id: 'att-1',
          date: new Date('2026-10-01'),
          status: 'PRESENT',
          totalWorkMinutes: 480,
          updatedAt: new Date('2026-10-01'),
        },
        {
          id: 'att-2',
          date: new Date('2026-10-02'),
          status: 'PRESENT',
          totalWorkMinutes: 490,
          updatedAt: new Date('2026-10-02'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.totalCalendarDays).toBe(31);
      expect(summary.eligibleDaysInPeriod).toBe(31);
      expect(summary.lopDays).toBe(0);
      expect(summary.paidDays).toBe(31);
      expect(summary.treatment).toBe('STANDARD_ATTENDANCE');
      expect(summary.sources.sourceHash).toBeDefined();
    });

    it('should credit recognized holidays as paid days without pay reduction', async () => {
      mockPrisma.holiday.findMany.mockResolvedValue([
        {
          id: 'hol-1',
          date: new Date('2026-10-02'),
          name: 'Gandhi Jayanti',
          updatedAt: new Date('2026-10-01'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.holidays).toBe(1);
      expect(summary.lopDays).toBe(0);
      expect(summary.paidDays).toBe(31);
    });
  });

  describe('2. WFH & Official Visits Recognition (Rule 9: No Unapproved Deductions)', () => {
    it('should recognize approved WFH days as paid working days without pay reduction', async () => {
      mockPrisma.wfhRequest.findMany.mockResolvedValue([
        {
          id: 'wfh-1',
          startDate: new Date('2026-10-05'),
          endDate: new Date('2026-10-07'), // 3 full days
          durationType: 'FULL_DAY',
          status: 'APPROVED',
          updatedAt: new Date('2026-10-04'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.wfhDays).toBe(3);
      expect(summary.recognizedWorkdays).toBeGreaterThanOrEqual(3);
      expect(summary.lopDays).toBe(0);
      expect(summary.paidDays).toBe(31);
      expect(summary.treatment).toBe('REMOTE_AND_FIELD_RECOGNIZED');
    });

    it('should recognize approved Official Visits as paid working days without pay reduction', async () => {
      mockPrisma.officialVisit.findMany.mockResolvedValue([
        {
          id: 'visit-1',
          startDate: new Date('2026-10-12'),
          endDate: new Date('2026-10-14'), // 3 days client site visit
          status: 'APPROVED',
          updatedAt: new Date('2026-10-10'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.officialVisitDays).toBe(3);
      expect(summary.lopDays).toBe(0);
      expect(summary.paidDays).toBe(31);
      expect(summary.treatment).toBe('REMOTE_AND_FIELD_RECOGNIZED');
    });
  });

  describe('3. Approved Paid vs Unpaid (LOP) Leaves & Attendance Half-Days', () => {
    it('should distinguish paid leaves from unpaid leaves and only deduct unpaid LOP', async () => {
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'lv-paid',
          startDate: new Date('2026-10-06'),
          endDate: new Date('2026-10-07'), // 2 days paid casual leave
          durationType: 'FULL_DAY',
          leaveType: { isPaid: true, code: 'CL' },
          updatedAt: new Date('2026-10-05'),
        },
        {
          id: 'lv-unpaid',
          startDate: new Date('2026-10-08'),
          endDate: new Date('2026-10-09'), // 2 days unpaid LOP
          durationType: 'FULL_DAY',
          leaveType: { isPaid: false, code: 'LOP' },
          updatedAt: new Date('2026-10-05'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.approvedPaidLeaveDays).toBe(2);
      expect(summary.approvedUnpaidLeaveDays).toBe(2);
      expect(summary.lopDays).toBe(2);
      expect(summary.paidDays).toBe(29); // 31 - 2 LOP
      expect(summary.treatment).toBe('LOP_PRORATED');
    });

    it('should prorate for half-day attendance absence if uncovered by approved leave', async () => {
      mockPrisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          id: 'att-half',
          date: new Date('2026-10-01'),
          status: 'HALF_DAY',
          totalWorkMinutes: 240,
          updatedAt: new Date('2026-10-01'),
        },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.halfDays).toBe(0.5);
      expect(summary.officeWorkedDays).toBe(0.5);
      expect(summary.lopDays).toBe(0.5);
      expect(summary.paidDays).toBe(30.5);
    });
  });

  describe('4. Lifecycle Rules: Mid-Period Joining & Termination', () => {
    it('should prorate eligible days for employees joining mid-period', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...defaultEmployee,
        joiningDate: new Date('2026-10-16T00:00:00.000Z'), // Joined on 16th (16 days active)
      });

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.isMidPeriodJoiner).toBe(true);
      expect(summary.eligibleDaysInPeriod).toBe(16);
      expect(summary.paidDays).toBe(16);
      expect(summary.treatment).toBe('MID_PERIOD_JOINER_PRORATION');
      expect(summary.warnings).toContainEqual(
        expect.stringContaining('Mid-period joiner: joined on 2026-10-16'),
      );
    });

    it('should prorate eligible days for employees leaving mid-period', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...defaultEmployee,
        joiningDate: new Date('2025-01-01'),
        exitDate: new Date('2026-10-10T23:59:59.000Z'), // Exited on 10th (10 days active)
      });

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.isMidPeriodLeaver).toBe(true);
      expect(summary.eligibleDaysInPeriod).toBe(10);
      expect(summary.paidDays).toBe(10);
      expect(summary.treatment).toBe('MID_PERIOD_LEAVER_PRORATION');
    });

    it('should return 0 eligible days if employee exited before period start', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...defaultEmployee,
        exitDate: new Date('2026-09-30'), // Exited before period
      });

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.eligibleDaysInPeriod).toBe(0);
      expect(summary.paidDays).toBe(0);
      expect(summary.isException).toBe(true);
      expect(summary.treatment).toBe('INELIGIBLE_FOR_PERIOD');
    });
  });

  describe('5. Unresolved Exceptions & Missing Attendance Safety', () => {
    it('should not arbitrarily deduct pay for missing attendance but surface exception and warnings', async () => {
      // 0 attendance records for the month -> missing attendance
      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.missingAttendanceDays).toBeGreaterThan(0);
      expect(summary.isException).toBe(true);
      expect(summary.lopDays).toBe(0); // Rule 9: Do not assume missing attendance reduces pay
      expect(summary.paidDays).toBe(31);
      expect(summary.warnings).toContainEqual(
        expect.stringContaining('No automatic pay reduction applied'),
      );
    });

    it('should flag unresolved attendance exceptions and pending corrections', async () => {
      mockPrisma.attendanceCorrectionRequest.findMany.mockResolvedValue([
        { id: 'corr-1', status: 'PENDING', date: new Date('2026-10-05'), updatedAt: new Date() },
      ]);
      mockPrisma.attendanceException.findMany.mockResolvedValue([
        { id: 'exc-1', isResolved: false, date: new Date('2026-10-08'), updatedAt: new Date() },
      ]);

      const summary = await service.getEmployeeWorkSummary(orgId, empId, period);

      expect(summary.unresolvedExceptionCount).toBe(2);
      expect(summary.isException).toBe(true);
      expect(summary.sources.unresolvedExceptionIds).toEqual(['corr-1', 'exc-1']);
    });
  });

  describe('6. Late Source Changes Detection & State Enforcement', () => {
    it('should detect late-arriving attendance and leave changes after snapshot calculation', async () => {
      const calcTime = new Date('2026-10-20T10:00:00.000Z');
      const lateTime = new Date('2026-10-21T14:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'REVIEW_PENDING',
        period,
      });

      mockPrisma.employeePayrollSnapshot.findMany.mockResolvedValue([
        {
          id: 'snap-1',
          employeeId: empId,
          employeeCode: 'EMP-001',
          employeeName: 'Aarav Sharma',
          updatedAt: calcTime,
          calculationInputSnapshot: {},
        },
      ]);

      // Late leave approval arrived after calcTime
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'lv-late-1',
          startDate: new Date('2026-10-15'),
          status: 'APPROVED',
          chargeableDays: 1,
          updatedAt: lateTime,
        },
      ]);

      const report = await service.detectLateSourceChanges(orgId, 'run-1');

      expect(report.totalLateChanges).toBe(1);
      expect(report.affectedEmployeesCount).toBe(1);
      expect(report.requiresRecalculation).toBe(true);
      expect(report.requiresCorrectionRun).toBe(false);
      expect(report.changes[0].sourceType).toBe('LEAVE');
    });

    it('should require a controlled correction run if late changes occur on a LOCKED or PUBLISHED payroll run', async () => {
      const calcTime = new Date('2026-10-20T10:00:00.000Z');
      const lateTime = new Date('2026-10-22T09:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'run-locked',
        status: 'LOCKED',
        period,
      });

      mockPrisma.employeePayrollSnapshot.findMany.mockResolvedValue([
        {
          id: 'snap-1',
          employeeId: empId,
          employeeCode: 'EMP-001',
          employeeName: 'Aarav Sharma',
          updatedAt: calcTime,
          calculationInputSnapshot: {},
        },
      ]);

      mockPrisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          id: 'att-late',
          date: new Date('2026-10-10'),
          status: 'PRESENT',
          totalWorkMinutes: 480,
          updatedAt: lateTime,
        },
      ]);

      const report = await service.detectLateSourceChanges(orgId, 'run-locked');

      expect(report.totalLateChanges).toBe(1);
      expect(report.requiresRecalculation).toBe(false);
      expect(report.requiresCorrectionRun).toBe(true); // Locked run requires correction run
    });
  });
});
