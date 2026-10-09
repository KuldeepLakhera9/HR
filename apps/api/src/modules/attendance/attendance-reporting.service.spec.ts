import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceReportingService } from './attendance-reporting.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceDayStatus } from '@hrms/types';

describe('AttendanceReportingService', () => {
  let service: AttendanceReportingService;
  let prisma: any;

  const mockOrg1 = 'org-tenant-alpha';
  const mockOrg2 = 'org-tenant-beta';

  const mockEmployees = [
    {
      id: 'emp-1',
      organizationId: mockOrg1,
      employeeCode: 'EMP001',
      displayName: 'Alice Engineer',
      user: { email: 'alice@alpha.com' },
      employment: {
        departmentId: 'dept-eng',
        branchId: 'branch-hq',
        department: { id: 'dept-eng', name: 'Engineering' },
        designation: { id: 'desig-lead', title: 'Tech Lead' },
        branch: { id: 'branch-hq', name: 'Headquarters' },
      },
    },
    {
      id: 'emp-2',
      organizationId: mockOrg1,
      employeeCode: 'EMP002',
      displayName: 'Bob Operations',
      user: { email: 'bob@alpha.com' },
      employment: {
        departmentId: 'dept-ops',
        branchId: 'branch-hq',
        department: { id: 'dept-ops', name: 'Operations' },
        designation: { id: 'desig-mgr', title: 'Ops Manager' },
        branch: { id: 'branch-hq', name: 'Headquarters' },
      },
    },
  ];

  const mockShift = {
    id: 'shift-gen',
    name: 'General Shift',
    code: 'GEN',
    startTime: '09:00',
    endTime: '18:00',
  };

  beforeEach(async () => {
    prisma = {
      attendanceDailySummary: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      employee: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReportingService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AttendanceReportingService>(AttendanceReportingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailyReport', () => {
    it('should aggregate daily attendance metrics and enforce multi-tenant isolation', async () => {
      const summaries = [
        {
          id: 'sum-1',
          date: new Date('2026-10-01T00:00:00.000Z'),
          organizationId: mockOrg1,
          employeeId: 'emp-1',
          shiftId: 'shift-gen',
          firstCheckIn: new Date('2026-10-01T09:00:00.000Z'),
          lastCheckOut: new Date('2026-10-01T18:00:00.000Z'),
          totalWorkMinutes: 480,
          totalBreakMinutes: 60,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          status: 'PRESENT' as AttendanceDayStatus,
          isCorrected: false,
          employee: mockEmployees[0],
          shift: mockShift,
        },
        {
          id: 'sum-2',
          date: new Date('2026-10-01T00:00:00.000Z'),
          organizationId: mockOrg1,
          employeeId: 'emp-2',
          shiftId: 'shift-gen',
          firstCheckIn: new Date('2026-10-01T09:20:00.000Z'),
          lastCheckOut: new Date('2026-10-01T18:00:00.000Z'),
          totalWorkMinutes: 460,
          totalBreakMinutes: 60,
          lateMinutes: 20,
          earlyExitMinutes: 0,
          overtimeMinutes: 30,
          status: 'LATE' as AttendanceDayStatus,
          isCorrected: false,
          employee: mockEmployees[1],
          shift: mockShift,
        },
      ];

      // Aggregate projection mock (matches select for aggregations)
      const aggregateData = summaries.map((s) => ({
        id: s.id,
        date: s.date,
        status: s.status,
        totalWorkMinutes: s.totalWorkMinutes,
        totalBreakMinutes: s.totalBreakMinutes,
        lateMinutes: s.lateMinutes,
        earlyExitMinutes: s.earlyExitMinutes,
        overtimeMinutes: s.overtimeMinutes,
        employee: {
          id: s.employee.id,
          employment: {
            departmentId: s.employee.employment.departmentId,
            branchId: s.employee.employment.branchId,
            department: { name: s.employee.employment.department.name },
            branch: { name: s.employee.employment.branch.name },
          },
        },
      }));

      prisma.attendanceDailySummary.findMany
        .mockResolvedValueOnce(summaries) // paginated records query
        .mockResolvedValueOnce(aggregateData); // aggregate data query
      prisma.attendanceDailySummary.count.mockResolvedValue(2);

      const result = await service.getDailyReport(mockOrg1, {
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        page: 1,
        limit: 10,
      });

      // 1. Verify Tenant Isolation in Prisma Where clause
      expect(prisma.attendanceDailySummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrg1,
          }),
        }),
      );

      // 2. Verify summary calculations
      expect(result.summary.totalRecords).toBe(2);
      expect(result.summary.headcount.present).toBe(1);
      expect(result.summary.headcount.late).toBe(1);
      expect(result.summary.headcount.absent).toBe(0);
      expect(result.summary.workingHours.attendanceRate).toBe(100); // (1 present + 1 late) / 2 = 100%
      expect(result.summary.workingHours.onTimeRate).toBe(50); // 1 on-time out of 2 attended = 50%
      expect(result.summary.workingHours.totalWorkHours).toBe(15.67); // (480 + 460) / 60 = 15.666... -> 15.67
      expect(result.summary.workingHours.avgWorkHours).toBe(7.83); // 15.666 / 2 = 7.83
      expect(result.summary.workingHours.avgLateMinutes).toBe(20); // 20 / 1 late record

      // 3. Verify MIS Aggregations
      expect(result.aggregations.byDate).toHaveLength(1);
      expect(result.aggregations.byDate[0].date).toBe('2026-10-01');
      expect(result.aggregations.byDepartment).toHaveLength(2);
      expect(result.aggregations.byBranch).toHaveLength(1);
      expect(result.aggregations.byStatus).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'PRESENT', count: 1, percentage: 50 }),
          expect.objectContaining({ status: 'LATE', count: 1, percentage: 50 }),
        ]),
      );

      // 4. Verify Paginated Records
      expect(result.records).toHaveLength(2);
      expect(result.records[0].employee.displayName).toBe('Alice Engineer');
      expect(result.records[0].workHoursFormatted).toBe('8h 0m');
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('should correctly filter by branch, department, shift, employee, and status', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.attendanceDailySummary.count.mockResolvedValue(0);

      await service.getDailyReport(mockOrg1, {
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        branchId: 'branch-hq',
        departmentId: 'dept-eng',
        shiftId: 'shift-gen',
        employeeId: 'emp-1',
        status: 'PRESENT,LATE',
      });

      const callArgs = prisma.attendanceDailySummary.findMany.mock.calls[0][0];
      expect(callArgs.where.organizationId).toBe(mockOrg1);
      expect(callArgs.where.shiftId).toBe('shift-gen');
      expect(callArgs.where.employeeId).toBe('emp-1');
      expect(callArgs.where.status).toEqual({ in: ['PRESENT', 'LATE'] });
      expect(callArgs.where.employee).toEqual({
        employment: {
          branchId: 'branch-hq',
          departmentId: 'dept-eng',
        },
      });
    });

    it('should return safe zeroed statistics on empty datasets without division errors', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.attendanceDailySummary.count.mockResolvedValue(0);

      const result = await service.getDailyReport(mockOrg1, {
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      });

      expect(result.summary.totalRecords).toBe(0);
      expect(result.summary.workingHours.attendanceRate).toBe(0);
      expect(result.summary.workingHours.onTimeRate).toBe(0);
      expect(result.summary.workingHours.avgWorkHours).toBe(0);
      expect(result.summary.workingHours.avgLateMinutes).toBe(0);
      expect(result.records).toEqual([]);
      expect(result.aggregations.byDate).toEqual([]);
      expect(result.aggregations.byDepartment).toEqual([]);
      expect(result.aggregations.byBranch).toEqual([]);
    });

    it('should guarantee cross-organization isolation when another tenant queries', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.attendanceDailySummary.count.mockResolvedValue(0);

      await service.getDailyReport(mockOrg2, {});

      const callArgs = prisma.attendanceDailySummary.findMany.mock.calls[0][0];
      expect(callArgs.where.organizationId).toBe(mockOrg2);
      expect(callArgs.where.organizationId).not.toBe(mockOrg1);
    });
  });

  describe('getMonthlyReport', () => {
    it('should compute monthly employee summaries, working days, and department aggregations', async () => {
      // 2 employees in org 1
      prisma.employee.count.mockResolvedValue(2);
      prisma.employee.findMany.mockResolvedValue(mockEmployees);

      // Summaries for October 2026
      const octSummaries = [
        // Emp 1: 20 present days, 0 late
        ...Array.from({ length: 20 }).map((_, i) => ({
          id: `sum-emp1-${i + 1}`,
          organizationId: mockOrg1,
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 9, i + 1)), // Oct 1..20
          shiftId: 'shift-gen',
          totalWorkMinutes: 480, // 8 hrs
          totalBreakMinutes: 60,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          status: 'PRESENT' as AttendanceDayStatus,
          employee: {
            id: 'emp-1',
            employment: {
              departmentId: 'dept-eng',
              branchId: 'branch-hq',
              department: { name: 'Engineering' },
              branch: { name: 'Headquarters' },
            },
          },
        })),
        // Emp 2: 18 present days, 2 late days, 1 absent day
        ...Array.from({ length: 18 }).map((_, i) => ({
          id: `sum-emp2-pres-${i + 1}`,
          organizationId: mockOrg1,
          employeeId: 'emp-2',
          date: new Date(Date.UTC(2026, 9, i + 1)),
          shiftId: 'shift-gen',
          totalWorkMinutes: 480,
          totalBreakMinutes: 60,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          status: 'PRESENT' as AttendanceDayStatus,
          employee: {
            id: 'emp-2',
            employment: {
              departmentId: 'dept-ops',
              branchId: 'branch-hq',
              department: { name: 'Operations' },
              branch: { name: 'Headquarters' },
            },
          },
        })),
        {
          id: 'sum-emp2-late-1',
          organizationId: mockOrg1,
          employeeId: 'emp-2',
          date: new Date(Date.UTC(2026, 9, 21)),
          shiftId: 'shift-gen',
          totalWorkMinutes: 450,
          totalBreakMinutes: 60,
          lateMinutes: 30,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          status: 'LATE' as AttendanceDayStatus,
          employee: {
            id: 'emp-2',
            employment: {
              departmentId: 'dept-ops',
              branchId: 'branch-hq',
              department: { name: 'Operations' },
              branch: { name: 'Headquarters' },
            },
          },
        },
        {
          id: 'sum-emp2-absent-1',
          organizationId: mockOrg1,
          employeeId: 'emp-2',
          date: new Date(Date.UTC(2026, 9, 22)),
          shiftId: 'shift-gen',
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          overtimeMinutes: 0,
          status: 'ABSENT' as AttendanceDayStatus,
          employee: {
            id: 'emp-2',
            employment: {
              departmentId: 'dept-ops',
              branchId: 'branch-hq',
              department: { name: 'Operations' },
              branch: { name: 'Headquarters' },
            },
          },
        },
      ];

      prisma.attendanceDailySummary.findMany.mockResolvedValue(octSummaries);

      const result = await service.getMonthlyReport(mockOrg1, {
        month: 10,
        year: 2026,
        page: 1,
        limit: 10,
      });

      // 1. Verify Period & Calendar calculation
      expect(result.period.month).toBe(10);
      expect(result.period.year).toBe(2026);
      expect(result.period.daysInMonth).toBe(31);
      // October 2026 has 22 working days (Monday-Friday)
      expect(result.period.workingDaysCount).toBe(22);

      // 2. Verify Employee summaries
      expect(result.employeeSummaries).toHaveLength(2);
      const alice = result.employeeSummaries.find((e) => e.employee.id === 'emp-1');
      expect(alice).toBeDefined();
      expect(alice?.presentDays).toBe(20);
      expect(alice?.lateArrivalsCount).toBe(0);
      expect(alice?.totalWorkHours).toBe(160); // 20 * 8 hrs

      const bob = result.employeeSummaries.find((e) => e.employee.id === 'emp-2');
      expect(bob).toBeDefined();
      expect(bob?.presentDays).toBe(19); // 18 on-time + 1 late
      expect(bob?.lateArrivalsCount).toBe(1);
      expect(bob?.absentDays).toBe(1);

      // 3. Verify Aggregations
      expect(result.aggregations.byDepartment).toHaveLength(2);
      expect(result.aggregations.byBranch).toHaveLength(1);
      // Daily trend covers all 31 days of October
      expect(result.aggregations.dailyTrend).toHaveLength(31);
      expect(result.aggregations.dailyTrend[0].date).toBe('2026-10-01');

      // 4. Verify Summary Rollup
      expect(result.summary.totalEmployees).toBe(2);
      expect(result.summary.totalPresentDays).toBe(39); // 20 + 19
      expect(result.summary.totalLateCount).toBe(1);
      expect(result.summary.totalAbsentDays).toBe(1);
      expect(result.summary.totalWorkHours).toBeGreaterThan(0);
    });

    it('should properly isolate tenants in monthly query', async () => {
      prisma.employee.count.mockResolvedValue(0);
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);

      await service.getMonthlyReport(mockOrg2, { month: 5, year: 2026 });

      expect(prisma.employee.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: mockOrg2 }),
        }),
      );
      expect(prisma.attendanceDailySummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: mockOrg2 }),
        }),
      );
    });
  });
});
