import { Test, TestingModule } from '@nestjs/testing';
import { ManagerAlertsService } from './manager-alerts.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('ManagerAlertsService', () => {
  let service: ManagerAlertsService;
  let prisma: any;
  let hierarchyService: any;
  let notificationsService: NotificationsService;

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-001',
    organizationId: 'org-abc',
    email: 'manager@example.com',
    firstName: 'Bob',
    lastName: 'Manager',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    roles: ['MANAGER'],
    permissions: ['ATTENDANCE_VIEW', 'EMPLOYEE_VIEW'],
    sessionId: 'sess-mgr',
  };

  const mockEmployee = {
    id: 'emp-subordinate-1',
    displayName: 'Alice Engineer',
    employeeCode: 'EMP002',
    userId: 'user-emp-002',
    managerId: 'emp-mgr-001',
    manager: {
      id: 'emp-mgr-001',
      userId: 'user-mgr-001',
      displayName: 'Bob Manager',
    },
    employment: {
      managerId: 'emp-mgr-001',
      manager: {
        id: 'emp-mgr-001',
        userId: 'user-mgr-001',
        displayName: 'Bob Manager',
      },
    },
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn(),
      },
      wfhRequest: {
        findMany: jest.fn(),
      },
      officialVisit: {
        findMany: jest.fn(),
      },
    };

    hierarchyService = {
      getTeam: jest.fn(),
      getManager: jest.fn(),
      getDirectReports: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagerAlertsService,
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
      ],
    }).compile();

    service = module.get<ManagerAlertsService>(ManagerAlertsService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    notificationsService.clearForTesting();
  });

  afterEach(() => {
    notificationsService.clearForTesting();
    jest.clearAllMocks();
  });

  describe('1. Recipient Scoping & Authorization for New Requests', () => {
    it('notifies only the authorized reporting manager user for pending leave requests', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const notif = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-leave-100',
        startDate: '2026-10-15',
        endDate: '2026-10-17',
      });

      expect(notif).toBeDefined();
      expect(notif?.userId).toBe('user-mgr-001'); // Directly targeted to Bob Manager
      expect(notif?.type).toBe('ACTION_REQUIRED');
      expect(notif?.title).toContain('New Leave Request');
      expect(notif?.message).toContain('Alice Engineer');
      expect(notif?.link).toBe('/manager?tab=approvals&type=LEAVE&id=req-leave-100');
    });

    it('gracefully handles employee with no reporting manager without failing', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-solo',
        displayName: 'Solo Contributor',
        managerId: null,
        manager: null,
        employment: null,
      });

      const notif = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-solo',
        type: 'WFH',
        requestId: 'req-wfh-200',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
      });

      expect(notif).toBeNull();
    });

    it('gracefully handles missing employee record without throwing', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      const notif = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-non-existent',
        type: 'VISIT',
        requestId: 'req-visit-300',
        startDate: '2026-10-22',
        endDate: '2026-10-22',
      });

      expect(notif).toBeNull();
    });
  });

  describe('2. Duplicate Prevention & Retry Idempotency', () => {
    it('does not duplicate notifications when request submission event is retried', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const first = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-leave-dup',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      const second = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-leave-dup',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(first?.id).toBe(second?.id);
      expect(first?.idempotencyKey).toBe('notif:mgr_pending:LEAVE:req-leave-dup');

      // Verify notifications count in buffer is exactly 1
      const notifs = await notificationsService.getNotifications('user-mgr-001', 'org-abc', {
        type: 'ACTION_REQUIRED',
      });
      expect(notifs.length).toBe(1);
    });

    it('prevents duplicates when attendance exception notification is retried', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const first = await service.notifyActionableAttendanceException({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        exceptionId: 'exc-retry-1',
        exceptionType: 'GEOFENCE_BREACH',
        severity: 'HIGH',
        date: '2026-10-10',
      });

      const second = await service.notifyActionableAttendanceException({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        exceptionId: 'exc-retry-1',
        exceptionType: 'GEOFENCE_BREACH',
        severity: 'HIGH',
        date: '2026-10-10',
      });

      expect(first?.id).toBe(second?.id);
      expect(first?.idempotencyKey).toBe('notif:mgr_exception:exc-retry-1');
    });
  });

  describe('3. Approval Decision Outcomes', () => {
    it('notifies applicant employee upon approval decision with detail link', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const res = await service.notifyApprovalOutcome({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-leave-301',
        decision: 'APPROVED',
        decidedByUserId: 'user-mgr-001', // Direct manager decided it
        startDate: '2026-10-18',
        endDate: '2026-10-19',
      });

      expect(res.employeeNotification).toBeDefined();
      expect(res.employeeNotification?.userId).toBe('user-emp-002');
      expect(res.employeeNotification?.type).toBe('APPROVAL_APPROVED');
      expect(res.employeeNotification?.link).toBe('/leave?id=req-leave-301');
      expect(res.employeeNotification?.message).toContain('approved');
      // Direct manager made decision, so managerNotification is not needed
      expect(res.managerNotification).toBeNull();
    });

    it('also notifies direct manager when decision was executed by an admin override', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const res = await service.notifyApprovalOutcome({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'WFH',
        requestId: 'req-wfh-401',
        decision: 'REJECTED',
        decidedByUserId: 'user-admin-999', // Executive / HR override
        startDate: '2026-10-21',
        endDate: '2026-10-22',
        sanitizedComments: 'Coverage required at branch',
      });

      expect(res.employeeNotification?.userId).toBe('user-emp-002');
      expect(res.employeeNotification?.type).toBe('APPROVAL_REJECTED');
      expect(res.employeeNotification?.link).toBe('/wfh?id=req-wfh-401');

      // Manager also notified about admin override
      expect(res.managerNotification).toBeDefined();
      expect(res.managerNotification?.userId).toBe('user-mgr-001');
      expect(res.managerNotification?.link).toBe('/manager?tab=approvals&type=WFH&id=req-wfh-401');
    });
  });

  describe('4. Actionable Attendance Exceptions', () => {
    it('notifies manager for HIGH severity exception and stores link to attendance view', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const notif = await service.notifyActionableAttendanceException({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        exceptionId: 'exc-geo-101',
        exceptionType: 'GEOFENCE_BREACH',
        severity: 'HIGH',
        date: '2026-10-10',
      });

      expect(notif).toBeDefined();
      expect(notif?.userId).toBe('user-mgr-001');
      expect(notif?.title).toContain('Attendance Exception: Geofence Breach (HIGH)');
      expect(notif?.link).toBe('/attendance?id=exc-geo-101');
      expect(notif?.type).toBe('EXCEPTION_ALERT');
    });

    it('suppresses alert for LOW severity exception to avoid noise', async () => {
      const notif = await service.notifyActionableAttendanceException({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        exceptionId: 'exc-low-1',
        exceptionType: 'LATE_ARRIVAL',
        severity: 'LOW',
        date: '2026-10-10',
      });

      expect(notif).toBeNull();
      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('5. Upcoming Absences Roster Planning', () => {
    it('scans and alerts manager of upcoming team leaves, WFH, and official visits', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-mgr-001',
        displayName: 'Bob Manager',
      });

      hierarchyService.getTeam.mockResolvedValue({
        allMemberIds: ['emp-mgr-001', 'emp-subordinate-1', 'emp-subordinate-2'],
      });

      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-up-1',
          employeeId: 'emp-subordinate-1',
          employee: {
            id: 'emp-subordinate-1',
            displayName: 'Alice Engineer',
            employeeCode: 'EMP002',
          },
          leaveType: { name: 'Casual Leave' },
        },
      ]);

      prisma.wfhRequest.findMany.mockResolvedValue([
        {
          id: 'wfh-up-1',
          employeeId: 'emp-subordinate-2',
          employee: {
            id: 'emp-subordinate-2',
            displayName: 'Charlie Developer',
            employeeCode: 'EMP003',
          },
        },
      ]);

      prisma.officialVisit.findMany.mockResolvedValue([]);

      const result = await service.scanAndNotifyUpcomingAbsences(mockManagerUser);

      expect(result.scannedCount).toBe(2);
      expect(result.alertedCount).toBe(2);
      expect(result.alerts[0].userId).toBe('user-mgr-001');
      expect(result.alerts[0].link).toBe('/manager?tab=roster');
      expect(result.alerts[0].type).toBe('UPCOMING_ABSENCE');
      expect(result.alerts[0].title).toContain('Upcoming Team Absence: Alice Engineer');

      // Re-running the scan immediately generates NO duplicate notifications
      const rerun = await service.scanAndNotifyUpcomingAbsences(mockManagerUser);
      expect(rerun.scannedCount).toBe(2);
      // Alerts created with duplicate idempotencyKeys are skipped
      expect(rerun.alerts[0].id).toBe(result.alerts[0].id);
    });
  });

  describe('6. Privacy & Redaction of Sensitive Details', () => {
    it('sanitizes reasons and avoids leaking personal medical reasons in pending alerts', async () => {
      prisma.employee.findUnique.mockResolvedValue(mockEmployee);

      const notif = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-priv-1',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        summary: 'Chemotherapy follow-up appointment with oncologist', // Sensitive note
      });

      expect(notif?.message).not.toContain('Chemotherapy');
      expect(notif?.message).not.toContain('oncologist');
      expect(notif?.message).toBe(
        'Alice Engineer submitted a Leave request for 2026-10-15 to 2026-10-16. Review and action required.',
      );
    });
  });

  describe('7. Non-blocking / Fault-Tolerant Delivery', () => {
    it('handles database lookup failures gracefully without crashing caller execution', async () => {
      prisma.employee.findUnique.mockRejectedValue(new Error('DB Connection Timeout'));

      const result = await service.notifyManagerOfPendingRequest({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-err-1',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(result).toBeNull(); // Graceful degradation
    });

    it('handles approval outcome delivery errors gracefully', async () => {
      prisma.employee.findUnique.mockRejectedValue(new Error('Internal query error'));

      const res = await service.notifyApprovalOutcome({
        organizationId: 'org-abc',
        employeeId: 'emp-subordinate-1',
        type: 'LEAVE',
        requestId: 'req-err-2',
        decision: 'APPROVED',
        decidedByUserId: 'user-mgr-001',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
      });

      expect(res.employeeNotification).toBeNull();
      expect(res.managerNotification).toBeNull();
    });
  });

  describe('8. Manager Portal Alerts Query', () => {
    it('retrieves manager portal alerts and counts unread items', async () => {
      // Seed notifications
      await notificationsService.createNotification({
        userId: mockManagerUser.id,
        organizationId: mockManagerUser.organizationId,
        title: 'Action Required',
        message: 'Review request',
        type: 'ACTION_REQUIRED',
      });

      await notificationsService.createNotification({
        userId: mockManagerUser.id,
        organizationId: mockManagerUser.organizationId,
        title: 'Upcoming Absence',
        message: 'Scheduled absence',
        type: 'UPCOMING_ABSENCE',
      });

      const res = await service.getManagerAlerts(mockManagerUser);
      expect(res.total).toBe(2);
      expect(res.unreadCount).toBe(2);
      expect(res.alerts[0].type).toBe('UPCOMING_ABSENCE');
    });
  });
});
