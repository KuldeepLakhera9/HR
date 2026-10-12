import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AttendanceReportingService } from '../../attendance/attendance-reporting.service';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('AttendanceAnalyticsService (Attendance Analytics and Exception Reports)', () => {
  let service: AttendanceAnalyticsService;
  let prisma: any;
  let hierarchyService: any;
  let attendanceReportingService: any;

  const mockOrgId = 'org-tenant-alpha';

  const adminUser: AuthenticatedUser = {
    id: 'user-admin',
    email: 'admin@company.com',
    organizationId: mockOrgId,
    roles: ['ADMIN'],
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-ADM',
    firstName: 'Admin',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-admin',
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-manager',
    email: 'manager@company.com',
    organizationId: mockOrgId,
    roles: ['MANAGER'],
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-MGR',
    firstName: 'Manager',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-mgr',
  };

  const employeeUser: AuthenticatedUser = {
    id: 'user-emp',
    email: 'emp@company.com',
    organizationId: mockOrgId,
    roles: ['EMPLOYEE'],
    permissions: [],
    employeeCode: 'EMP-REG',
    firstName: 'Regular',
    lastName: 'Employee',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp',
  };

  const mockManagerEmp = { id: 'emp-mgr-1', userId: 'user-manager', organizationId: mockOrgId };
  const mockTeamIds = ['emp-team-1', 'emp-team-2'];

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
      employee: {
        findFirst: jest.fn(),
      },
      attendanceDailySummary: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      attendanceException: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn(),
    };

    attendanceReportingService = {
      getDailyReport: jest.fn(),
      getMonthlyReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
        { provide: AttendanceReportingService, useValue: attendanceReportingService },
      ],
    }).compile();

    service = module.get<AttendanceAnalyticsService>(AttendanceAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authorization and Scope Scenarios', () => {
    it('rejects regular employees lacking manager or HR roles', async () => {
      await expect(service.resolveScopedEmployeeIds(employeeUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns ORGANIZATION scope for Admin and HR users', async () => {
      const scope = await service.resolveScopedEmployeeIds(adminUser);
      expect(scope.scopeType).toBe('ORGANIZATION');
      expect(scope.scopedEmployeeIds).toBeNull();
    });

    it('scopes Manager to reporting hierarchy team members', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmp);
      hierarchyService.getTeamMemberIds.mockResolvedValue(mockTeamIds);

      const scope = await service.resolveScopedEmployeeIds(managerUser);
      expect(scope.scopeType).toBe('TEAM');
      expect(scope.scopedEmployeeIds).toEqual(mockTeamIds);
      expect(hierarchyService.getTeamMemberIds).toHaveBeenCalledWith(mockManagerEmp.id, mockOrgId);
    });

    it('rejects manager queries targeting employees outside their team', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmp);
      hierarchyService.getTeamMemberIds.mockResolvedValue(mockTeamIds);

      await expect(
        service.getWeeklyReport(managerUser, { employeeId: 'unauthorized-emp' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Weekly Attendance Report Aggregation', () => {
    it('calculates 7-day day-of-week matrix, shifts, and metric dictionary compliance', async () => {
      const mockSummaries = [
        {
          id: 'sum-1',
          date: new Date('2026-10-05T00:00:00.000Z'), // Monday
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          totalWorkMinutes: 480,
          overtimeMinutes: 0,
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            employeeCode: 'EMP001',
            displayName: 'Alice Dev',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des1', title: 'Developer' },
            },
          },
          shift: {
            id: 'shift-1',
            name: 'General Shift',
            code: 'GEN',
            startTime: '09:00',
            endTime: '18:00',
          },
        },
        {
          id: 'sum-2',
          date: new Date('2026-10-05T00:00:00.000Z'), // Monday
          status: 'LATE',
          primaryAttendanceMode: 'WFH',
          totalWorkMinutes: 450,
          overtimeMinutes: 30,
          employeeId: 'emp-team-2',
          employee: {
            id: 'emp-team-2',
            employeeCode: 'EMP002',
            displayName: 'Bob QA',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des2', title: 'QA Engineer' },
            },
          },
          shift: {
            id: 'shift-1',
            name: 'General Shift',
            code: 'GEN',
            startTime: '09:00',
            endTime: '18:00',
          },
        },
        {
          id: 'sum-3',
          date: new Date('2026-10-06T00:00:00.000Z'), // Tuesday
          status: 'HALF_DAY',
          primaryAttendanceMode: 'OFFICE',
          totalWorkMinutes: 240,
          overtimeMinutes: 0,
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            employeeCode: 'EMP001',
            displayName: 'Alice Dev',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des1', title: 'Developer' },
            },
          },
          shift: {
            id: 'shift-1',
            name: 'General Shift',
            code: 'GEN',
            startTime: '09:00',
            endTime: '18:00',
          },
        },
        {
          id: 'sum-4',
          date: new Date('2026-10-06T00:00:00.000Z'), // Tuesday
          status: 'ON_LEAVE',
          primaryAttendanceMode: 'OFFICE',
          totalWorkMinutes: 0,
          overtimeMinutes: 0,
          employeeId: 'emp-team-2',
          employee: {
            id: 'emp-team-2',
            employeeCode: 'EMP002',
            displayName: 'Bob QA',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des2', title: 'QA Engineer' },
            },
          },
          shift: null,
        },
        {
          id: 'sum-5',
          date: new Date('2026-10-10T00:00:00.000Z'), // Saturday (Week Off)
          status: 'WEEK_OFF',
          primaryAttendanceMode: 'OFFICE',
          totalWorkMinutes: 0,
          overtimeMinutes: 0,
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            employeeCode: 'EMP001',
            displayName: 'Alice Dev',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des1', title: 'Developer' },
            },
          },
          shift: null,
        },
      ];

      prisma.attendanceDailySummary.findMany.mockResolvedValue(mockSummaries);

      const result = await service.getWeeklyReport(adminUser, {
        startDate: '2026-10-05',
        endDate: '2026-10-11',
      });

      expect(result.period.startDate).toBe('2026-10-05');
      expect(result.period.endDate).toBe('2026-10-11');
      expect(result.byDayOfWeek).toHaveLength(7);

      // Verify scheduled denominator excludes Week Off:
      // Mon: 1 present + 1 late = 2
      // Tue: 1 half-day + 1 leave = 2
      // Sat: 1 week-off = excluded from scheduled working days
      // Total scheduled = 4
      // Attended equivalent = 1 (present) + 1 (late) + 0.5 (half-day) = 2.5
      // Weekly attendance rate = (2.5 / 4) * 100 = 62.5%
      expect(result.summary.totalScheduledDays).toBe(4);
      expect(result.summary.totalWeekOffDays).toBe(1);
      expect(result.summary.weeklyAttendanceRate).toBe(62.5);

      // On-time rate = 1 on-time / 2 present/late = 50%
      expect(result.summary.onTimeRate).toBe(50);

      // Verify shift breakdown
      expect(result.byShift).toHaveLength(1);
      expect(result.byShift[0].shiftCode).toBe('GEN');
      expect(result.byShift[0].scheduled).toBe(3);

      // Verify employee summaries and mode indicators
      expect(result.employeeSummaries).toHaveLength(2);
      const bobSummary = result.employeeSummaries.find((e) => e.employeeId === 'emp-team-2');
      expect(bobSummary?.modeCounts.wfh).toBe(1);
      expect(bobSummary?.leaveDays).toBe(1);
    });
  });

  describe('Attendance Exception Reports & Incomplete Segregation', () => {
    it('segregates incomplete data from confirmed policy exceptions and computes breakdowns', async () => {
      const mockExceptions = [
        {
          id: 'exc-1',
          date: new Date('2026-10-08T00:00:00.000Z'),
          exceptionType: 'LATE_ARRIVAL',
          severity: 'LOW',
          status: 'RESOLVED',
          resolved: true,
          resolvedAt: new Date('2026-10-08T10:00:00.000Z'),
          resolvedBy: { id: 'u1', email: 'hr@company.com' },
          resolutionNotes: 'Approved traffic delay',
          details: { lateMinutes: 25 },
          createdAt: new Date('2026-10-08T09:30:00.000Z'),
          employee: {
            id: 'emp-team-1',
            employeeCode: 'EMP001',
            displayName: 'Alice Dev',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des1', title: 'Developer' },
            },
          },
        },
        {
          id: 'exc-2',
          date: new Date('2026-10-09T00:00:00.000Z'),
          exceptionType: 'MISSING_CHECKOUT',
          severity: 'HIGH',
          status: 'OPEN',
          resolved: false,
          resolvedAt: null,
          resolvedBy: null,
          resolutionNotes: null,
          details: { firstCheckIn: '2026-10-09T09:00:00.000Z' },
          createdAt: new Date('2026-10-09T20:00:00.000Z'),
          employee: {
            id: 'emp-team-2',
            employeeCode: 'EMP002',
            displayName: 'Bob QA',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
              designation: { id: 'des2', title: 'QA Engineer' },
            },
          },
        },
      ];

      prisma.attendanceException.findMany
        .mockResolvedValueOnce(mockExceptions) // paginated list
        .mockResolvedValueOnce([
          // aggregations projection
          {
            id: 'exc-1',
            exceptionType: 'LATE_ARRIVAL',
            severity: 'LOW',
            status: 'RESOLVED',
            employee: { employment: { department: { id: 'd1', name: 'Engineering' } } },
          },
          {
            id: 'exc-2',
            exceptionType: 'MISSING_CHECKOUT',
            severity: 'HIGH',
            status: 'OPEN',
            employee: { employment: { department: { id: 'd1', name: 'Engineering' } } },
          },
        ]);

      prisma.attendanceException.count.mockResolvedValue(2);
      // Incomplete daily summary count (unfinalized sessions)
      prisma.attendanceDailySummary.count.mockResolvedValue(3);

      const result = await service.getExceptionsReport(adminUser, {
        status: 'ALL',
        page: 1,
        limit: 10,
      });

      expect(result.summary.totalExceptions).toBe(2);
      expect(result.summary.openExceptions).toBe(1);
      expect(result.summary.resolvedExceptions).toBe(1);
      expect(result.summary.highSeverityCount).toBe(1);
      expect(result.summary.unfinalizedIncompleteSessionsCount).toBe(3);

      expect(result.breakdowns.byType).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'LATE_ARRIVAL', count: 1 }),
          expect.objectContaining({ type: 'MISSING_CHECKOUT', count: 1 }),
        ]),
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0].exceptionType).toBe('LATE_ARRIVAL');
      expect(result.items[1].exceptionType).toBe('MISSING_CHECKOUT');
    });
  });
});
