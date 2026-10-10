import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService, NotificationsController } from './notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

describe('NotificationsService & Controller', () => {
  let service: NotificationsService;
  let controller: NotificationsController;

  const mockUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    organizationId: 'org-test-1',
    email: 'manager@example.com',
    firstName: 'Manager',
    lastName: 'User',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    roles: ['MANAGER'],
    permissions: ['ATTENDANCE_VIEW'],
    sessionId: 'sess-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [NotificationsService],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    controller = module.get<NotificationsController>(NotificationsController);
    service.clearForTesting();
  });

  afterEach(() => {
    service.clearForTesting();
  });

  describe('createNotification & duplicate prevention', () => {
    it('creates in-app notification with link, metadata, and unread status', async () => {
      const notif = await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Action Required: New Leave Request',
        message: 'Jane Doe submitted leave request for Oct 15-16.',
        type: 'ACTION_REQUIRED',
        link: '/manager?tab=approvals&type=LEAVE&id=req-1',
        idempotencyKey: 'notif:mgr_pending:LEAVE:req-1',
      });

      expect(notif).toBeDefined();
      expect(notif.id).toContain('notif-');
      expect(notif.isRead).toBe(false);
      expect(notif.link).toBe('/manager?tab=approvals&type=LEAVE&id=req-1');
      expect(notif.idempotencyKey).toBe('notif:mgr_pending:LEAVE:req-1');
    });

    it('prevents duplicates when retried with identical idempotencyKey', async () => {
      const first = await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Action Required',
        message: 'First attempt',
        type: 'ACTION_REQUIRED',
        idempotencyKey: 'notif:retry-key-123',
      });

      const second = await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Action Required',
        message: 'Retried attempt',
        type: 'ACTION_REQUIRED',
        idempotencyKey: 'notif:retry-key-123',
      });

      expect(first.id).toBe(second.id);
      expect(first.message).toBe('First attempt');
      // Buffer should only contain 1 notification
      const list = await service.getNotifications('user-mgr-1', 'org-test-1', {
        type: 'ACTION_REQUIRED',
      });
      expect(list.length).toBe(1);
    });
  });

  describe('recipient scoping', () => {
    it('returns only notifications scoped to target user or org broadcast', async () => {
      await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'For Manager 1',
        message: 'Private manager note',
        type: 'INFO',
      });

      await service.createNotification({
        userId: 'user-mgr-2',
        organizationId: 'org-test-1',
        title: 'For Manager 2',
        message: 'Other manager note',
        type: 'INFO',
      });

      const user1Notifs = await service.getNotifications('user-mgr-1', 'org-test-1', {
        type: 'INFO',
      });
      expect(user1Notifs.some((n) => n.title === 'For Manager 1')).toBe(true);
      expect(user1Notifs.some((n) => n.title === 'For Manager 2')).toBe(false);
    });

    it('isolates notifications by organizationId', async () => {
      await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-tenant-A',
        title: 'Tenant A Alert',
        message: 'Confidential',
      });

      const tenantBNotifs = await service.getNotifications('user-mgr-1', 'org-tenant-B');
      expect(tenantBNotifs.some((n) => n.title === 'Tenant A Alert')).toBe(false);
    });
  });

  describe('read / unread management', () => {
    it('marks a single notification as read', async () => {
      const notif = await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Unread Alert',
        message: 'Please review',
      });
      expect(notif.isRead).toBe(false);

      const res = await service.markRead(notif.id, 'user-mgr-1');
      expect(res.isRead).toBe(true);

      const updated = await service.getNotifications('user-mgr-1', 'org-test-1', {
        isRead: true,
      });
      expect(updated.some((n) => n.id === notif.id)).toBe(true);
    });

    it('marks all notifications as read in bulk', async () => {
      await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Alert 1',
        message: 'Msg 1',
      });
      await service.createNotification({
        userId: 'user-mgr-1',
        organizationId: 'org-test-1',
        title: 'Alert 2',
        message: 'Msg 2',
      });

      const result = await service.markAllRead('user-mgr-1', 'org-test-1');
      expect(result.count).toBe(2);
      expect(result.success).toBe(true);

      const unreadList = await service.getNotifications('user-mgr-1', 'org-test-1', {
        isRead: false,
      });
      expect(unreadList.length).toBe(0);
    });

    it('controller handles markAllRead endpoint', async () => {
      await service.createNotification({
        userId: mockUser.id,
        organizationId: mockUser.organizationId,
        title: 'Pending item',
        message: 'Action',
      });

      const res = await controller.markAllRead(mockUser);
      expect(res.message).toBe('All notifications marked as read');
      expect(res.data.count).toBe(1);
    });
  });
});
