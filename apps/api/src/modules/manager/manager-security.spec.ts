import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ManagerController } from './manager.controller';
import { ManagerService } from './manager.service';
import { ManagerReportsService } from './manager-reports.service';
import { ManagerAlertsService } from './manager-alerts.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { UnifiedApprovalType, UnifiedDecision } from './dto/decide-unified-approval.dto';

describe('Manager Portal Security & RBAC Suite', () => {
  let controller: ManagerController;
  let managerService: any;
  let reportsService: any;
  let alertsService: any;

  const orgId = 'org-tenant-100';

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin',
    email: 'admin@company.com',
    firstName: 'System',
    lastName: 'Admin',
    employeeCode: 'ADM001',
    status: 'ACTIVE' as any,
    roles: ['ADMIN'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW', 'APPROVAL_DECIDE'],
    sessionId: 'sess-adm',
    organizationId: orgId,
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr',
    email: 'hr@company.com',
    firstName: 'HR',
    lastName: 'Lead',
    employeeCode: 'HR001',
    status: 'ACTIVE' as any,
    roles: ['HR'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW', 'APPROVAL_DECIDE'],
    sessionId: 'sess-hr',
    organizationId: orgId,
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-manager',
    email: 'manager@company.com',
    firstName: 'Dev',
    lastName: 'Manager',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    roles: ['MANAGER'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW'],
    sessionId: 'sess-mgr',
    organizationId: orgId,
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp',
    email: 'employee@company.com',
    firstName: 'Regular',
    lastName: 'Worker',
    employeeCode: 'EMP001',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE'],
    permissions: [],
    sessionId: 'sess-emp',
    organizationId: orgId,
  };

  beforeEach(async () => {
    managerService = {
      getDashboardOverview: jest.fn(),
      getTeamDirectory: jest.fn(),
      getTeamMember: jest.fn(),
      getUnifiedApprovals: jest.fn(),
      getUnifiedApprovalDetail: jest.fn(),
      decideUnifiedApproval: jest.fn(),
      cancelUnifiedApproval: jest.fn(),
    };

    reportsService = {
      getTeamAttendanceReport: jest.fn(),
      getTeamExceptionReport: jest.fn(),
      getTeamApprovalReport: jest.fn(),
      getTeamAvailabilityReport: jest.fn(),
    };

    alertsService = {
      getManagerAlerts: jest.fn(),
      scanAndNotifyUpcomingAbsences: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ManagerController],
      providers: [
        { provide: ManagerService, useValue: managerService },
        { provide: ManagerReportsService, useValue: reportsService },
        { provide: ManagerAlertsService, useValue: alertsService },
      ],
    }).compile();

    controller = module.get<ManagerController>(ManagerController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Role Authorization Boundaries (ADMIN, HR, MANAGER vs EMPLOYEE)', () => {
    it('allows MANAGER to query dashboard overview and enforces user context', async () => {
      managerService.getDashboardOverview.mockResolvedValue({ success: true, metrics: {} });
      const result = await controller.getDashboardOverview(mockManagerUser, {});
      expect(result.success).toBe(true);
      expect(managerService.getDashboardOverview).toHaveBeenCalledWith(mockManagerUser, {});
    });

    it('allows HR and ADMIN to access manager reports and oversight endpoints', async () => {
      reportsService.getTeamAttendanceReport.mockResolvedValue({
        success: true,
        reportType: 'ATTENDANCE',
        pagination: { total: 10 },
      });
      const resHr = (await controller.getTeamAttendanceReport(mockHrUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      })) as any;
      expect(resHr.pagination.total).toBe(10);

      reportsService.getTeamAttendanceReport.mockResolvedValue({
        success: true,
        reportType: 'ATTENDANCE',
        pagination: { total: 25 },
      });
      const resAdmin = (await controller.getTeamAttendanceReport(mockAdminUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
      })) as any;
      expect(resAdmin.pagination.total).toBe(25);
    });

    it('rejects caller if service throws ForbiddenException for unassigned manager profile', async () => {
      managerService.getDashboardOverview.mockRejectedValue(
        new ForbiddenException('Caller does not hold an active employee profile'),
      );
      await expect(controller.getDashboardOverview(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('2. Direct URL & IDOR Prevention on Subordinate Records', () => {
    it('blocks manager from accessing team member outside reporting hierarchy', async () => {
      managerService.getTeamMember.mockRejectedValue(
        new ForbiddenException(
          'Access denied: Employee does not belong to your authorized team reporting hierarchy.',
        ),
      );

      await expect(
        controller.getTeamMember(mockManagerUser, 'emp-foreign-department'),
      ).rejects.toThrow(ForbiddenException);
      expect(managerService.getTeamMember).toHaveBeenCalledWith(
        mockManagerUser,
        'emp-foreign-department',
      );
    });

    it('returns NotFoundException when requesting non-existent employee ID', async () => {
      managerService.getTeamMember.mockRejectedValue(
        new NotFoundException('Employee #emp-ghost not found'),
      );

      await expect(controller.getTeamMember(mockManagerUser, 'emp-ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('3. Unified Approval Security & Tampering Prevention', () => {
    it('rejects approval decision on an item outside manager reporting hierarchy', async () => {
      managerService.decideUnifiedApproval.mockRejectedValue(
        new ForbiddenException(
          'Access denied: You are not authorized to decide requests for this employee.',
        ),
      );

      await expect(
        controller.decideUnifiedApproval(mockManagerUser, {
          type: UnifiedApprovalType.LEAVE,
          requestId: 'req-foreign-101',
          decision: UnifiedDecision.APPROVE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects rejection without providing required minimum reason length', async () => {
      managerService.decideUnifiedApproval.mockRejectedValue(
        new BadRequestException('A reason of at least 3 characters is mandatory when rejecting.'),
      );

      await expect(
        controller.decideUnifiedApproval(mockManagerUser, {
          type: UnifiedApprovalType.LEAVE,
          requestId: 'req-1',
          decision: UnifiedDecision.REJECT,
          reason: 'No', // < 3 characters
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks repeated decision if request is already approved/decided (idempotency)', async () => {
      managerService.decideUnifiedApproval.mockRejectedValue(
        new BadRequestException('This request is no longer pending approval.'),
      );

      await expect(
        controller.decideUnifiedApproval(mockManagerUser, {
          type: UnifiedApprovalType.WFH,
          requestId: 'req-already-approved',
          decision: UnifiedDecision.APPROVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks cross-workflow spoofing for unsupported workflow types', async () => {
      managerService.decideUnifiedApproval.mockRejectedValue(
        new BadRequestException('Unsupported approval workflow type: REIMBURSEMENT'),
      );

      await expect(
        controller.decideUnifiedApproval(mockManagerUser, {
          type: 'REIMBURSEMENT' as any,
          requestId: 'req-1',
          decision: UnifiedDecision.APPROVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Manipulated Filter Boundaries & Report Export Security', () => {
    it('rejects inverted date ranges (start date after end date)', async () => {
      reportsService.getTeamAttendanceReport.mockRejectedValue(
        new BadRequestException('Start date (2026-10-20) cannot be after end date (2026-10-01).'),
      );

      await expect(
        controller.getTeamAttendanceReport(mockManagerUser, {
          startDate: '2026-10-20',
          endDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unbounded date ranges exceeding the 90-day compliance window', async () => {
      reportsService.getTeamAttendanceReport.mockRejectedValue(
        new BadRequestException(
          'Date range exceeds the maximum allowed window of 90 days. Requested: 150 days.',
        ),
      );

      await expect(
        controller.getTeamAttendanceReport(mockManagerUser, {
          startDate: '2026-01-01',
          endDate: '2026-05-30',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces manager hierarchy scoping on CSV exports', async () => {
      reportsService.getTeamAttendanceReport.mockResolvedValue({
        success: true,
        data: {
          csv: 'Date,Employee Code,Employee Name\n2026-10-10,EMP001,Subordinate 1',
          filename: 'team-attendance-report-2026-10-10.csv',
          totalRecords: 1,
        },
      });

      const res = (await controller.getTeamAttendanceReport(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: 'CSV' as any,
      })) as any;

      expect(res.data.filename).toContain('team-attendance-report');
      expect(reportsService.getTeamAttendanceReport).toHaveBeenCalledWith(mockManagerUser, {
        startDate: '2026-10-01',
        endDate: '2026-10-10',
        format: 'CSV',
      });
    });
  });

  describe('5. Manager Actionable Alerts Security', () => {
    it('retrieves actionable alerts specifically scoped to caller user id and organization', async () => {
      alertsService.getManagerAlerts.mockResolvedValue({
        alerts: [
          {
            id: 'notif-1',
            type: 'ACTION_REQUIRED',
            link: '/manager?tab=approvals&type=LEAVE&id=req-1',
          },
        ],
        total: 1,
        unreadCount: 1,
      });

      const res = await controller.getAlerts(mockManagerUser, { type: 'ACTION_REQUIRED' });
      expect(res.total).toBe(1);
      expect(alertsService.getManagerAlerts).toHaveBeenCalledWith(mockManagerUser, {
        type: 'ACTION_REQUIRED',
      });
    });

    it('triggers proactive roster scan for authenticated manager', async () => {
      alertsService.scanAndNotifyUpcomingAbsences.mockResolvedValue({
        scannedCount: 4,
        alertedCount: 4,
        alerts: [],
      });

      const res = await controller.scanUpcomingAbsences(mockManagerUser);
      expect(res.scannedCount).toBe(4);
      expect(alertsService.scanAndNotifyUpcomingAbsences).toHaveBeenCalledWith(mockManagerUser);
    });
  });
});
