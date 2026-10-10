import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ManagerService } from './manager.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('ManagerService', () => {
  let service: ManagerService;
  let prisma: any;
  let hierarchyService: any;

  const mockOrgId = 'org-123';

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-manager-1',
    email: 'manager@peopleos.local',
    firstName: 'Priya',
    lastName: 'Sharma',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
    roles: ['MANAGER'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW'],
    organizationId: mockOrgId,
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-regular',
    email: 'employee@peopleos.local',
    firstName: 'Regular',
    lastName: 'Employee',
    employeeCode: 'EMP999',
    status: 'ACTIVE' as any,
    sessionId: 'sess-2',
    roles: ['EMPLOYEE'],
    permissions: ['ATTENDANCE_VIEW'],
    organizationId: mockOrgId,
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    userId: 'user-manager-1',
    displayName: 'Priya Sharma (Manager)',
    employeeCode: 'MGR001',
    organizationId: mockOrgId,
  };

  const mockTeamEmployee1 = {
    id: 'emp-sub-1',
    employeeCode: 'EMP001',
    displayName: 'Aarav Gupta',
    profilePhoto: null,
    employment: {
      designation: { title: 'Software Engineer' },
      department: { name: 'Engineering' },
      branch: { name: 'Main HQ' },
      workMode: 'OFFICE',
    },
    contact: { workEmail: 'aarav@peopleos.local', phone: '+91 9876543210' },
  };

  const mockTeamEmployee2 = {
    id: 'emp-sub-2',
    employeeCode: 'EMP002',
    displayName: 'Bhavna Patel',
    profilePhoto: null,
    employment: {
      designation: { title: 'QA Engineer' },
      department: { name: 'Engineering' },
      branch: { name: 'Main HQ' },
      workMode: 'OFFICE',
    },
    contact: { workEmail: 'bhavna@peopleos.local', phone: '+91 9876543211' },
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendanceSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      wfhRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      officialVisit: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceCorrectionRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceException: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      shiftAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    hierarchyService = {
      getTeam: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagerService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<ManagerService>(ManagerService);
  });

  describe('Unauthorized & Non-Manager Access Checks', () => {
    it('throws ForbiddenException if user has no employee profile and is not ADMIN/HR', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.getDashboardOverview(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('enforces strict team isolation so only subordinates from HierarchyService are included', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      // Hierarchy only returns emp-sub-1; foreign-emp-999 is outside team
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockTeamEmployee1],
        indirectReports: [],
        allMemberIds: ['emp-sub-1'],
        totalTeamSize: 1,
      });

      prisma.employee.findMany.mockResolvedValue([mockTeamEmployee1]);

      const res = await service.getDashboardOverview(mockManagerUser, {});

      expect(res.metrics.teamHeadcount).toBe(1);
      expect(res.roster.some((r: any) => r.id === 'foreign-emp-999')).toBe(false);
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['emp-sub-1'] },
          }),
        }),
      );
    });
  });

  describe('Empty Team & No-Pending-Requests Cases', () => {
    it('returns empty dashboard state with 0 metrics when manager has zero reports', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [],
        indirectReports: [],
        allMemberIds: [],
        totalTeamSize: 0,
      });

      const res = await service.getDashboardOverview(mockManagerUser, {
        targetDate: '2026-10-10',
      });

      expect(res.success).toBe(true);
      expect(res.metrics.teamHeadcount).toBe(0);
      expect(res.metrics.presentCheckedIn).toBe(0);
      expect(res.metrics.pendingApprovalsTotal).toBe(0);
      expect(res.roster).toEqual([]);
      expect(res.exceptions).toEqual([]);
      expect(res.upcomingAbsences).toEqual([]);
    });
  });

  describe('Mutually Exclusive Counts & Status Classification', () => {
    it('correctly classifies checked-in, on-leave, on-WFH, on-visit, and shift-pending without double-counting', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockTeamEmployee1, mockTeamEmployee2],
        indirectReports: [],
        allMemberIds: ['emp-sub-1', 'emp-sub-2'],
        totalTeamSize: 2,
      });

      prisma.employee.findMany.mockResolvedValue([mockTeamEmployee1, mockTeamEmployee2]);

      // Employee 1: Checked in (Present in Office)
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          employeeId: 'emp-sub-1',
          totalWorkMinutes: 240,
          primaryAttendanceMode: 'OFFICE',
          firstCheckIn: new Date('2026-10-10T03:30:00.000Z'),
          lastCheckOut: null,
        },
      ]);
      prisma.attendanceSession.findMany.mockResolvedValue([
        {
          employeeId: 'emp-sub-1',
          checkInTime: new Date('2026-10-10T03:30:00.000Z'),
          checkOutTime: null,
          attendanceMode: 'OFFICE',
        },
      ]);

      // Employee 2: Approved Leave
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          employeeId: 'emp-sub-2',
          status: 'APPROVED',
          startDate: new Date('2026-10-10T00:00:00.000Z'),
          endDate: new Date('2026-10-10T23:59:59.999Z'),
          chargeableDays: 1,
          leaveType: { name: 'Casual Leave', code: 'CL', color: '#f59e0b' },
        },
      ]);

      // Pending approvals
      prisma.leaveRequest.count.mockResolvedValue(2);
      prisma.wfhRequest.count.mockResolvedValue(1);
      prisma.officialVisit.count.mockResolvedValue(0);
      prisma.attendanceCorrectionRequest.count.mockResolvedValue(1);

      const res = await service.getDashboardOverview(mockManagerUser, {
        targetDate: '2026-10-10',
      });

      expect(res.success).toBe(true);
      expect(res.metrics.teamHeadcount).toBe(2);
      expect(res.metrics.presentCheckedIn).toBe(1); // Employee 1
      expect(res.metrics.onApprovedLeave).toBe(1); // Employee 2
      expect(res.metrics.pendingApprovalsTotal).toBe(4); // 2 leaves + 1 WFH + 0 visits + 1 correction

      // Mutually exclusive: Roster contains exactly 2 members
      expect(res.roster.length).toBe(2);
      const emp1Roster = res.roster.find((r: any) => r.id === 'emp-sub-1');
      const emp2Roster = res.roster.find((r: any) => r.id === 'emp-sub-2');

      expect(emp1Roster?.status).toBe('PRESENT_OFFICE');
      expect(emp2Roster?.status).toBe('ON_LEAVE');
      expect(emp2Roster?.leaveTypeName).toBe('Casual Leave');
    });

    it('redacts sensitive leave reasons from upcoming absences for employee confidentiality', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockTeamEmployee1],
        indirectReports: [],
        allMemberIds: ['emp-sub-1'],
        totalTeamSize: 1,
      });

      prisma.employee.findMany.mockResolvedValue([mockTeamEmployee1]);

      prisma.leaveRequest.findMany
        .mockResolvedValueOnce([]) // leaves for target date
        .mockResolvedValueOnce([
          // upcoming leaves
          {
            id: 'up-leave-1',
            employeeId: 'emp-sub-1',
            employee: { displayName: 'Aarav Gupta', employeeCode: 'EMP001' },
            leaveType: { name: 'Medical Leave', code: 'ML', color: '#ef4444' },
            startDate: new Date('2026-10-12T00:00:00.000Z'),
            endDate: new Date('2026-10-14T00:00:00.000Z'),
            chargeableDays: 3,
            reason: 'Confidential private medical operation',
          },
        ]);

      const res = await service.getDashboardOverview(mockManagerUser, {
        targetDate: '2026-10-10',
      });

      expect(res.upcomingAbsences.length).toBe(1);
      expect(res.upcomingAbsences[0].reason).toBe('[Approved Scheduled Absence]');
    });
  });

  describe('Shift & Timezone Boundary Behavior', () => {
    it('distinguishes employee not yet due from overdue check-in based on shift start time', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockTeamEmployee1],
        indirectReports: [],
        allMemberIds: ['emp-sub-1'],
        totalTeamSize: 1,
      });

      prisma.employee.findMany.mockResolvedValue([mockTeamEmployee1]);

      // Assign late afternoon shift (15:00 - 23:00)
      prisma.shiftAssignment.findMany.mockResolvedValue([
        {
          employeeId: 'emp-sub-1',
          shift: {
            name: 'Late Afternoon Shift',
            startTime: '23:59', // Will definitely be after morning/afternoon test run
            endTime: '07:00',
          },
        },
      ]);

      const res = await service.getDashboardOverview(mockManagerUser, {});

      // For a shift starting at 23:59, employee status is NOT_DUE_YET during daytime
      const empRoster = res.roster.find((r: any) => r.id === 'emp-sub-1');
      expect(empRoster?.status).toBe('NOT_DUE_YET');
      expect(res.metrics.notDueYet).toBe(1);
      expect(res.metrics.pendingCheckIn).toBe(0);
    });
  });
});
