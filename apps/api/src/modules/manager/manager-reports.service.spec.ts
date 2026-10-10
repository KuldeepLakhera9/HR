import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ManagerReportsService } from './manager-reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ReportFormat, ReportScope } from './dto/manager-reports-query.dto';

describe('ManagerReportsService', () => {
  let service: ManagerReportsService;
  let prisma: any;
  let hierarchyService: any;

  const mockOrgId = 'org-100';

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'priya.sharma@peopleos.local',
    firstName: 'Priya',
    lastName: 'Sharma',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
    roles: ['MANAGER'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW'],
    organizationId: mockOrgId,
  };

  const mockNonManagerUser: AuthenticatedUser = {
    id: 'user-emp-regular',
    email: 'emp@peopleos.local',
    firstName: 'Regular',
    lastName: 'Staff',
    employeeCode: 'EMP999',
    status: 'ACTIVE' as any,
    sessionId: 'sess-2',
    roles: ['EMPLOYEE'],
    permissions: ['ATTENDANCE_VIEW'],
    organizationId: mockOrgId,
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    userId: 'user-mgr-1',
    displayName: 'Priya Sharma (Manager)',
    employeeCode: 'MGR001',
    organizationId: mockOrgId,
  };

  const mockSubordinate1 = {
    id: 'emp-sub-1',
    employeeCode: 'EMP001',
    displayName: 'Aarav Gupta',
    employment: {
      department: { name: 'Engineering' },
      designation: { title: 'Backend Developer' },
      branch: { name: 'Main HQ' },
    },
  };

  const mockSubordinate2 = {
    id: 'emp-sub-2',
    employeeCode: 'EMP002',
    displayName: 'Bhavna Patel',
    employment: {
      department: { name: 'Quality Assurance' },
      designation: { title: 'QA Engineer' },
      branch: { name: 'Main HQ' },
    },
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
      holiday: {
        count: jest.fn().mockResolvedValue(1),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalWorkMinutes: 0,
            overtimeMinutes: 0,
            lateMinutes: 0,
            earlyExitMinutes: 0,
          },
          _count: { _all: 0 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendanceException: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
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
    };

    hierarchyService = {
      getTeam: jest.fn().mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockSubordinate1],
        indirectReports: [mockSubordinate2],
        allMemberIds: ['emp-sub-1', 'emp-sub-2'],
        totalTeamSize: 2,
      }),
      getDirectReports: jest.fn().mockResolvedValue([mockSubordinate1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagerReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<ManagerReportsService>(ManagerReportsService);
  });

  describe('Scope & Hierarchy Boundary Enforcement', () => {
    it('should throw ForbiddenException if authenticated user has no manager profile and is not HR/Admin', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveManagerTeamScope(mockNonManagerUser, ReportScope.ALL),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should resolve full hierarchy scope by default', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);

      const scope = await service.resolveManagerTeamScope(mockManagerUser, ReportScope.ALL);
      expect(scope.teamMemberIds).toEqual(['emp-sub-1', 'emp-sub-2']);
      expect(hierarchyService.getTeam).toHaveBeenCalledWith(mockManagerEmployee.id, mockOrgId);
    });

    it('should resolve direct reports scope when DIRECT is requested', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);

      const scope = await service.resolveManagerTeamScope(mockManagerUser, ReportScope.DIRECT);
      expect(scope.teamMemberIds).toEqual(['emp-sub-1']);
      expect(hierarchyService.getDirectReports).toHaveBeenCalledWith(
        mockManagerEmployee.id,
        mockOrgId,
      );
    });

    it('should throw ForbiddenException when querying an employee outside reporting hierarchy', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);

      await expect(
        service.resolveManagerTeamScope(
          mockManagerUser,
          ReportScope.ALL,
          'emp-unauthorized-intruder',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow filtering to an authorized team member within scope', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);

      const scope = await service.resolveManagerTeamScope(
        mockManagerUser,
        ReportScope.ALL,
        'emp-sub-1',
      );
      expect(scope.teamMemberIds).toEqual(['emp-sub-1']);
    });
  });

  describe('Date Validation & Boundary Checks', () => {
    it('should throw BadRequestException for invalid date format', () => {
      expect(() => service.validateDateRange('Asia/Kolkata', '10-10-2026', '2026-10-20')).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if startDate is after endDate', () => {
      expect(() => service.validateDateRange('Asia/Kolkata', '2026-10-25', '2026-10-10')).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if date range exceeds 92 days limit', () => {
      expect(() => service.validateDateRange('Asia/Kolkata', '2026-01-01', '2026-06-01')).toThrow(
        BadRequestException,
      );
    });

    it('should accept valid date range and return diffDays and parsed UTC dates', () => {
      const res = service.validateDateRange('Asia/Kolkata', '2026-10-01', '2026-10-15');
      expect(res.startDateStr).toBe('2026-10-01');
      expect(res.endDateStr).toBe('2026-10-15');
      expect(res.diffDays).toBe(15);
      expect(res.startUtc).toBeInstanceOf(Date);
      expect(res.endUtc).toBeInstanceOf(Date);
    });
  });

  describe('Attendance Report', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
    });

    it('should return server-side aggregations and paginated records for team attendance', async () => {
      prisma.attendanceDailySummary.count.mockResolvedValue(2);
      prisma.attendanceDailySummary.aggregate.mockResolvedValue({
        _sum: {
          totalWorkMinutes: 960,
          overtimeMinutes: 60,
          lateMinutes: 15,
          earlyExitMinutes: 0,
        },
        _count: { _all: 2 },
      });
      prisma.attendanceDailySummary.groupBy.mockImplementation(({ by }: any) => {
        if (by[0] === 'status') {
          return Promise.resolve([
            { status: 'PRESENT', _count: { _all: 1 } },
            { status: 'LATE', _count: { _all: 1 } },
          ]);
        }
        if (by[0] === 'primaryAttendanceMode') {
          return Promise.resolve([{ primaryAttendanceMode: 'OFFICE', _count: { _all: 2 } }]);
        }
        return Promise.resolve([]);
      });

      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          date: new Date('2026-10-01T00:00:00.000Z'),
          firstCheckIn: new Date('2026-10-01T09:05:00.000Z'),
          lastCheckOut: new Date('2026-10-01T17:30:00.000Z'),
          totalWorkMinutes: 505,
          totalBreakMinutes: 45,
          lateMinutes: 5,
          earlyExitMinutes: 0,
          overtimeMinutes: 25,
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          isCorrected: false,
          employee: mockSubordinate1,
          shift: { name: 'Morning Shift', startTime: '09:00', endTime: '17:30' },
        },
      ]);

      const result: any = await service.getTeamAttendanceReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe('ATTENDANCE');
      expect(result.aggregations.totalRecords).toBe(2);
      expect(result.aggregations.totalWorkHours).toBe(16); // 960 / 60
      expect(result.aggregations.totalOvertimeHours).toBe(1); // 60 / 60
      expect(result.aggregations.statusCounts['PRESENT']).toBe(1);
      expect(result.aggregations.statusCounts['LATE']).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].employeeCode).toBe('EMP001');
      expect(result.items[0].department).toBe('Engineering');
    });

    it('should generate valid RFC 4180 CSV export when format is csv', async () => {
      prisma.attendanceDailySummary.count.mockResolvedValue(1);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          date: new Date('2026-10-01T00:00:00.000Z'),
          firstCheckIn: new Date('2026-10-01T09:05:00.000Z'),
          lastCheckOut: new Date('2026-10-01T17:30:00.000Z'),
          totalWorkMinutes: 505,
          totalBreakMinutes: 45,
          lateMinutes: 5,
          earlyExitMinutes: 0,
          overtimeMinutes: 25,
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
          isCorrected: false,
          employee: mockSubordinate1,
          shift: { name: 'Morning Shift', startTime: '09:00', endTime: '17:30' },
        },
      ]);

      const result: any = await service.getTeamAttendanceReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: ReportFormat.CSV,
      });

      expect(result.success).toBe(true);
      expect(result.data.csv).toContain('Record ID,Date,Employee Code,Employee Name');
      expect(result.data.csv).toContain('"Aarav Gupta"');
      expect(result.data.filename).toBe('team-attendance-report-2026-10-01-to-2026-10-10.csv');
      expect(result.data.totalRecords).toBe(1);
    });
  });

  describe('Exception Report', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
    });

    it('should aggregate exception events by type, severity, and status', async () => {
      prisma.attendanceException.count.mockResolvedValue(2);
      prisma.attendanceException.groupBy.mockImplementation(({ by }: any) => {
        if (by[0] === 'exceptionType') {
          return Promise.resolve([
            { exceptionType: 'LATE_ARRIVAL', _count: { _all: 1 } },
            { exceptionType: 'MISSING_CHECK_OUT', _count: { _all: 1 } },
          ]);
        }
        if (by[0] === 'severity') {
          return Promise.resolve([{ severity: 'MEDIUM', _count: { _all: 2 } }]);
        }
        if (by[0] === 'status') {
          return Promise.resolve([
            { status: 'OPEN', _count: { _all: 1 } },
            { status: 'RESOLVED', _count: { _all: 1 } },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.attendanceException.findMany.mockResolvedValue([
        {
          id: 'exc-1',
          date: new Date('2026-10-02T00:00:00.000Z'),
          exceptionType: 'LATE_ARRIVAL',
          severity: 'MEDIUM',
          status: 'OPEN',
          resolved: false,
          resolvedAt: null,
          resolutionNotes: null,
          details: { lateMinutes: 35 },
          employee: mockSubordinate1,
          resolvedBy: null,
        },
      ]);

      const result: any = await service.getTeamExceptionReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe('EXCEPTIONS');
      expect(result.aggregations.totalExceptions).toBe(2);
      expect(result.aggregations.byType['LATE_ARRIVAL']).toBe(1);
      expect(result.aggregations.byType['MISSING_CHECK_OUT']).toBe(1);
      expect(result.aggregations.bySeverity['MEDIUM']).toBe(2);
      expect(result.aggregations.openCount).toBe(1);
      expect(result.aggregations.resolvedCount).toBe(1);
      expect(result.items[0].employeeName).toBe('Aarav Gupta');
    });

    it('should generate formatted CSV export for team exceptions', async () => {
      prisma.attendanceException.findMany.mockResolvedValue([
        {
          id: 'exc-1',
          date: new Date('2026-10-02T00:00:00.000Z'),
          exceptionType: 'LATE_ARRIVAL',
          severity: 'MEDIUM',
          status: 'RESOLVED',
          resolved: true,
          resolvedAt: new Date('2026-10-02T10:00:00.000Z'),
          resolutionNotes: 'Approved late arrival for dental appointment',
          details: { lateMinutes: 20 },
          employee: mockSubordinate1,
          resolvedBy: { firstName: 'Priya', lastName: 'Sharma', employeeCode: 'MGR001' },
        },
      ]);

      const result: any = await service.getTeamExceptionReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: ReportFormat.CSV,
      });

      expect(result.success).toBe(true);
      expect(result.data.csv).toContain('Exception ID,Date,Employee Code,Employee Name');
      expect(result.data.csv).toContain('"LATE_ARRIVAL"');
      expect(result.data.csv).toContain('"Priya Sharma"');
      expect(result.data.filename).toBe('team-exceptions-report-2026-10-01-to-2026-10-10.csv');
    });
  });

  describe('Approval Activity Report', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
    });

    it('should aggregate approval decisions across Leave, WFH and Visits and compute turnaround hours', async () => {
      const submittedAt = new Date('2026-10-01T10:00:00.000Z');
      const decidedAt = new Date('2026-10-01T14:00:00.000Z'); // 4 hours later

      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          startDate: new Date('2026-10-05T00:00:00.000Z'),
          endDate: new Date('2026-10-06T00:00:00.000Z'),
          chargeableDays: 2.0,
          durationType: 'FULL_DAY',
          status: 'APPROVED',
          createdAt: submittedAt,
          updatedAt: decidedAt,
          leaveType: { name: 'Casual Leave', code: 'CL' },
          employee: mockSubordinate1,
          approvals: [
            {
              decision: 'APPROVED',
              comments: 'Enjoy your time off',
              decidedAt,
              approver: { firstName: 'Priya', lastName: 'Sharma' },
            },
          ],
        },
      ]);

      prisma.wfhRequest.findMany.mockResolvedValue([
        {
          id: 'wfh-1',
          startDate: new Date('2026-10-08T00:00:00.000Z'),
          endDate: new Date('2026-10-08T00:00:00.000Z'),
          durationType: 'FULL_DAY',
          status: 'SUBMITTED',
          createdAt: submittedAt,
          updatedAt: submittedAt,
          employee: mockSubordinate2,
          approvals: [],
        },
      ]);

      prisma.officialVisit.findMany.mockResolvedValue([]);

      const result: any = await service.getTeamApprovalReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe('APPROVALS');
      expect(result.aggregations.totalRequests).toBe(2);
      expect(result.aggregations.approvedCount).toBe(1);
      expect(result.aggregations.submittedCount).toBe(1);
      expect(result.aggregations.leaveCount).toBe(1);
      expect(result.aggregations.wfhCount).toBe(1);
      expect(result.aggregations.averageTurnaroundHours).toBe(4);
      expect(result.items[0].turnaroundHours).toBe(4);
      expect(result.items[0].approverName).toBe('Priya Sharma');
    });

    it('should export approval activity to CSV with formatted columns and no sensitive reasons', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          startDate: new Date('2026-10-05T00:00:00.000Z'),
          endDate: new Date('2026-10-06T00:00:00.000Z'),
          chargeableDays: 2.0,
          durationType: 'FULL_DAY',
          status: 'APPROVED',
          createdAt: new Date('2026-10-01T10:00:00.000Z'),
          updatedAt: new Date('2026-10-01T14:00:00.000Z'),
          leaveType: { name: 'Casual Leave', code: 'CL' },
          employee: mockSubordinate1,
          approvals: [
            {
              decision: 'APPROVED',
              comments: 'Approved',
              decidedAt: new Date('2026-10-01T14:00:00.000Z'),
              approver: { firstName: 'Priya', lastName: 'Sharma' },
            },
          ],
        },
      ]);
      prisma.wfhRequest.findMany.mockResolvedValue([]);
      prisma.officialVisit.findMany.mockResolvedValue([]);

      const result: any = await service.getTeamApprovalReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: ReportFormat.CSV,
      });

      expect(result.success).toBe(true);
      expect(result.data.csv).toContain('Request ID,Type,Employee Code,Employee Name');
      expect(result.data.csv).toContain('"LEAVE"');
      expect(result.data.csv).toContain('"Aarav Gupta"');
      expect(result.data.filename).toBe('team-approvals-report-2026-10-01-to-2026-10-10.csv');
    });
  });

  describe('Team Availability Report', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.employee.findMany.mockResolvedValue([mockSubordinate1, mockSubordinate2]);
    });

    it('should calculate availability rates per employee and team summary', async () => {
      prisma.holiday.count.mockResolvedValue(0);
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          employeeId: 'emp-sub-1',
          date: new Date('2026-10-01'),
          status: 'PRESENT',
          primaryAttendanceMode: 'OFFICE',
        },
        {
          employeeId: 'emp-sub-1',
          date: new Date('2026-10-02'),
          status: 'PRESENT',
          primaryAttendanceMode: 'WFH',
        },
        {
          employeeId: 'emp-sub-2',
          date: new Date('2026-10-01'),
          status: 'ON_LEAVE',
          primaryAttendanceMode: 'OFFICE',
        },
      ]);

      const result: any = await service.getTeamAvailabilityReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-05', // 5 days
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe('AVAILABILITY');
      expect(result.aggregations.totalTeamMembers).toBe(2);
      expect(result.aggregations.totalPresentOfficeDays).toBe(1);
      expect(result.aggregations.totalWfhDays).toBe(1);
      expect(result.aggregations.totalLeaveDays).toBe(1);

      // Employee 1: 2 days active out of 5 -> 40%
      const emp1 = result.items.find((e: any) => e.employeeId === 'emp-sub-1');
      expect(emp1.officeDays).toBe(1);
      expect(emp1.wfhDays).toBe(1);
      expect(emp1.availabilityPct).toBe(40);

      // Employee 2: 0 days active out of 5 -> 0%
      const emp2 = result.items.find((e: any) => e.employeeId === 'emp-sub-2');
      expect(emp2.leaveDays).toBe(1);
      expect(emp2.availabilityPct).toBe(0);
    });

    it('should generate team availability CSV export', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValue([]);
      prisma.holiday.count.mockResolvedValue(0);

      const result: any = await service.getTeamAvailabilityReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: ReportFormat.CSV,
      });

      expect(result.success).toBe(true);
      expect(result.data.csv).toContain(
        'Employee Code,Employee Name,Department,Designation,Branch,Scheduled Days',
      );
      expect(result.data.filename).toBe('team-availability-report-2026-10-01-to-2026-10-10.csv');
      expect(result.data.totalRecords).toBe(2);
    });
  });

  describe('Empty Team Fast-Path', () => {
    it('should return safe empty payload when manager has no reporting team', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [],
        indirectReports: [],
        allMemberIds: [],
        totalTeamSize: 0,
      });

      const res: any = await service.getTeamAttendanceReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      });

      expect(res.success).toBe(true);
      expect(res.aggregations.totalRecords).toBe(0);
      expect(res.items).toEqual([]);
    });
  });
});
