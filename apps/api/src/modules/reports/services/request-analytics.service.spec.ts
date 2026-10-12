import { Test, TestingModule } from '@nestjs/testing';
import { RequestAnalyticsService } from './request-analytics.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('RequestAnalyticsService (Leave, WFH, Official-Visit and Approval Analytics)', () => {
  let service: RequestAnalyticsService;
  let prisma: any;
  let hierarchyService: any;

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
      leaveRequest: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      leaveBalanceAccount: {
        findMany: jest.fn(),
      },
      wfhRequest: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      officialVisit: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<RequestAnalyticsService>(RequestAnalyticsService);
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
    });

    it('rejects manager queries targeting an employee outside their hierarchy', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmp);
      hierarchyService.getTeamMemberIds.mockResolvedValue(mockTeamIds);

      await expect(
        service.getLeaveUtilizationReport(managerUser, { employeeId: 'unauthorized-emp' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Leave Utilization & Balance Summaries', () => {
    it('distinguishes chargeable days, calendar days, and segregates pending vs cancelled requests', async () => {
      const mockLeaveRequests = [
        {
          id: 'lr-1',
          startDate: new Date('2026-10-05T00:00:00.000Z'), // Monday
          endDate: new Date('2026-10-09T00:00:00.000Z'), // Friday
          chargeableDays: '5.0',
          status: 'APPROVED',
          leaveTypeId: 'lt-annual',
          leaveType: { id: 'lt-annual', name: 'Annual Leave', code: 'AL', color: '#10b981' },
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            displayName: 'Alice Dev',
            employeeCode: 'EMP001',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
            },
          },
        },
        {
          id: 'lr-2',
          startDate: new Date('2026-10-12T00:00:00.000Z'), // Monday
          endDate: new Date('2026-10-12T00:00:00.000Z'),
          chargeableDays: '0.5',
          status: 'APPROVED',
          leaveTypeId: 'lt-sick',
          leaveType: { id: 'lt-sick', name: 'Sick Leave', code: 'SL', color: '#ef4444' },
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            displayName: 'Alice Dev',
            employeeCode: 'EMP001',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
            },
          },
        },
        {
          id: 'lr-3',
          startDate: new Date('2026-10-15T00:00:00.000Z'),
          endDate: new Date('2026-10-16T00:00:00.000Z'),
          chargeableDays: '2.0',
          status: 'SUBMITTED', // Pending - must NOT count toward approved utilization
          leaveTypeId: 'lt-annual',
          leaveType: { id: 'lt-annual', name: 'Annual Leave', code: 'AL', color: '#10b981' },
          employeeId: 'emp-team-2',
          employee: {
            id: 'emp-team-2',
            displayName: 'Bob QA',
            employeeCode: 'EMP002',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
            },
          },
        },
        {
          id: 'lr-4',
          startDate: new Date('2026-10-20T00:00:00.000Z'),
          endDate: new Date('2026-10-22T00:00:00.000Z'),
          chargeableDays: '3.0',
          status: 'CANCELLED', // Cancelled - must NOT count toward approved utilization
          leaveTypeId: 'lt-annual',
          leaveType: { id: 'lt-annual', name: 'Annual Leave', code: 'AL', color: '#10b981' },
          employeeId: 'emp-team-1',
          employee: {
            id: 'emp-team-1',
            displayName: 'Alice Dev',
            employeeCode: 'EMP001',
            employment: {
              department: { id: 'd1', name: 'Engineering' },
              branch: { id: 'b1', name: 'HQ' },
            },
          },
        },
      ];

      const mockBalanceAccounts = [
        {
          id: 'lba-1',
          leaveTypeId: 'lt-annual',
          leaveType: { id: 'lt-annual', name: 'Annual Leave', code: 'AL', color: '#10b981' },
          openingBalance: '15.0',
          accruedBalance: '10.0',
          allocatedBalance: '25.0',
          usedBalance: '5.0',
          pendingBalance: '2.0',
          closingBalance: '18.0',
        },
        {
          id: 'lba-2',
          leaveTypeId: 'lt-sick',
          leaveType: { id: 'lt-sick', name: 'Sick Leave', code: 'SL', color: '#ef4444' },
          openingBalance: '5.0',
          accruedBalance: '5.0',
          allocatedBalance: '10.0',
          usedBalance: '0.5',
          pendingBalance: '0.0',
          closingBalance: '9.5',
        },
      ];

      prisma.leaveRequest.findMany.mockResolvedValue(mockLeaveRequests);
      prisma.leaveBalanceAccount.findMany.mockResolvedValue(mockBalanceAccounts);

      const result = await service.getLeaveUtilizationReport(adminUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      // Approved chargeable days = 5.0 (AL) + 0.5 (SL) = 5.5
      expect(result.utilizationSummary.approvedChargeableDays).toBe(5.5);
      // Pending days = 2.0
      expect(result.utilizationSummary.pendingChargeableDays).toBe(2);
      // Cancelled days = 3.0
      expect(result.utilizationSummary.cancelledChargeableDays).toBe(3);

      // Verify balance summary
      expect(result.balanceSummary.totalAccounts).toBe(2);
      expect(result.balanceSummary.totalUsedBalance).toBe(5.5);
      expect(result.balanceSummary.totalPendingBalance).toBe(2);
      expect(result.balanceSummary.totalClosingBalance).toBe(27.5);

      // Verify breakdowns by type
      expect(result.byLeaveType).toHaveLength(2);
      const alType = result.byLeaveType.find((t) => t.code === 'AL');
      expect(alType?.approvedChargeableDays).toBe(5);
      expect(alType?.pendingCount).toBe(1);
      expect(alType?.cancelledCount).toBe(1);
    });
  });

  describe('Unified Request Volumes & Outcomes', () => {
    it('aggregates unified counts across Leave, WFH, and Official Visits with outcome rates', async () => {
      const mockLeave = [
        { id: 'l-1', status: 'APPROVED', chargeableDays: '2.0', createdAt: new Date() },
        { id: 'l-2', status: 'REJECTED', chargeableDays: '1.0', createdAt: new Date() },
        { id: 'l-3', status: 'SUBMITTED', chargeableDays: '3.0', createdAt: new Date() },
      ];

      const mockWfh = [
        {
          id: 'w-1',
          status: 'APPROVED',
          startDate: new Date('2026-10-05T00:00:00Z'),
          endDate: new Date('2026-10-06T00:00:00Z'),
          durationType: 'FULL_DAY',
          createdAt: new Date(),
        },
        {
          id: 'w-2',
          status: 'CANCELLED',
          startDate: new Date('2026-10-07T00:00:00Z'),
          endDate: new Date('2026-10-07T00:00:00Z'),
          durationType: 'FULL_DAY',
          createdAt: new Date(),
        },
      ];

      const mockVisits = [
        {
          id: 'v-1',
          status: 'APPROVED',
          expectedDurationDays: 2.0,
          purpose: 'Client audit',
          destinations: [{ destinationName: 'Client Site', isGeofenceRequired: true }],
          createdAt: new Date(),
        },
      ];

      prisma.leaveRequest.findMany.mockResolvedValue(mockLeave);
      prisma.wfhRequest.findMany.mockResolvedValue(mockWfh);
      prisma.officialVisit.findMany.mockResolvedValue(mockVisits);

      const result = await service.getRequestVolumesReport(adminUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(result.overallSummary.totalRequests).toBe(6);
      expect(result.overallSummary.totalApproved).toBe(3); // 1 leave + 1 wfh + 1 visit
      expect(result.overallSummary.totalPending).toBe(1); // 1 leave
      expect(result.overallSummary.totalCancelled).toBe(1); // 1 wfh

      // Overall approval rate = 3 approved / (3 approved + 1 rejected) = 75%
      expect(result.overallSummary.overallApprovalRate).toBe(75);

      // Category specific metrics
      expect(result.leaveMetrics.total).toBe(3);
      expect(result.wfhMetrics.totalApprovedDays).toBe(2);
      expect(result.officialVisitMetrics.totalDurationDays).toBe(2);
      expect(result.officialVisitMetrics.destinationsCount).toBe(1);
    });
  });

  describe('Pending Aging and Approval Turnaround', () => {
    it('evaluates pending request aging brackets and multi-stage turnaround times', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      // Pending leave request submitted 48h ago
      const mockPendingLeave = [
        {
          id: 'pl-1',
          status: 'SUBMITTED',
          createdAt: fortyEightHoursAgo,
          approvals: [],
          employee: {
            employeeCode: 'EMP001',
            displayName: 'Alice Dev',
            employment: { department: { name: 'Engineering' } },
          },
        },
      ];

      // Decided WFH request submitted 26h ago and approved 2h ago (turnaround = 24h)
      const submission26hAgo = new Date(now.getTime() - 26 * 60 * 60 * 1000);
      const mockDecidedWfh = [
        {
          id: 'dw-1',
          status: 'APPROVED',
          createdAt: submission26hAgo,
          approvals: [
            {
              id: 'app-2',
              decision: 'APPROVED',
              decidedAt: twoHoursAgo,
              approverId: 'u-mgr',
            },
            {
              id: 'app-1', // earlier intermediate approval step in multi-stage workflow
              decision: 'APPROVED',
              decidedAt: new Date(submission26hAgo.getTime() + 4 * 60 * 60 * 1000),
              approverId: 'u-lead',
            },
          ],
          employee: {
            employeeCode: 'EMP002',
            displayName: 'Bob QA',
            employment: { department: { name: 'Engineering' } },
          },
        },
      ];

      prisma.leaveRequest.findMany.mockResolvedValue(mockPendingLeave);
      prisma.wfhRequest.findMany.mockResolvedValue(mockDecidedWfh);
      prisma.officialVisit.findMany.mockResolvedValue([]);

      const result = await service.getApprovalTurnaroundReport(adminUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      // Pending aging verification
      expect(result.pendingAging.totalPendingRequests).toBe(1);
      expect(result.pendingAging.brackets.oneToThreeDays).toBe(1);
      expect(result.pendingAging.pendingRoster).toHaveLength(1);
      expect(result.pendingAging.pendingRoster[0].employeeCode).toBe('EMP001');

      // Turnaround verification (24 hours calendar turnaround)
      expect(result.turnaroundMetrics.totalDecidedRequests).toBe(1);
      expect(result.turnaroundMetrics.avgCalendarHours).toBe(24);
      expect(result.turnaroundMetrics.fastestTurnaroundHours).toBe(24);
      expect(result.turnaroundMetrics.slowestTurnaroundHours).toBe(24);
    });
  });
});
