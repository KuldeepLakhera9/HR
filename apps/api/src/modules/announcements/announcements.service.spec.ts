import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import * as fs from 'fs';
import * as path from 'path';

describe('AnnouncementsService (Announcements & Audience Scope)', () => {
  let service: AnnouncementsService;
  let auditService: jest.Mocked<AuditService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let prismaService: any;

  const testOrgId = 'test-org-announcements-123';
  const testStorageFile = path.resolve(
    process.cwd(),
    'storage',
    'announcements',
    `${testOrgId}.json`,
  );

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@example.com',
    roles: ['ADMIN'],
    organizationId: testOrgId,
    employeeCode: 'EMP-ADMIN-1',
    firstName: 'Admin',
    lastName: 'User',
    status: 'ACTIVE',
    permissions: ['*'],
    sessionId: 'session-admin',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'hr@example.com',
    roles: ['HR'],
    organizationId: testOrgId,
    employeeCode: 'EMP-HR-1',
    firstName: 'HR',
    lastName: 'Reviewer',
    status: 'ACTIVE',
    permissions: ['HR_MANAGE'],
    sessionId: 'session-hr',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'engineer@example.com',
    roles: ['EMPLOYEE'],
    organizationId: testOrgId,
    employeeCode: 'EMP-DEV-1',
    firstName: 'Jane',
    lastName: 'Dev',
    status: 'ACTIVE',
    permissions: ['SELF_SERVICE'],
    sessionId: 'session-emp',
  };

  const mockMarketingUser: AuthenticatedUser = {
    id: 'user-mkt-2',
    email: 'marketing@example.com',
    roles: ['EMPLOYEE'],
    organizationId: testOrgId,
    employeeCode: 'EMP-MKT-2',
    firstName: 'Mark',
    lastName: 'Eter',
    status: 'ACTIVE',
    permissions: ['SELF_SERVICE'],
    sessionId: 'session-mkt',
  };

  beforeAll(() => {
    // Clean up test file if exists
    if (fs.existsSync(testStorageFile)) {
      try {
        fs.unlinkSync(testStorageFile);
      } catch {}
    }
  });

  afterAll(() => {
    if (fs.existsSync(testStorageFile)) {
      try {
        fs.unlinkSync(testStorageFile);
      } catch {}
    }
  });

  beforeEach(async () => {
    const mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const mockNotifications = {
      createNotification: jest.fn().mockResolvedValue({ id: 'mock-notif-1' }),
      getNotifications: jest.fn().mockResolvedValue([]),
    };

    prismaService = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === mockEmployeeUser.id) {
            return Promise.resolve({
              id: 'emp-dev-1',
              userId: mockEmployeeUser.id,
              organizationId: testOrgId,
              employment: {
                departmentId: 'dept-eng',
                department: { id: 'dept-eng', name: 'Engineering', code: 'ENG' },
              },
            });
          }
          if (where.userId === mockMarketingUser.id) {
            return Promise.resolve({
              id: 'emp-mkt-2',
              userId: mockMarketingUser.id,
              organizationId: testOrgId,
              employment: {
                departmentId: 'dept-mkt',
                department: { id: 'dept-mkt', name: 'Marketing', code: 'MKT' },
              },
            });
          }
          return Promise.resolve(null);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    auditService = module.get(AuditService);
    notificationsService = module.get(NotificationsService);
  });

  describe('Audience Scope and Visibility', () => {
    it('should allow employee to see company-wide (ALL) announcements', async () => {
      const ann = await service.createAnnouncement(mockHrUser, {
        title: 'Company All-Hands Meeting',
        content: 'Quarterly all-hands will be hosted this Friday at 4 PM.',
        priority: 'NORMAL',
        category: 'EVENT',
        targetAudience: 'ALL',
        status: 'PUBLISHED',
      });

      const items = await service.getActiveAnnouncementsForEmployee(mockEmployeeUser);
      const found = items.find((i) => i.id === ann.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe('Company All-Hands Meeting');
    });

    it('should filter department-scoped announcements so only target department members can view them', async () => {
      const engAnn = await service.createAnnouncement(mockAdminUser, {
        title: 'Engineering Tech Stack Migration',
        content: 'Kubernetes cluster maintenance scheduled this weekend.',
        priority: 'HIGH',
        category: 'MAINTENANCE',
        targetAudience: 'DEPARTMENT',
        targetValue: 'Engineering',
        status: 'PUBLISHED',
      });

      // Engineering employee MUST see it
      const engItems = await service.getActiveAnnouncementsForEmployee(mockEmployeeUser);
      expect(engItems.find((i) => i.id === engAnn.id)).toBeDefined();

      // Marketing employee MUST NOT see it (zero cross-department leaks)
      const mktItems = await service.getActiveAnnouncementsForEmployee(mockMarketingUser);
      expect(mktItems.find((i) => i.id === engAnn.id)).toBeUndefined();
    });

    it('should filter role-scoped announcements so only matching role users can view them', async () => {
      const mgrAnn = await service.createAnnouncement(mockHrUser, {
        title: 'Manager Appraisal Guidelines',
        content: 'Confidential performance evaluation rubrics for team leads.',
        priority: 'URGENT',
        category: 'POLICY',
        targetAudience: 'ROLE',
        targetValue: 'MANAGER',
        status: 'PUBLISHED',
      });

      // Regular employee without MANAGER role MUST NOT see it
      const empItems = await service.getActiveAnnouncementsForEmployee(mockEmployeeUser);
      expect(empItems.find((i) => i.id === mgrAnn.id)).toBeUndefined();
    });

    it('should automatically exclude expired announcements from employee view', async () => {
      const expiredAnn = await service.createAnnouncement(mockHrUser, {
        title: 'Past Blood Donation Camp',
        content: 'Event concluded yesterday.',
        priority: 'LOW',
        category: 'EVENT',
        targetAudience: 'ALL',
        publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        expiresAt: new Date(Date.now() - 86400000 * 1).toISOString(), // Expired 1 day ago
        status: 'PUBLISHED',
      });

      const activeItems = await service.getActiveAnnouncementsForEmployee(mockEmployeeUser);
      expect(activeItems.find((i) => i.id === expiredAnn.id)).toBeUndefined();
    });

    it('should exclude draft announcements from employee view', async () => {
      const draftAnn = await service.createAnnouncement(mockHrUser, {
        title: 'Draft Policy Note',
        content: 'Work in progress draft.',
        priority: 'NORMAL',
        category: 'POLICY',
        targetAudience: 'ALL',
        status: 'DRAFT',
      });

      const empItems = await service.getActiveAnnouncementsForEmployee(mockEmployeeUser);
      expect(empItems.find((i) => i.id === draftAnn.id)).toBeUndefined();

      // But HR admin CAN see drafts in HR management list
      const hrItems = await service.getAllAnnouncementsForHR(mockHrUser);
      expect(hrItems.find((i) => i.id === draftAnn.id)).toBeDefined();
    });
  });

  describe('Unauthorized Publishing & Permissions', () => {
    it('should reject non-HR/Admin users attempting to publish announcements with ForbiddenException', async () => {
      await expect(
        service.createAnnouncement(mockEmployeeUser, {
          title: 'Unauthorized Notice',
          content: 'This should be blocked',
          targetAudience: 'ALL',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-HR/Admin users attempting to update announcements', async () => {
      await expect(
        service.updateAnnouncement(mockEmployeeUser, 'some-id', {
          title: 'Hacked',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-HR/Admin users attempting to archive announcements', async () => {
      await expect(service.archiveAnnouncement(mockEmployeeUser, 'some-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Audit Logging & Notification Idempotency', () => {
    it('should record ANNOUNCEMENT_CREATED audit event and broadcast notification with idempotencyKey', async () => {
      const result = await service.createAnnouncement(
        mockAdminUser,
        {
          title: 'Annual Festival Holiday',
          content: 'Offices will remain closed on Diwali.',
          priority: 'NORMAL',
          category: 'EVENT',
          targetAudience: 'ALL',
          status: 'PUBLISHED',
        },
        '192.168.1.50',
        'Mozilla/5.0 Test',
      );

      // Verify audit call
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ANNOUNCEMENT_CREATED',
          entity: 'Announcement',
          entityId: result.id,
          userId: mockAdminUser.id,
          organizationId: testOrgId,
          ipAddress: '192.168.1.50',
        }),
      );

      // Verify in-app notification dispatch with idempotency key
      expect(notificationsService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: testOrgId,
          title: 'Announcement: Annual Festival Holiday',
          idempotencyKey: `announcement-notify-${result.id}-${testOrgId}`,
        }),
      );
    });
  });
});
