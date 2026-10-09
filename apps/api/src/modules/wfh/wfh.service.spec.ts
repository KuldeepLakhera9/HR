import { Test, TestingModule } from '@nestjs/testing';
import { WfhService } from './wfh.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AttendancePoliciesService } from '../attendance/attendance-policies.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalDecision, VisitStatus, WfhDurationType, WfhStatus } from '@prisma/client';

describe('WfhService', () => {
  let service: WfhService;
  let prisma: any;
  let auditService: any;
  let hierarchyService: any;
  let policiesService: any;

  const mockUser: any = {
    id: 'user-emp-1',
    email: 'emp@test.local',
    organizationId: 'org-1',
    employeeCode: 'EMP001',
    roles: ['EMPLOYEE'],
    permissions: ['WFH_APPLY', 'WFH_VIEW'],
  };

  const mockManagerUser: any = {
    id: 'user-mgr-1',
    email: 'mgr@test.local',
    organizationId: 'org-1',
    employeeCode: 'MGR001',
    roles: ['MANAGER'],
    permissions: ['WFH_APPLY', 'WFH_VIEW', 'WFH_APPROVE'],
  };

  const mockEmployee: any = {
    id: 'emp-record-1',
    userId: 'user-emp-1',
    employeeCode: 'EMP001',
    organizationId: 'org-1',
    status: 'ACTIVE',
    displayName: 'John Doe',
  };

  const mockManagerEmployee: any = {
    id: 'mgr-record-1',
    userId: 'user-mgr-1',
    employeeCode: 'MGR001',
    organizationId: 'org-1',
    status: 'ACTIVE',
    displayName: 'Manager Smith',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      wfhRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      officialVisit: {
        findFirst: jest.fn(),
      },
      wfhApproval: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    auditService = {
      record: jest.fn().mockResolvedValue(true),
    };

    hierarchyService = {
      getTeam: jest.fn().mockResolvedValue({ allMemberIds: ['emp-record-1'] }),
      isManagerOf: jest.fn().mockResolvedValue(true),
    };

    policiesService = {
      resolveEffectivePolicyAndShift: jest.fn().mockResolvedValue({
        policy: { standardWorkMinutes: 480 },
        shift: { name: 'General Shift' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WfhService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: HierarchyService, useValue: hierarchyService },
        { provide: AttendancePoliciesService, useValue: policiesService },
      ],
    }).compile();

    service = module.get<WfhService>(WfhService);
  });

  describe('createWfhRequest', () => {
    it('should create a valid FULL_DAY WFH request', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.wfhRequest.findFirst.mockResolvedValue(null);
      prisma.officialVisit.findFirst.mockResolvedValue(null);

      const created = {
        id: 'wfh-1',
        organizationId: 'org-1',
        employeeId: 'emp-record-1',
        startDate: new Date('2026-10-15T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z'),
        durationType: WfhDurationType.FULL_DAY,
        reason: 'Focusing on deep work for analytics reporting',
        status: WfhStatus.SUBMITTED,
      };
      prisma.wfhRequest.create.mockResolvedValue(created);

      const result = await service.createWfhRequest(mockUser, {
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        durationType: WfhDurationType.FULL_DAY,
        reason: 'Focusing on deep work for analytics reporting',
      });

      expect(result.data.status).toBe(WfhStatus.SUBMITTED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WFH_CREATED' }),
      );
    });

    it('should reject invalid date range where startDate > endDate', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-20',
          endDate: '2026-10-15',
          reason: 'Backwards dates test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject multi-day range for half-day duration types', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-15',
          endDate: '2026-10-16',
          durationType: WfhDurationType.FIRST_HALF,
          reason: 'Half-day across 2 days',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject single-day range for CUSTOM_RANGE duration type', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          durationType: WfhDurationType.CUSTOM_RANGE,
          reason: 'Single-day custom range',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive employee employment status', async () => {
      prisma.employee.findFirst.mockResolvedValue({
        ...mockEmployee,
        status: 'TERMINATED',
      });

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          reason: 'Terminated employee test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject overlapping active WFH requests', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.wfhRequest.findFirst.mockResolvedValue({
        id: 'existing-wfh',
        status: WfhStatus.APPROVED,
        startDate: new Date('2026-10-15'),
        endDate: new Date('2026-10-15'),
      });

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          reason: 'Conflicting request',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject overlapping official visit', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.wfhRequest.findFirst.mockResolvedValue(null);
      prisma.officialVisit.findFirst.mockResolvedValue({
        id: 'existing-visit',
        title: 'Client Onsite',
        status: VisitStatus.APPROVED,
      });

      await expect(
        service.createWfhRequest(mockUser, {
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          reason: 'Conflicting visit request',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateWfhRequest', () => {
    it('should trigger re-approval when an APPROVED request has material changes', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      const existingApproved = {
        id: 'wfh-appr-1',
        organizationId: 'org-1',
        employeeId: 'emp-record-1',
        startDate: new Date('2026-10-15T00:00:00.000Z'),
        endDate: new Date('2026-10-15T00:00:00.000Z'),
        durationType: WfhDurationType.FULL_DAY,
        status: WfhStatus.APPROVED,
        reason: 'Original reason',
      };
      prisma.wfhRequest.findUnique.mockResolvedValue(existingApproved);
      prisma.wfhRequest.findFirst.mockResolvedValue(null);
      prisma.officialVisit.findFirst.mockResolvedValue(null);
      prisma.wfhRequest.update.mockResolvedValue({
        ...existingApproved,
        startDate: new Date('2026-10-16T00:00:00.000Z'),
        endDate: new Date('2026-10-16T00:00:00.000Z'),
        status: WfhStatus.SUBMITTED,
      });

      const res = await service.updateWfhRequest(mockUser, 'wfh-appr-1', {
        startDate: '2026-10-16',
        endDate: '2026-10-16',
      });

      expect(res.meta?.reapprovalTriggered).toBe(true);
      expect(res.data.status).toBe(WfhStatus.SUBMITTED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WFH_REAPPROVAL_TRIGGERED' }),
      );
    });

    it('should reject updating a cancelled or terminal request', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      prisma.wfhRequest.findUnique.mockResolvedValue({
        id: 'wfh-cancelled',
        organizationId: 'org-1',
        employeeId: 'emp-record-1',
        status: WfhStatus.CANCELLED,
      });

      await expect(
        service.updateWfhRequest(mockUser, 'wfh-cancelled', {
          reason: 'Updating cancelled request',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelWfhRequest', () => {
    it('should allow employee to cancel upcoming WFH request', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      prisma.wfhRequest.findUnique.mockResolvedValue({
        id: 'wfh-future',
        organizationId: 'org-1',
        employeeId: 'emp-record-1',
        startDate: futureDate,
        endDate: futureDate,
        status: WfhStatus.SUBMITTED,
      });
      prisma.wfhRequest.update.mockResolvedValue({
        id: 'wfh-future',
        status: WfhStatus.CANCELLED,
        cancellationReason: 'Need to be in office',
      });

      const res = await service.cancelWfhRequest(mockUser, 'wfh-future', {
        cancellationReason: 'Need to be in office',
      });

      expect(res.data.status).toBe(WfhStatus.CANCELLED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WFH_CANCELLED' }),
      );
    });

    it('should reject self-cancellation by employee if request has already commenced', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockEmployee);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      prisma.wfhRequest.findUnique.mockResolvedValue({
        id: 'wfh-past',
        organizationId: 'org-1',
        employeeId: 'emp-record-1',
        startDate: pastDate,
        endDate: pastDate,
        status: WfhStatus.APPROVED,
      });

      await expect(
        service.cancelWfhRequest(mockUser, 'wfh-past', {
          cancellationReason: 'Trying to cancel commenced request',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('decideWfhRequest', () => {
    it('should reject manager approving their own WFH request', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.wfhRequest.findUnique.mockResolvedValue({
        id: 'mgr-wfh-self',
        organizationId: 'org-1',
        employeeId: 'mgr-record-1', // Same employee
        status: WfhStatus.SUBMITTED,
        employee: { userId: 'user-mgr-1' },
      });

      await expect(
        service.decideWfhRequest(mockManagerUser, 'mgr-wfh-self', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject manager reviewing subordinate outside reporting chain', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.wfhRequest.findUnique.mockResolvedValue({
        id: 'foreign-wfh',
        organizationId: 'org-1',
        employeeId: 'foreign-emp-id',
        status: WfhStatus.SUBMITTED,
        employee: { userId: 'foreign-user-id' },
      });
      hierarchyService.isManagerOf.mockResolvedValue(false);

      await expect(
        service.decideWfhRequest(mockManagerUser, 'foreign-wfh', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should successfully approve subordinate WFH request and record approval audit', async () => {
      prisma.employee.findFirst.mockResolvedValue(mockManagerEmployee);
      prisma.wfhRequest.findUnique
        .mockResolvedValueOnce({
          id: 'sub-wfh-1',
          organizationId: 'org-1',
          employeeId: 'emp-record-1',
          status: WfhStatus.SUBMITTED,
          employee: { userId: 'user-emp-1' },
        })
        .mockResolvedValueOnce({
          id: 'sub-wfh-1',
          organizationId: 'org-1',
          employeeId: 'emp-record-1',
          status: WfhStatus.APPROVED,
          employee: { userId: 'user-emp-1' },
        });
      hierarchyService.isManagerOf.mockResolvedValue(true);
      prisma.wfhRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.wfhApproval.create.mockResolvedValue({
        id: 'appr-1',
        decision: ApprovalDecision.APPROVED,
        comments: 'Approved remote sprint review',
      });

      const res = await service.decideWfhRequest(mockManagerUser, 'sub-wfh-1', {
        decision: ApprovalDecision.APPROVED,
        comments: 'Approved remote sprint review',
      });

      expect(res.data?.status).toBe(WfhStatus.APPROVED);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WFH_APPROVED' }),
      );
    });
  });
});
