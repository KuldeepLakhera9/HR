import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { VisitsService, MAX_VISIT_DURATION_DAYS } from './visits.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { VisitStatus, ApprovalDecision } from '@hrms/database';

describe('VisitsService', () => {
  let service: VisitsService;
  let prisma: any;
  let hierarchyService: any;
  let auditService: any;

  const mockOrgId = 'org-corp-1';
  const mockUserId = 'usr-emp-1';
  const mockEmployeeId = 'emp-101';
  const mockManagerUserId = 'usr-mgr-1';
  const mockManagerEmployeeId = 'emp-mgr-1';
  const mockOtherEmployeeId = 'emp-peer-2';

  const mockEmployeeUser: AuthenticatedUser = {
    id: mockUserId,
    email: 'alice@company.com',
    organizationId: mockOrgId,
    firstName: 'Alice',
    lastName: 'Smith',
    employeeCode: 'EMP101',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE' as any],
    permissions: ['VISIT_APPLY', 'VISIT_VIEW'],
    sessionId: 'session-alice',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: mockManagerUserId,
    email: 'bob@company.com',
    organizationId: mockOrgId,
    firstName: 'Bob',
    lastName: 'Manager',
    employeeCode: 'MGR101',
    status: 'ACTIVE' as any,
    roles: ['MANAGER' as any],
    permissions: ['VISIT_APPLY', 'VISIT_VIEW', 'VISIT_APPROVE'],
    sessionId: 'session-bob',
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'usr-admin-1',
    email: 'hr@company.com',
    organizationId: mockOrgId,
    firstName: 'Helen',
    lastName: 'Admin',
    employeeCode: 'ADM101',
    status: 'ACTIVE' as any,
    roles: ['ADMIN' as any, 'HR' as any],
    permissions: ['VISIT_APPLY', 'VISIT_VIEW', 'VISIT_APPROVE'],
    sessionId: 'session-admin',
  };

  const mockEmployee = {
    id: mockEmployeeId,
    userId: mockUserId,
    organizationId: mockOrgId,
    employeeCode: 'EMP101',
    firstName: 'Alice',
    lastName: 'Smith',
    displayName: 'Alice Smith',
    isActive: true,
  };

  const mockManagerEmployee = {
    id: mockManagerEmployeeId,
    userId: mockManagerUserId,
    organizationId: mockOrgId,
    employeeCode: 'MGR101',
    firstName: 'Bob',
    lastName: 'Manager',
    displayName: 'Bob Manager',
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
      },
      officialVisit: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      visitDestination: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    hierarchyService = {
      isManagerOf: jest.fn(),
      getTeam: jest.fn(),
    };

    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const notificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    prisma.officialVisit.updateMany = jest.fn();
    prisma.visitApproval = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
  });

  describe('resolveEmployee', () => {
    it('resolves active employee matching userId or employeeCode', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      const res = await service.resolveEmployee(mockEmployeeUser);
      expect(res).toEqual(mockEmployee);
      expect(prisma.employee.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrgId,
          OR: [{ userId: mockUserId }, { employeeCode: 'EMP101' }],
          isActive: true,
        },
      });
    });

    it('throws NotFoundException if employee profile does not exist', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      await expect(service.resolveEmployee(mockEmployeeUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createVisit', () => {
    const validDto = {
      title: 'Client Data Center Audit',
      purpose: 'Conduct annual security audit and inspect backup storage.',
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      destinations: [
        {
          destinationName: 'Apex Data Center',
          address: '42 Cyber City',
          city: 'Bangalore',
          latitude: 12.9716,
          longitude: 77.5946,
          radiusMeters: 200,
          isGeofenceRequired: true,
        },
      ],
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
    });

    it('creates a SUBMITTED visit with destinations and records audit log', async () => {
      prisma.officialVisit.findFirst.mockResolvedValue(null); // No overlap
      const createdRecord = {
        id: 'vis-100',
        ...validDto,
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.SUBMITTED,
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        endDate: new Date('2026-10-22T00:00:00.000Z'),
        destinations: validDto.destinations,
      };
      prisma.officialVisit.create.mockResolvedValue(createdRecord);

      const res = await service.createVisit(mockEmployeeUser, validDto);

      expect(res.data.id).toBe('vis-100');
      expect(prisma.officialVisit.create).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VISIT_CREATED',
          entity: 'OfficialVisit',
          entityId: 'vis-100',
          userId: mockUserId,
        }),
      );
    });

    it('rejects creation if startDate > endDate', async () => {
      await expect(
        service.createVisit(mockEmployeeUser, {
          ...validDto,
          startDate: '2026-10-25',
          endDate: '2026-10-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation if visit duration exceeds 30 days', async () => {
      await expect(
        service.createVisit(mockEmployeeUser, {
          ...validDto,
          startDate: '2026-10-01',
          endDate: '2026-11-15', // 46 days
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects retrospective dates older than 7 days for non-admins', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 15);
      const pastDateStr = pastDate.toISOString().slice(0, 10);

      await expect(
        service.createVisit(mockEmployeeUser, {
          ...validDto,
          startDate: pastDateStr,
          endDate: pastDateStr,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when an active overlapping visit already exists', async () => {
      prisma.officialVisit.findFirst.mockResolvedValue({
        id: 'vis-prior-1',
        title: 'Prior Field Trip',
        status: VisitStatus.APPROVED,
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        endDate: new Date('2026-10-21T00:00:00.000Z'),
      });

      await expect(service.createVisit(mockEmployeeUser, validDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getVisits & getVisitById', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
    });

    it('restricts employee to scope=my automatically', async () => {
      prisma.officialVisit.count.mockResolvedValue(1);
      prisma.officialVisit.findMany.mockResolvedValue([{ id: 'vis-1' }]);

      const res = await service.getVisits(mockEmployeeUser, { scope: 'my' });
      expect(prisma.officialVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: mockEmployeeId,
          }),
        }),
      );
      expect(res.meta.total).toBe(1);
    });

    it('allows manager to view team visits', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      hierarchyService.getTeam.mockResolvedValue({
        allMemberIds: [mockManagerEmployeeId, mockEmployeeId],
      });
      prisma.officialVisit.count.mockResolvedValue(2);
      prisma.officialVisit.findMany.mockResolvedValue([{ id: 'vis-1' }, { id: 'vis-2' }]);

      const res = await service.getVisits(mockManagerUser, { scope: 'team' });
      expect(prisma.officialVisit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: { in: [mockManagerEmployeeId, mockEmployeeId] },
          }),
        }),
      );
    });

    it('blocks regular employee from accessing scope=organization', async () => {
      await expect(service.getVisits(mockEmployeeUser, { scope: 'organization' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows manager to view detail of subordinate visit', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.officialVisit.findUnique.mockResolvedValue({
        id: 'vis-subordinate-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        title: 'Team Visit',
      });
      hierarchyService.isManagerOf.mockResolvedValue(true);

      const res = await service.getVisitById(mockManagerUser, 'vis-subordinate-1');
      expect(res.data.id).toBe('vis-subordinate-1');
    });

    it('denies peer employee from viewing another employee visit', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.officialVisit.findUnique.mockResolvedValue({
        id: 'vis-peer-1',
        organizationId: mockOrgId,
        employeeId: mockOtherEmployeeId,
      });

      await expect(service.getVisitById(mockEmployeeUser, 'vis-peer-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateVisit & Material Change Reapproval', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
    });

    it('updates title of an APPROVED visit without triggering reapproval', async () => {
      const existingVisit = {
        id: 'vis-app-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.APPROVED,
        title: 'Original Title',
        purpose: 'Original Purpose',
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        endDate: new Date('2026-10-21T00:00:00.000Z'),
        destinations: [{ destinationName: 'Site A', latitude: 12.9, longitude: 77.5 }],
      };
      prisma.officialVisit.findUnique.mockResolvedValue(existingVisit);
      prisma.officialVisit.update.mockResolvedValue({
        ...existingVisit,
        title: 'Updated Title Text',
      });

      const res = await service.updateVisit(mockEmployeeUser, 'vis-app-1', {
        title: 'Updated Title Text',
      });

      expect(res.meta.reapprovalTriggered).toBe(false);
      expect(res.data.status).toBe(VisitStatus.APPROVED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VISIT_UPDATED' }),
      );
    });

    it('resets APPROVED visit to SUBMITTED if date or destination is changed (material change)', async () => {
      const existingVisit = {
        id: 'vis-app-2',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.APPROVED,
        title: 'Original Title',
        purpose: 'Original Purpose',
        startDate: new Date('2026-10-20T00:00:00.000Z'),
        endDate: new Date('2026-10-21T00:00:00.000Z'),
        destinations: [{ destinationName: 'Site A', latitude: 12.9, longitude: 77.5 }],
      };
      prisma.officialVisit.findUnique.mockResolvedValue(existingVisit);
      prisma.officialVisit.findFirst.mockResolvedValue(null); // No overlap
      prisma.officialVisit.update.mockResolvedValue({
        ...existingVisit,
        status: VisitStatus.SUBMITTED,
        endDate: new Date('2026-10-23T00:00:00.000Z'),
      });

      const res = await service.updateVisit(mockEmployeeUser, 'vis-app-2', {
        endDate: '2026-10-23', // Extended end date
      });

      expect(res.meta.reapprovalTriggered).toBe(true);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VISIT_REAPPROVAL_TRIGGERED' }),
      );
    });

    it('rejects update of terminal visits (CANCELLED, REJECTED, etc.)', async () => {
      prisma.officialVisit.findUnique.mockResolvedValue({
        id: 'vis-cancelled-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.CANCELLED,
      });

      await expect(
        service.updateVisit(mockEmployeeUser, 'vis-cancelled-1', { title: 'New' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelVisit', () => {
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
    });

    it('allows owner to cancel an upcoming visit prior to start date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const existingVisit = {
        id: 'vis-cancel-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.SUBMITTED,
        startDate: futureDate,
        destinations: [],
      };
      prisma.officialVisit.findUnique.mockResolvedValue(existingVisit);
      prisma.officialVisit.update.mockResolvedValue({
        ...existingVisit,
        status: VisitStatus.CANCELLED,
        cancellationReason: 'Meeting cancelled by client lead.',
      });

      const res = await service.cancelVisit(mockEmployeeUser, 'vis-cancel-1', {
        cancellationReason: 'Meeting cancelled by client lead.',
      });

      expect(res.data.status).toBe(VisitStatus.CANCELLED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VISIT_CANCELLED' }),
      );
    });

    it('prevents employee self-cancellation once visit has commenced', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const commencedVisit = {
        id: 'vis-commenced-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.APPROVED,
        startDate: pastDate,
      };
      prisma.officialVisit.findUnique.mockResolvedValue(commencedVisit);

      await expect(
        service.cancelVisit(mockEmployeeUser, 'vis-commenced-1', {
          cancellationReason: 'Trip ended early.',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows HR Admin to cancel a commenced visit with reason', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-admin',
        organizationId: mockOrgId,
      });
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const commencedVisit = {
        id: 'vis-commenced-2',
        organizationId: mockOrgId,
        employeeId: mockEmployeeId,
        status: VisitStatus.APPROVED,
        startDate: pastDate,
      };
      prisma.officialVisit.findUnique.mockResolvedValue(commencedVisit);
      prisma.officialVisit.update.mockResolvedValue({
        ...commencedVisit,
        status: VisitStatus.CANCELLED,
      });

      const res = await service.cancelVisit(mockAdminUser, 'vis-commenced-2', {
        cancellationReason: 'Executive recall due to project restructuring.',
      });

      expect(res.data.status).toBe(VisitStatus.CANCELLED);
    });
  });

  describe('decideVisit', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    const pendingVisit = {
      id: 'vis-pending-1',
      organizationId: mockOrgId,
      employeeId: mockEmployeeId,
      status: VisitStatus.SUBMITTED,
      title: 'Client Data Center Audit',
      startDate: futureDate,
      endDate: futureDate,
      employee: {
        id: mockEmployeeId,
        userId: mockUserId,
        displayName: 'Alice Smith',
      },
      destinations: [{ destinationName: 'Site 1' }],
    };

    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.officialVisit.findUnique.mockResolvedValue(pendingVisit);
      prisma.officialVisit.updateMany.mockResolvedValue({ count: 1 });
      prisma.visitApproval.create.mockResolvedValue({
        id: 'appr-1',
        visitId: 'vis-pending-1',
        approverId: mockManagerUserId,
        decision: ApprovalDecision.APPROVED,
        comments: 'Looks good.',
        decidedAt: new Date(),
      });
      hierarchyService.isManagerOf.mockResolvedValue(true);
    });

    it('allows manager to approve a subordinate visit and dispatches notification & audit', async () => {
      const res = await service.decideVisit(mockManagerUser, 'vis-pending-1', {
        decision: ApprovalDecision.APPROVED,
        comments: 'Looks good, proceed.',
      });

      expect(prisma.officialVisit.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'vis-pending-1',
          organizationId: mockOrgId,
          status: VisitStatus.SUBMITTED,
        },
        data: {
          status: VisitStatus.APPROVED,
        },
      });
      expect(prisma.visitApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision: ApprovalDecision.APPROVED,
            comments: 'Looks good, proceed.',
          }),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VISIT_APPROVED',
          entity: 'OfficialVisit',
          entityId: 'vis-pending-1',
        }),
      );
    });

    it('prevents self-approval when requester attempts to review own visit', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee); // Alice herself

      await expect(
        service.decideVisit(mockEmployeeUser, 'vis-pending-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects decision if manager is outside the reporting hierarchy and not HR/Admin', async () => {
      hierarchyService.isManagerOf.mockResolvedValue(false); // Outside hierarchy

      await expect(
        service.decideVisit(mockManagerUser, 'vis-pending-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows HR Admin to approve visit as escalation override even if not direct manager', async () => {
      hierarchyService.isManagerOf.mockResolvedValue(false);
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-admin', organizationId: mockOrgId });

      const res = await service.decideVisit(mockAdminUser, 'vis-pending-1', {
        decision: ApprovalDecision.APPROVED,
        comments: 'HR escalation approval.',
      });

      expect(res.meta.isEscalationOverride).toBe(true);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ isEscalationOverride: true }),
        }),
      );
    });

    it('enforces concurrency protection if request was already updated by another reviewer', async () => {
      prisma.officialVisit.updateMany.mockResolvedValue({ count: 0 }); // Concurrent change

      await expect(
        service.decideVisit(mockManagerUser, 'vis-pending-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects decision if request is already cancelled', async () => {
      prisma.officialVisit.findUnique.mockResolvedValue({
        ...pendingVisit,
        status: VisitStatus.CANCELLED,
      });

      await expect(
        service.decideVisit(mockManagerUser, 'vis-pending-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects decision and marks EXPIRED if visit end date has already passed', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      prisma.officialVisit.findUnique.mockResolvedValue({
        ...pendingVisit,
        startDate: pastDate,
        endDate: pastDate,
      });

      await expect(
        service.decideVisit(mockManagerUser, 'vis-pending-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.officialVisit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: VisitStatus.EXPIRED },
        }),
      );
    });
  });
});
