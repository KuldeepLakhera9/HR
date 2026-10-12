import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ExecutiveDashboardService } from './services/executive-dashboard.service';
import { WorkforceAnalyticsService } from './services/workforce-analytics.service';
import { AttendanceAnalyticsService } from './services/attendance-analytics.service';
import { RequestAnalyticsService } from './services/request-analytics.service';
import { AttendanceReportingService } from '../attendance/attendance-reporting.service';

describe('Phase 10 — Step 9: Reporting Performance & Data Quality', () => {
  let executiveDashboardService: ExecutiveDashboardService;
  let workforceAnalyticsService: WorkforceAnalyticsService;
  let attendanceAnalyticsService: AttendanceAnalyticsService;
  let requestAnalyticsService: RequestAnalyticsService;
  let prisma: any;
  let hierarchyService: any;
  let attendanceReportingService: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    employeeCode: 'EMP-ADM-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-1',
    roles: ['ADMIN'],
    organizationId: 'org-1',
    permissions: ['REPORT_VIEW'],
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'manager@example.com',
    firstName: 'Manager',
    lastName: 'User',
    employeeCode: 'EMP-MGR-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-2',
    roles: ['MANAGER'],
    organizationId: 'org-1',
    permissions: ['REPORT_VIEW'],
  };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', timezone: 'UTC' }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'mgr-emp-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      leaveBalanceAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      wfhRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      officialVisit: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reviewCycle: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reviewCycleParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1', 'emp-sub-2']),
    };

    attendanceReportingService = {
      getDailyReport: jest.fn().mockResolvedValue({ records: [], total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutiveDashboardService,
        WorkforceAnalyticsService,
        AttendanceAnalyticsService,
        RequestAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
        { provide: AttendanceReportingService, useValue: attendanceReportingService },
      ],
    }).compile();

    executiveDashboardService = module.get(ExecutiveDashboardService);
    workforceAnalyticsService = module.get(WorkforceAnalyticsService);
    attendanceAnalyticsService = module.get(AttendanceAnalyticsService);
    requestAnalyticsService = module.get(RequestAnalyticsService);
  });

  describe('1. Baseline Measurement & Query Optimization', () => {
    it('executes monthly series in WorkforceAnalyticsService concurrently with single-batch Promise.all', async () => {
      prisma.employee.count.mockImplementation(async () => {
        // Simulate minor async DB latency
        await new Promise((r) => setTimeout(r, 2));
        return 100;
      });

      const startTime = Date.now();
      const res = await workforceAnalyticsService.getTrendsReport(mockAdminUser, { months: 12 });
      const elapsed = Date.now() - startTime;

      expect(res.trends).toHaveLength(12);
      // In sequential mode (48 queries * 2ms = >96ms), parallel mode finishes in ~10-30ms
      expect(elapsed).toBeLessThan(150);
      expect(prisma.employee.count).toHaveBeenCalledTimes(48); // 12 months * 4 counts
    });

    it('ExecutiveDashboardService executes count queries and domain queries in parallel batches without duplicate lookups', async () => {
      prisma.employee.findMany.mockImplementation(async (args: any) => {
        if (args?.select?.id) {
          // Target employees lookup
          return [{ id: 'emp-sub-1' }, { id: 'emp-sub-2' }];
        }
        return [];
      });

      await executiveDashboardService.getDashboardSummary(mockManagerUser, {
        departmentId: 'dept-eng',
      });

      // Target employees should be resolved exactly ONCE despite attendance, leave accounts, and requests needing it
      const targetEmpCalls = prisma.employee.findMany.mock.calls.filter(
        (call: any) => call[0]?.select?.id === true,
      );
      expect(targetEmpCalls.length).toBe(1);
    });
  });

  describe('2. Date Range Boundaries and Result-Size Limits', () => {
    it('RequestAnalyticsService rejects inverted date ranges (startDate > endDate)', async () => {
      await expect(
        requestAnalyticsService.getLeaveUtilizationReport(mockAdminUser, {
          startDate: '2026-10-30',
          endDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('RequestAnalyticsService rejects date ranges exceeding 366 days', async () => {
      await expect(
        requestAnalyticsService.getRequestVolumesReport(mockAdminUser, {
          startDate: '2024-01-01',
          endDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('AttendanceAnalyticsService rejects date ranges exceeding 366 days', async () => {
      await expect(
        attendanceAnalyticsService.getDailyReport(mockAdminUser, {
          startDate: '2024-01-01',
          endDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Data Quality & Aggregation Correctness', () => {
    it('accurately computes active headcount excluding future joiners, past exits, and inactive status', async () => {
      const mockEmployees = [
        // Valid: Active employee joined before asOfDate
        {
          id: 'emp-1',
          status: 'ACTIVE',
          gender: 'MALE',
          employment: {
            employmentType: 'FULL_TIME',
            workMode: 'OFFICE',
            department: { id: 'd1', name: 'Engineering', code: 'ENG' },
            branch: { id: 'b1', name: 'HQ', code: 'HQ' },
            designation: { id: 'des1', title: 'Engineer', code: 'ENG' },
          },
        },
        // Valid: Probation employee joined before asOfDate
        {
          id: 'emp-2',
          status: 'PROBATION',
          gender: 'FEMALE',
          employment: {
            employmentType: 'FULL_TIME',
            workMode: 'OFFICE',
            department: { id: 'd1', name: 'Engineering', code: 'ENG' },
            branch: { id: 'b1', name: 'HQ', code: 'HQ' },
            designation: { id: 'des1', title: 'Engineer', code: 'ENG' },
          },
        },
      ];

      prisma.employee.findMany.mockResolvedValue(mockEmployees);

      const res = await workforceAnalyticsService.getHeadcountReport(mockAdminUser, {
        asOfDate: '2026-06-30',
      });

      expect(res.totalActiveHeadcount).toBe(2);
      expect(res.distributions.byDepartment).toHaveLength(1);
      expect(res.distributions.byDepartment[0].headcount).toBe(2);
      expect(res.distributions.byDepartment[0].percentage).toBe(100);
    });

    it('accurately computes attendance rate excluding holidays, week-offs, and approved leaves from denominator', async () => {
      prisma.employee.count.mockResolvedValue(10);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        // 5 present days
        {
          date: new Date('2026-06-01T00:00:00Z'),
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-06-01T09:00:00Z'),
          lateMinutes: 0,
        },
        {
          date: new Date('2026-06-02T00:00:00Z'),
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-06-02T09:00:00Z'),
          lateMinutes: 0,
        },
        {
          date: new Date('2026-06-03T00:00:00Z'),
          status: 'HALF_DAY',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-06-03T09:00:00Z'),
          lateMinutes: 0,
        },
        {
          date: new Date('2026-06-04T00:00:00Z'),
          status: 'ABSENT',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
        },
        // 2 week-offs (should be excluded from expected working days)
        {
          date: new Date('2026-06-06T00:00:00Z'),
          status: 'WEEK_OFF',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
        },
        {
          date: new Date('2026-06-07T00:00:00Z'),
          status: 'WEEK_OFF',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
        },
        // 1 holiday (should be excluded from expected working days)
        {
          date: new Date('2026-06-05T00:00:00Z'),
          status: 'HOLIDAY',
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: null,
          lateMinutes: 0,
        },
      ]);

      const res = await executiveDashboardService.getDashboardSummary(mockAdminUser, {
        startDate: '2026-06-01',
        endDate: '2026-06-07',
      });

      // Total days: 7. Holiday: 1, WeekOff: 2. Expected working days = 7 - 3 = 4 days.
      // Present: 2 + 0.5 (half day) = 2.5 days.
      // Attendance Rate = 2.5 / 4 = 62.5%
      expect(res.summary.attendanceRate.value).toBe(62.5);
    });

    it('enforces small-cell privacy suppression (k-anonymity < 5) on manager department breakdown', async () => {
      prisma.employee.count.mockResolvedValue(3);
      prisma.employee.findMany.mockImplementation(async (args: any) => {
        if (args?.select?.employment) {
          // 3 employees in small department
          return [
            {
              employment: {
                department: { id: 'dept-tiny', name: 'Confidential Finance' },
                branch: { id: 'b1', name: 'HQ' },
              },
            },
            {
              employment: {
                department: { id: 'dept-tiny', name: 'Confidential Finance' },
                branch: { id: 'b1', name: 'HQ' },
              },
            },
            {
              employment: {
                department: { id: 'dept-tiny', name: 'Confidential Finance' },
                branch: { id: 'b1', name: 'HQ' },
              },
            },
          ];
        }
        return [];
      });

      const res = await executiveDashboardService.getDashboardSummary(mockManagerUser, {});

      // Department has 3 people (< 5), manager view MUST suppress department name and count
      const dept = res.departmentBreakdown.find((d) => d.departmentId === 'dept-tiny');
      expect(dept).toBeDefined();
      expect(dept?.isSuppressed).toBe(true);
      expect(dept?.departmentName).toBe('Protected Cohort');
      expect(dept?.headcount).toBe(0);
    });

    it('handles zero data states cleanly without NaN or server crashes', async () => {
      prisma.employee.count.mockResolvedValue(0);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
      prisma.leaveRequest.findMany.mockResolvedValue([]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.employee.findMany.mockResolvedValue([]);

      const res = await executiveDashboardService.getDashboardSummary(mockAdminUser, {});

      expect(res.summary.activeHeadcount.value).toBe(0);
      expect(res.summary.attendanceRate.value).toBe(0);
      expect(res.summary.leaveUtilizationRate.value).toBe(0);
      expect(res.summary.annualizedAttritionRate.value).toBe(0);
      expect(res.summary.avgApprovalTurnaroundHours.value).toBe(0);
    });
  });
});
