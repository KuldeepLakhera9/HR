import { Test, TestingModule } from '@nestjs/testing';
import { GoalsService } from './goals.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService } from '../notifications/notifications.module';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { GoalStatus, GoalActionType } from '@prisma/client';

describe('GoalsService (Enterprise Goals & KPI Management)', () => {
  let service: GoalsService;
  let prisma: any;
  let audit: any;
  let hierarchy: any;
  let notifications: any;

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'priya@example.com',
    organizationId: 'org-1',
    firstName: 'Priya',
    lastName: 'Nair',
    employeeCode: 'EMP001',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: [],
    sessionId: 'sess-1',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'rahul@example.com',
    organizationId: 'org-1',
    firstName: 'Rahul',
    lastName: 'Sharma',
    employeeCode: 'MGR001',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: [],
    sessionId: 'sess-2',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'hr@example.com',
    organizationId: 'org-1',
    firstName: 'Ananya',
    lastName: 'Iyer',
    employeeCode: 'HR001',
    status: 'ACTIVE',
    roles: ['HR'],
    permissions: [],
    sessionId: 'sess-3',
  };

  const mockCallerEmployee = {
    id: 'emp-1',
    employeeCode: 'EMP001',
    displayName: 'Priya Nair',
    organizationId: 'org-1',
    managerId: 'emp-mgr-1',
    status: 'ACTIVE',
  };

  const mockManagerEmployee = {
    id: 'emp-mgr-1',
    employeeCode: 'MGR001',
    displayName: 'Rahul Sharma',
    organizationId: 'org-1',
    managerId: null,
    status: 'ACTIVE',
  };

  const mockOtherEmployee = {
    id: 'emp-other',
    employeeCode: 'EMP999',
    displayName: 'External Colleague',
    organizationId: 'org-1',
    managerId: 'other-mgr',
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === mockEmployeeUser.id || where.id === 'emp-1') {
            return Promise.resolve(mockCallerEmployee);
          }
          if (where.userId === mockManagerUser.id || where.id === 'emp-mgr-1') {
            return Promise.resolve(mockManagerEmployee);
          }
          if (where.id === 'emp-other') {
            return Promise.resolve(mockOtherEmployee);
          }
          return Promise.resolve(null);
        }),
      },
      reviewCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          name: 'Q4 2026',
          status: 'GOAL_SETTING',
        }),
      },
      performanceGoal: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: 'goal-1' }),
        count: jest.fn().mockResolvedValue(1),
      },
      goalHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      },
      goalProgressUpdate: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    audit = {
      record: jest.fn().mockResolvedValue(true),
    };

    hierarchy = {
      isManagerOf: jest.fn().mockImplementation((mgrId, empId) => {
        return Promise.resolve(mgrId === 'emp-mgr-1' && empId === 'emp-1');
      }),
      getTeam: jest.fn().mockResolvedValue({
        manager: mockManagerEmployee,
        directReports: [mockCallerEmployee],
        indirectReports: [],
        allMemberIds: ['emp-1'],
        totalTeamSize: 1,
      }),
    };

    notifications = {
      createNotification: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: HierarchyService, useValue: hierarchy },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<GoalsService>(GoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGoal', () => {
    it('creates a draft goal for an employee successfully', async () => {
      prisma.performanceGoal.create.mockResolvedValue({
        id: 'goal-1',
        title: 'Complete Next.js App Shell',
        weight: 25.0,
        status: GoalStatus.DRAFT,
        employee: mockCallerEmployee,
        cycle: { id: 'cycle-1', name: 'Q4 2026' },
      });

      const result = await service.createGoal(mockEmployeeUser, {
        title: 'Complete Next.js App Shell',
        description: 'Migrate to responsive AppShell layout',
        weight: 25.0,
        category: 'QUANTITATIVE',
        measurementType: 'NUMERIC',
        targetValue: 100,
        baselineValue: 0,
        startDate: '2026-10-01',
        dueDate: '2026-12-31',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('goal-1');
      expect(prisma.performanceGoal.create).toHaveBeenCalled();
      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: GoalActionType.CREATED,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GOAL_CREATED' }),
      );
    });

    it('rejects goal creation if dueDate is earlier than startDate', async () => {
      await expect(
        service.createGoal(mockEmployeeUser, {
          title: 'Invalid Dates Goal',
          description: 'Testing dates',
          weight: 20,
          startDate: '2026-12-31',
          dueDate: '2026-10-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects goal creation if employee attempts to create goal for another employee', async () => {
      await expect(
        service.createGoal(mockEmployeeUser, {
          employeeId: 'emp-other',
          title: 'Unauthorized Goal',
          description: 'Should fail',
          weight: 20,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects goal creation if total weight exceeds 100%', async () => {
      prisma.performanceGoal.findMany.mockResolvedValue([{ weight: 60.0 }, { weight: 30.0 }]);

      await expect(
        service.createGoal(mockEmployeeUser, {
          title: 'Heavy Goal',
          description: 'Would cause 110% total weight',
          weight: 20.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows manager to assign goal to authorized direct report', async () => {
      prisma.performanceGoal.create.mockResolvedValue({
        id: 'goal-mgr-assigned',
        title: 'Team Delivery Target',
        weight: 30,
        status: GoalStatus.DRAFT,
      });

      const res = await service.createGoal(mockManagerUser, {
        employeeId: 'emp-1',
        title: 'Team Delivery Target',
        description: 'Assigned by manager',
        weight: 30,
      });

      expect(res).toBeDefined();
      expect(hierarchy.isManagerOf).toHaveBeenCalledWith('emp-mgr-1', 'emp-1', 'org-1');
    });

    it('rejects manager assigning goal to employee outside their team', async () => {
      await expect(
        service.createGoal(mockManagerUser, {
          employeeId: 'emp-other',
          title: 'Unrelated Team Goal',
          description: 'Should fail',
          weight: 20,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitGoal', () => {
    it('submits a DRAFT goal for manager approval', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.DRAFT,
      });
      prisma.performanceGoal.update.mockResolvedValue({
        id: 'goal-1',
        status: GoalStatus.PENDING_APPROVAL,
      });

      const res = await service.submitGoal(mockEmployeeUser, 'goal-1');
      expect(res.status).toBe(GoalStatus.PENDING_APPROVAL);
      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: GoalActionType.SUBMITTED }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GOAL_SUBMITTED' }),
      );
    });

    it('throws BadRequestException if goal is already approved', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.APPROVED,
      });

      await expect(service.submitGoal(mockEmployeeUser, 'goal-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approveGoal', () => {
    it('approves a pending goal when called by authorized manager', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.PENDING_APPROVAL,
      });
      prisma.performanceGoal.update.mockResolvedValue({
        id: 'goal-1',
        status: GoalStatus.APPROVED,
        approvedById: 'emp-mgr-1',
      });

      const res = await service.approveGoal(mockManagerUser, 'goal-1', {
        approved: true,
      });

      expect(res.status).toBe(GoalStatus.APPROVED);
      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: GoalActionType.APPROVED }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GOAL_APPROVED' }),
      );
    });

    it('strictly prevents employees/managers from approving their own goals', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-mgr-own',
        employeeId: 'emp-mgr-1', // Same as caller
        organizationId: 'org-1',
        status: GoalStatus.PENDING_APPROVAL,
      });

      await expect(
        service.approveGoal(mockManagerUser, 'goal-mgr-own', { approved: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects goal approval from non-manager third party', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.PENDING_APPROVAL,
      });

      await expect(
        service.approveGoal(mockEmployeeUser, 'goal-1', { approved: true }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateProgress', () => {
    it('calculates deterministic progress percentage based on target and baseline', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.APPROVED,
        measurementType: 'NUMERIC',
        baselineValue: 0,
        targetValue: 100,
        currentValue: 20,
        progressPercentage: 20,
      });

      prisma.goalProgressUpdate.create.mockResolvedValue({
        id: 'prog-1',
        previousProgress: 20,
        newProgress: 65,
        note: 'Completed module phase A and B',
      });

      prisma.performanceGoal.update.mockResolvedValue({
        id: 'goal-1',
        currentValue: 65,
        progressPercentage: 65,
        status: GoalStatus.IN_PROGRESS,
      });

      const res = await service.updateProgress(mockEmployeeUser, 'goal-1', {
        currentValue: 65,
        note: 'Completed module phase A and B',
      });

      expect(res.updatedGoal.progressPercentage).toBe(65);
      expect(res.updatedGoal.status).toBe(GoalStatus.IN_PROGRESS);
      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: GoalActionType.PROGRESS_UPDATED }),
        }),
      );
    });

    it('automatically transitions to COMPLETED when progress reaches 100%', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.IN_PROGRESS,
        measurementType: 'NUMERIC',
        baselineValue: 0,
        targetValue: 100,
        currentValue: 65,
        progressPercentage: 65,
      });

      prisma.goalProgressUpdate.create.mockResolvedValue({
        id: 'prog-2',
        previousProgress: 65,
        newProgress: 100,
        note: 'Done!',
      });

      prisma.performanceGoal.update.mockResolvedValue({
        id: 'goal-1',
        currentValue: 100,
        progressPercentage: 100,
        status: GoalStatus.COMPLETED,
      });

      const res = await service.updateProgress(mockEmployeeUser, 'goal-1', {
        currentValue: 100,
        note: 'All deliverables finished!',
      });

      expect(res.updatedGoal.status).toBe(GoalStatus.COMPLETED);
    });

    it('rejects progress updates on unapproved DRAFT goals', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.DRAFT,
      });

      await expect(
        service.updateProgress(mockEmployeeUser, 'goal-1', {
          currentValue: 50,
          note: 'Premature progress',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGoal & Target/Weight changes', () => {
    it('records explicit TARGET_CHANGED and WEIGHT_CHANGED in history', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.DRAFT,
        title: 'Original Title',
        targetValue: 50,
        weight: 20,
      });

      prisma.performanceGoal.update.mockResolvedValue({
        id: 'goal-1',
        title: 'Original Title',
        targetValue: 75,
        weight: 30,
      });

      await service.updateGoal(mockEmployeeUser, 'goal-1', {
        targetValue: 75,
        weight: 30,
        changeReason: 'Scope expanded',
      });

      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: GoalActionType.TARGET_CHANGED,
            changeReason: 'Scope expanded',
          }),
        }),
      );

      expect(prisma.goalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: GoalActionType.WEIGHT_CHANGED,
            changeReason: 'Scope expanded',
          }),
        }),
      );
    });
  });

  describe('getGoals scoped querying', () => {
    it('scopes regular employee queries to own employeeId only', async () => {
      await service.getGoals(mockEmployeeUser, { page: 1, limit: 10 });

      expect(prisma.performanceGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('scopes manager queries to direct and indirect team reports', async () => {
      await service.getGoals(mockManagerUser, { page: 1, limit: 10 });

      expect(prisma.performanceGoal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: { in: ['emp-mgr-1', 'emp-1'] },
            organizationId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('deleteGoal', () => {
    it('allows owner to delete goal in DRAFT status', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.DRAFT,
        title: 'Draft Goal',
      });

      const res = await service.deleteGoal(mockEmployeeUser, 'goal-1');
      expect(res.success).toBe(true);
      expect(prisma.performanceGoal.delete).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GOAL_DELETED' }),
      );
    });

    it('prevents employee from deleting an APPROVED goal', async () => {
      prisma.performanceGoal.findFirst.mockResolvedValue({
        id: 'goal-1',
        employeeId: 'emp-1',
        organizationId: 'org-1',
        status: GoalStatus.APPROVED,
        title: 'Approved Goal',
      });

      await expect(service.deleteGoal(mockEmployeeUser, 'goal-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
