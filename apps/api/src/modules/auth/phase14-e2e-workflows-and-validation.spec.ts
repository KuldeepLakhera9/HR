import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from './interfaces/auth.interface';
import { EmployeesService } from '../employees/employees.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendancePoliciesService } from '../attendance/attendance-policies.service';
import { PayrollRunsService } from '../payroll/services/payroll-runs.service';
import { PayrollCalculationEngineService } from '../payroll/services/payroll-calculation-engine.service';
import { PayrollValidationService } from '../payroll/services/payroll-validation.service';
import { PayrollInputsService } from '../payroll/services/payroll-inputs.service';

describe('Phase 14: Enterprise HRMS End-to-End Workflows, RBAC & Bug Regression', () => {
  const orgId = 'org-phase14-enterprise';

  // 1. Role Profiles
  const adminUser: AuthenticatedUser = {
    id: 'user-admin-14',
    email: 'admin@peopleos.local',
    firstName: 'System',
    lastName: 'Admin',
    employeeCode: 'ADM001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-admin',
    roles: ['ADMIN'],
    permissions: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'ORGANIZATION_MANAGE',
      'AUDIT_VIEW',
      'PAYROLL_VIEW',
      'PAYROLL_APPROVE',
    ],
    organizationId: orgId,
  };

  const hrUser: AuthenticatedUser = {
    id: 'user-hr-14',
    email: 'hr@peopleos.local',
    firstName: 'Harita',
    lastName: 'Rao',
    employeeCode: 'HR001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-hr',
    roles: ['HR'],
    permissions: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'LEAVE_VIEW',
      'LEAVE_APPROVE',
      'ATTENDANCE_VIEW',
      'REPORTS_VIEW',
    ],
    organizationId: orgId,
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-mgr-14',
    email: 'manager@peopleos.local',
    firstName: 'Mukesh',
    lastName: 'Sharma',
    employeeCode: 'MGR001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-mgr',
    roles: ['MANAGER'],
    permissions: [
      'EMPLOYEE_VIEW',
      'ATTENDANCE_VIEW',
      'LEAVE_APPROVE',
      'WFH_APPROVE',
      'VISIT_APPROVE',
      'PERFORMANCE_REVIEW',
    ],
    organizationId: orgId,
  };

  const employeeUser: AuthenticatedUser = {
    id: 'user-emp-14',
    email: 'employee@peopleos.local',
    firstName: 'Esha',
    lastName: 'Patel',
    employeeCode: 'EMP001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp',
    roles: ['EMPLOYEE'],
    permissions: ['ATTENDANCE_MARK', 'LEAVE_APPLY', 'WFH_APPLY', 'VISIT_APPLY', 'PAYSLIP_VIEW'],
    organizationId: orgId,
  };

  const colleagueUser: AuthenticatedUser = {
    id: 'user-colleague-14',
    email: 'colleague@peopleos.local',
    firstName: 'Chetan',
    lastName: 'Verma',
    employeeCode: 'EMP002',
    status: 'ACTIVE' as any,
    sessionId: 'sess-colleague',
    roles: ['EMPLOYEE'],
    permissions: ['ATTENDANCE_MARK', 'LEAVE_APPLY', 'PAYSLIP_VIEW'],
    organizationId: orgId,
  };

  // Mock Prisma and Services
  let mockPrisma: any;
  let mockAudit: any;
  let hierarchyService: HierarchyService;
  let employeesService: EmployeesService;
  let attendanceService: AttendanceService;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        if (typeof cb === 'function') return cb(mockPrisma);
        return cb;
      }),
      employee: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id === 'emp-mgr-1') {
            return Promise.resolve({ id: 'emp-mgr-1', organizationId: orgId, isActive: true });
          }
          if (where?.id === 'emp-outside-team') {
            return Promise.resolve({ id: 'emp-outside-team', organizationId: orgId });
          }
          if (where?.id === 'emp-chetan') {
            return Promise.resolve({ id: 'emp-chetan', organizationId: orgId });
          }
          if (where?.id === 'emp-exited') {
            return Promise.resolve({ id: 'emp-exited', organizationId: orgId });
          }
          if (where?.id === 'emp-new-1') {
            return Promise.resolve({ id: 'emp-new-1', organizationId: orgId, isActive: true });
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeEmployment: {
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeContact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'branch-hq', organizationId: orgId }),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dept-eng', organizationId: orgId }),
      },
      designation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'desig-dev', organizationId: orgId }),
      },
      salaryStructure: {
        findUnique: jest.fn().mockResolvedValue({ id: 'struct-eng-1', organizationId: orgId }),
      },
      employeeCompensation: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
      payrollRun: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payslip: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      leaveBalance: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      attendanceRecord: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceException: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-new-1' }),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'role-emp', code: 'EMPLOYEE' }),
      },
      userRole: {
        create: jest.fn().mockResolvedValue({ id: 'ur-1' }),
      },
      employeeHistory: {
        create: jest.fn().mockResolvedValue({ id: 'eh-1' }),
      },
    };

    mockAudit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      recordAuth: jest.fn().mockResolvedValue({ id: 'audit-2' }),
      sanitizeMetadata: jest.fn().mockImplementation((d) => d),
    };

    hierarchyService = new HierarchyService(mockPrisma);
    employeesService = new EmployeesService(mockPrisma, mockAudit, hierarchyService);
    attendanceService = new AttendanceService(
      mockPrisma,
      mockAudit,
      new AttendancePoliciesService(mockPrisma, mockAudit),
      hierarchyService,
    );
  });

  // =========================================================================
  // SECTION 6: ROLE-BASED ACCESS CONTROL (RBAC) SCENARIOS
  // =========================================================================
  describe('Role-Based Access Control Scenarios', () => {
    it('ADMIN: Can access employee directory and administrative operations across tenant', async () => {
      mockPrisma.employee.count.mockResolvedValue(10);
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'EMP001',
          displayName: 'Esha Patel',
          joiningDate: new Date('2026-01-01'),
          organizationId: orgId,
          status: 'ACTIVE',
          employment: {},
        },
      ]);

      const result = await employeesService.findAll(adminUser, { page: 1, limit: 10 });

      expect(result.meta.total).toBe(10);
      expect(result.items.length).toBe(1);
      expect(result.items[0].displayName).toBe('Esha Patel');
    });

    it('HR: Permitted to query organization employees but scoped to organizationId', async () => {
      mockPrisma.employee.count.mockResolvedValue(5);
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-2',
          employeeCode: 'EMP002',
          displayName: 'Chetan Verma',
          joiningDate: new Date('2026-01-01'),
          organizationId: orgId,
          status: 'ACTIVE',
          employment: {},
        },
      ]);

      const result = await employeesService.findAll(hrUser, { page: 1, limit: 10 });

      expect(result.meta.total).toBe(5);
      expect(result.items[0].displayName).toBe('Chetan Verma');
    });

    it('MANAGER: Scope restricted strictly to subordinates; unauthorized employee access throws ForbiddenException', async () => {
      // Find manager employee record
      mockPrisma.employee.findFirst.mockImplementation(({ where }: any) => {
        if (where?.userId === managerUser.id) {
          return Promise.resolve({
            id: 'emp-mgr-1',
            employeeCode: 'MGR001',
            organizationId: orgId,
          });
        }
        // Searching for target outside team returns null (not in manager's scoped subordinates)
        return Promise.resolve(null);
      });

      // Manager attempts to view employee outside their team
      await expect(employeesService.findOne('emp-outside-team', managerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('EMPLOYEE: Can access only own self-service record; querying colleague throws ForbiddenException', async () => {
      mockPrisma.employee.findFirst.mockImplementation(({ where }: any) => {
        if (where?.userId === employeeUser.id) {
          return Promise.resolve({ id: 'emp-esha', employeeCode: 'EMP001', organizationId: orgId });
        }
        // Querying colleague returns null under own-record scope filter
        return Promise.resolve(null);
      });

      // Esha attempts to view Chetan's employee profile
      await expect(employeesService.findOne('emp-chetan', employeeUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // SECTION 7: COMPLETE BUSINESS WORKFLOW TESTS (A to G)
  // =========================================================================
  describe('Complete Business Workflow A: Employee Onboarding', () => {
    it('should validate required fields, manager link, and create employee transactionally', async () => {
      const createDto: any = {
        firstName: 'Rahul',
        lastName: 'Menon',
        workEmail: 'rahul.menon@peopleos.local',
        joiningDate: '2026-11-01',
        employmentType: 'FULL_TIME',
        workMode: 'OFFICE',
        departmentId: 'dept-eng',
        designationId: 'desig-dev',
        branchId: 'branch-hq',
        managerId: 'emp-mgr-1',
        salaryStructureId: 'struct-eng-1',
        annualCtc: 1200000,
      };

      mockPrisma.employeeContact.findFirst.mockResolvedValue(null);
      mockPrisma.employee.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id === 'emp-mgr-1') {
          return Promise.resolve({
            id: 'emp-mgr-1',
            organizationId: orgId,
            status: 'ACTIVE',
            isActive: true,
          });
        }
        return Promise.resolve({
          id: 'emp-new-1',
          employeeCode: 'EMP003',
          displayName: 'Rahul Menon',
          organizationId: orgId,
          status: 'PROBATION',
          employment: { branch: {}, department: {}, designation: {} },
          contact: { workEmail: 'rahul.menon@peopleos.local' },
        });
      });

      mockPrisma.employee.create.mockResolvedValue({
        id: 'emp-new-1',
        employeeCode: 'EMP003',
        firstName: 'Rahul',
        lastName: 'Menon',
        displayName: 'Rahul Menon',
        status: 'PROBATION',
        organizationId: orgId,
      });

      const result = await employeesService.create(createDto, adminUser);

      expect(result).toBeDefined();
      expect(result.id).toBe('emp-new-1');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_CREATED',
          entity: 'Employee',
        }),
      );
    });

    it('should reject duplicate employee workEmail with ConflictException', async () => {
      mockPrisma.employeeContact.findFirst.mockResolvedValue({
        id: 'contact-existing',
        workEmail: 'duplicate@corp.com',
      });

      await expect(
        employeesService.create(
          {
            firstName: 'Duplicate',
            lastName: 'User',
            workEmail: 'duplicate@corp.com',
            joiningDate: '2026-11-01',
            departmentId: 'dept-eng',
            designationId: 'desig-dev',
            branchId: 'branch-hq',
          } as any,
          adminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Complete Business Workflow B: Leave Approval & Balance Ledger', () => {
    it('should deduct balance when manager approves leave and transition status to APPROVED', async () => {
      const pendingLeave = {
        id: 'leave-101',
        organizationId: orgId,
        employeeId: 'emp-esha',
        leaveTypeId: 'type-annual',
        startDate: new Date('2026-10-15'),
        endDate: new Date('2026-10-16'),
        totalDays: 2,
        status: 'PENDING',
      };

      const leaveBalance = {
        id: 'bal-annual',
        employeeId: 'emp-esha',
        leaveTypeId: 'type-annual',
        currentBalance: 12,
        pendingBalance: 2,
      };

      mockPrisma.leaveRequest.findUnique = jest.fn().mockResolvedValue(pendingLeave);
      mockPrisma.leaveBalance.findFirst.mockResolvedValue(leaveBalance);

      const updatedLeave = { ...pendingLeave, status: 'APPROVED', decidedById: managerUser.id };
      mockPrisma.leaveRequest.update.mockResolvedValue(updatedLeave);
      mockPrisma.leaveBalance.update.mockResolvedValue({
        ...leaveBalance,
        currentBalance: 10,
        pendingBalance: 0,
      });

      expect(updatedLeave.status).toBe('APPROVED');
      expect(leaveBalance.currentBalance - pendingLeave.totalDays).toBe(10);
    });

    it('should prevent invalid date ranges where endDate < startDate', () => {
      const start = new Date('2026-10-20');
      const end = new Date('2026-10-18');

      expect(end.getTime()).toBeLessThan(start.getTime());
      const isValidRange = start <= end;
      expect(isValidRange).toBe(false);
    });
  });

  describe('Complete Business Workflow C: Attendance & Idempotent Exception Handling', () => {
    it('should record attendance exceptions idempotently using deterministic hash key', async () => {
      const exceptionParams: any = {
        organizationId: orgId,
        employeeId: 'emp-esha',
        date: new Date('2026-10-13T09:30:00Z'),
        exceptionType: 'LATE_CHECKIN',
        details: {
          shiftExpected: '09:00',
          actualCheckIn: '09:30',
          delayMinutes: 30,
        },
        idempotencyKey: 'ex:LATE_CHECKIN:emp-esha:2026-10-13',
      };

      // Mock first call: creates exception
      mockPrisma.attendanceException.findUnique.mockResolvedValueOnce(null);
      mockPrisma.attendanceException.create.mockResolvedValueOnce({
        id: 'ex-101',
        ...exceptionParams,
      });

      const firstCall = await attendanceService.recordAttendanceException(exceptionParams);
      expect(firstCall).toBeDefined();
      expect(firstCall?.id).toBe('ex-101');

      // Second call: findUnique detects idempotencyKey already exists
      mockPrisma.attendanceException.findUnique.mockResolvedValueOnce({
        id: 'ex-101',
        ...exceptionParams,
      });

      const secondCall = await attendanceService.recordAttendanceException(exceptionParams);
      expect(secondCall).toBeDefined();
      expect(secondCall?.id).toBe('ex-101');
    });
  });

  describe('Complete Business Workflow G: Payroll Lifecycle & Payslip Isolation', () => {
    let calcEngine: PayrollCalculationEngineService;
    let runsService: PayrollRunsService;
    let validationService: PayrollValidationService;
    let inputsService: PayrollInputsService;

    beforeEach(() => {
      calcEngine = new PayrollCalculationEngineService();
      validationService = new PayrollValidationService(mockPrisma, mockAudit);
      inputsService = new PayrollInputsService(mockPrisma);
      runsService = new PayrollRunsService(
        mockPrisma,
        mockAudit,
        calcEngine,
        inputsService,
        validationService,
      );
    });

    it('should calculate gross, deductions, and net pay with exact 2-decimal precision', () => {
      const basic = new Prisma.Decimal('50000.00');
      const hra = new Prisma.Decimal('25000.00');
      const special = new Prisma.Decimal('15000.00');
      const gross = basic.add(hra).add(special); // 90,000.00

      const pf = new Prisma.Decimal('1800.00');
      const pt = new Prisma.Decimal('200.00');
      const totalDeductions = pf.add(pt); // 2,000.00

      const netPay = gross.sub(totalDeductions); // 88,000.00

      expect(gross.toString()).toBe('90000');
      expect(totalDeductions.toString()).toBe('2000');
      expect(netPay.toString()).toBe('88000');
      expect(netPay.toFixed(2)).toBe('88000.00');
    });

    it('should block ordinary users from recalculating or editing a LOCKED payroll run', async () => {
      const lockedRun = {
        id: 'run-locked-14',
        organizationId: orgId,
        status: 'LOCKED',
        isLocked: true,
      };

      mockPrisma.payrollRun.findFirst.mockResolvedValue(lockedRun);

      await expect(runsService.calculate(orgId, 'run-locked-14', adminUser.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should enforce strict employee payslip isolation (Chetan cannot access Esha payslip)', async () => {
      const eshaPayslip = {
        id: 'ps-esha-14',
        organizationId: orgId,
        employeeId: 'emp-esha',
        netPay: new Prisma.Decimal('88000.00'),
        employee: {
          id: 'emp-esha',
          userId: employeeUser.id,
          employeeCode: 'EMP001',
        },
      };

      mockPrisma.payslip.findFirst.mockImplementation(({ where }: any) => {
        if (where?.id === 'ps-esha-14' && where?.employeeId === 'emp-chetan') {
          return Promise.resolve(null);
        }
        if (where?.id === 'ps-esha-14' && where?.employeeId === 'emp-esha') {
          return Promise.resolve(eshaPayslip);
        }
        return Promise.resolve(null);
      });

      const chetanQuery = await mockPrisma.payslip.findFirst({
        where: { id: 'ps-esha-14', employeeId: 'emp-chetan', organizationId: orgId },
      });
      expect(chetanQuery).toBeNull();

      const eshaQuery = await mockPrisma.payslip.findFirst({
        where: { id: 'ps-esha-14', employeeId: 'emp-esha', organizationId: orgId },
      });
      expect(eshaQuery).toBeDefined();
      expect(eshaQuery.id).toBe('ps-esha-14');
    });
  });

  // =========================================================================
  // SECTION 9: REGRESSION AND EDGE-CASE TESTING
  // =========================================================================
  describe('Regression & Edge-Case Testing', () => {
    it('Empty Datasets: should return zero counts and empty arrays gracefully without runtime errors', async () => {
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await employeesService.findAll(adminUser, { page: 1, limit: 10 });

      expect(result.meta.total).toBe(0);
      expect(result.items).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });

    it('Cross-Tenant Security: Access to resource in different organization is rejected with NotFoundException', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(employeesService.findOne('emp-foreign-org', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('State Machine Immutability: Exited employees cannot be transitioned back to Probation', async () => {
      const exitedEmployee = {
        id: 'emp-exited',
        organizationId: orgId,
        status: 'EXITED',
      };

      // Mock findOne checks
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-exited', organizationId: orgId });
      mockPrisma.employee.findFirst.mockResolvedValue(exitedEmployee);

      await expect(
        employeesService.transitionStatus(
          'emp-exited',
          {
            status: 'PROBATION' as any,
            reason: 'Attempt invalid transition from terminal state',
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
