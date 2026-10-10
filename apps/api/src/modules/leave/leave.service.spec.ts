import { Test, TestingModule } from '@nestjs/testing';
import { LeaveService } from './leave.service';
import { LeaveLedgerService } from './leave-ledger.service';
import { LeaveCalculatorService } from './leave-calculator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { EmployeesService } from '../employees/employees.service';
import { NotificationsService } from '../notifications/notifications.module';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalDecision, LeaveDurationType, LeaveRequestStatus, Prisma } from '@prisma/client';

describe('LeaveService', () => {
  let service: LeaveService;
  let ledgerService: LeaveLedgerService;
  let calculatorService: LeaveCalculatorService;
  let prisma: any;
  let hierarchyService: any;

  const mockEmployeeUser: any = {
    id: 'user-emp-1',
    organizationId: 'org-1',
    employeeCode: 'EMP001',
    roles: ['EMPLOYEE'],
  };

  const mockManagerUser: any = {
    id: 'user-mgr-1',
    organizationId: 'org-1',
    employeeCode: 'MGR001',
    roles: ['MANAGER'],
  };

  const mockAdminUser: any = {
    id: 'user-adm-1',
    organizationId: 'org-1',
    employeeCode: 'ADM001',
    roles: ['ADMIN'],
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb) => cb(prisma)),
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'emp-1',
          userId: 'user-emp-1',
          employeeCode: 'EMP001',
          displayName: 'Vikram Aditya',
          managerId: 'emp-mgr-1',
          organizationId: 'org-1',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'emp-mgr-1',
          userId: 'user-mgr-1',
          displayName: 'Rajesh Manager',
        }),
      },
      leaveType: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lt-cl',
          code: 'CL',
          name: 'Casual Leave',
          isPaid: true,
          allowHalfDay: true,
          requiresDoc: false,
          docThresholdDays: 3,
          isActive: true,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leavePolicy: {
        findFirst: jest.fn(),
      },
      employeeLeavePolicyAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          leavePolicy: {
            id: 'pol-1',
            name: 'Standard CL Policy',
            annualEntitlement: new Prisma.Decimal(12.0),
            minNoticeDays: 0,
            maxConsecutiveDays: 10,
            allowNegativeBalance: false,
            maxNegativeBalance: new Prisma.Decimal(0),
          },
        }),
      },
      leaveBalanceAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'acc-1',
          organizationId: 'org-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-cl',
          leaveYear: 2026,
          openingBalance: new Prisma.Decimal(12.0),
          allocatedBalance: new Prisma.Decimal(12.0),
          accruedBalance: new Prisma.Decimal(0),
          usedBalance: new Prisma.Decimal(0),
          pendingBalance: new Prisma.Decimal(0),
          closingBalance: new Prisma.Decimal(12.0),
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      leaveBalanceTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
      leaveRequest: {
        findFirst: jest.fn().mockResolvedValue(null), // No overlaps by default
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'req-1',
          organizationId: 'org-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-cl',
          leaveYear: 2026,
          startDate: new Date('2026-10-15T00:00:00.000Z'),
          endDate: new Date('2026-10-16T00:00:00.000Z'),
          chargeableDays: new Prisma.Decimal(2.0),
          status: LeaveRequestStatus.SUBMITTED,
        }),
        update: jest.fn().mockResolvedValue({ id: 'req-1', status: LeaveRequestStatus.APPROVED }),
      },
      leaveApproval: {
        create: jest.fn().mockResolvedValue({ id: 'appr-1' }),
      },
      officialVisit: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      wfhRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          shift: { workDays: [1, 2, 3, 4, 5] },
        }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-1']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        LeaveLedgerService,
        LeaveCalculatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: HierarchyService, useValue: hierarchyService },
        {
          provide: EmployeesService,
          useValue: { getScopedEmployeeFilter: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: NotificationsService,
          useValue: { createNotification: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<LeaveService>(LeaveService);
    ledgerService = module.get<LeaveLedgerService>(LeaveLedgerService);
    calculatorService = module.get<LeaveCalculatorService>(LeaveCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('apply', () => {
    it('successfully submits application and places balance reservation', async () => {
      const res = await service.apply(mockEmployeeUser, {
        leaveTypeId: 'lt-cl',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        durationType: LeaveDurationType.FULL_DAY,
        reason: 'Family celebration',
      });

      expect(res.success).toBe(true);
      expect(prisma.leaveRequest.create).toHaveBeenCalled();
      expect(prisma.leaveBalanceTransaction.create).toHaveBeenCalled();
    });

    it('rejects submission with ConflictException if an overlapping leave request exists', async () => {
      prisma.leaveRequest.findFirst.mockResolvedValueOnce({
        id: 'existing-req',
        leaveType: { name: 'Casual Leave' },
        startDate: new Date('2026-10-14'),
        endDate: new Date('2026-10-17'),
      });

      await expect(
        service.apply(mockEmployeeUser, {
          leaveTypeId: 'lt-cl',
          startDate: '2026-10-15',
          endDate: '2026-10-16',
          reason: 'Duplicate window test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submission with ConflictException if an active WFH request overlaps', async () => {
      prisma.wfhRequest.findFirst.mockResolvedValueOnce({
        id: 'existing-wfh',
        startDate: new Date('2026-10-15'),
        endDate: new Date('2026-10-15'),
      });

      await expect(
        service.apply(mockEmployeeUser, {
          leaveTypeId: 'lt-cl',
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          reason: 'Overlap with WFH test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submission with BadRequestException if available balance is insufficient', async () => {
      prisma.leaveBalanceAccount.findUnique.mockResolvedValueOnce({
        id: 'acc-1',
        closingBalance: new Prisma.Decimal(0.5), // Only 0.5 available
        allocatedBalance: new Prisma.Decimal(12.0),
        usedBalance: new Prisma.Decimal(11.5),
        pendingBalance: new Prisma.Decimal(0.0),
      });

      await expect(
        service.apply(mockEmployeeUser, {
          leaveTypeId: 'lt-cl',
          startDate: '2026-10-15',
          endDate: '2026-10-16', // 2 working days requested
          reason: 'Overdraft without negative balance permission',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('decide (Approval / Rejection)', () => {
    it('prevents self-approval with ForbiddenException (Security Rule)', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValueOnce({
        id: 'req-1',
        organizationId: 'org-1',
        status: LeaveRequestStatus.SUBMITTED,
        employee: {
          id: 'emp-1',
          userId: mockEmployeeUser.id, // Same user!
          managerId: 'emp-mgr-1',
        },
        leaveType: { name: 'Casual Leave' },
      });

      await expect(
        service.decide(mockEmployeeUser, 'req-1', {
          decision: ApprovalDecision.APPROVED,
          comments: 'Self approval attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents approval by unauthorized non-manager user with ForbiddenException', async () => {
      const otherUser: any = {
        id: 'user-other',
        organizationId: 'org-1',
        employeeCode: 'EMP999',
        roles: ['EMPLOYEE'],
      };

      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-other',
        userId: 'user-other',
        managerId: null,
      });

      prisma.leaveRequest.findUnique.mockResolvedValueOnce({
        id: 'req-1',
        organizationId: 'org-1',
        status: LeaveRequestStatus.SUBMITTED,
        employee: {
          id: 'emp-1',
          userId: 'user-emp-1',
          managerId: 'emp-mgr-1', // Not emp-other!
        },
        leaveType: { name: 'Casual Leave' },
      });

      hierarchyService.getTeamMemberIds.mockResolvedValueOnce([]); // emp-1 not in team

      await expect(
        service.decide(otherUser, 'req-1', {
          decision: ApprovalDecision.APPROVED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('approves leave request and consumes balance on the ledger', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-cl',
        leaveYear: 2026,
        chargeableDays: new Prisma.Decimal(2.0),
        status: LeaveRequestStatus.SUBMITTED,
        startDate: new Date('2026-10-15'),
        employee: {
          id: 'emp-1',
          userId: 'user-emp-1',
          managerId: 'emp-mgr-1',
        },
        leaveType: { name: 'Casual Leave' },
      });

      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-mgr-1',
        userId: mockManagerUser.id,
      });

      const res = await service.decide(mockManagerUser, 'req-1', {
        decision: ApprovalDecision.APPROVED,
        comments: 'Approved by manager',
      });

      expect(res.success).toBe(true);
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: LeaveRequestStatus.APPROVED },
        }),
      );
      expect(prisma.leaveApproval.create).toHaveBeenCalled();
    });

    it('rejects leave request with mandatory comment and releases reservation', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-cl',
        leaveYear: 2026,
        chargeableDays: new Prisma.Decimal(2.0),
        status: LeaveRequestStatus.SUBMITTED,
        startDate: new Date('2026-10-15'),
        employee: {
          id: 'emp-1',
          userId: 'user-emp-1',
          managerId: 'emp-mgr-1',
        },
        leaveType: { name: 'Casual Leave' },
      });

      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-mgr-1',
        userId: mockManagerUser.id,
      });

      const res = await service.decide(mockManagerUser, 'req-1', {
        decision: ApprovalDecision.REJECTED,
        comments: 'Quarterly release deliverables require all team members on site',
      });

      expect(res.success).toBe(true);
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: LeaveRequestStatus.REJECTED },
        }),
      );
    });

    it('throws BadRequestException if rejection reason is missing or empty', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValueOnce({
        id: 'req-1',
        organizationId: 'org-1',
        status: LeaveRequestStatus.SUBMITTED,
        employee: {
          id: 'emp-1',
          userId: 'user-emp-1',
          managerId: 'emp-mgr-1',
        },
        leaveType: { name: 'Casual Leave' },
      });

      prisma.employee.findFirst.mockResolvedValueOnce({
        id: 'emp-mgr-1',
        userId: mockManagerUser.id,
      });

      await expect(
        service.decide(mockManagerUser, 'req-1', {
          decision: ApprovalDecision.REJECTED,
          comments: '', // Empty comment
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels pending leave request and releases reserved ledger balance', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-cl',
        leaveYear: 2026,
        chargeableDays: new Prisma.Decimal(2.0),
        status: LeaveRequestStatus.SUBMITTED,
        employee: { userId: mockEmployeeUser.id },
        leaveType: { name: 'Casual Leave' },
      });

      const res = await service.cancel(mockEmployeeUser, 'req-1', {
        cancellationReason: 'Plans changed',
      });

      expect(res.success).toBe(true);
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LeaveRequestStatus.CANCELLED }),
        }),
      );
    });

    it('cancels approved leave request and reverses consumed ledger balance', async () => {
      prisma.leaveRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-cl',
        leaveYear: 2026,
        chargeableDays: new Prisma.Decimal(2.0),
        status: LeaveRequestStatus.APPROVED,
        employee: { userId: mockEmployeeUser.id },
        leaveType: { name: 'Casual Leave' },
      });

      const res = await service.cancel(mockEmployeeUser, 'req-1', {
        cancellationReason: 'Event postponed',
      });

      expect(res.success).toBe(true);
      expect(prisma.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LeaveRequestStatus.CANCELLED }),
        }),
      );
    });
  });
});
