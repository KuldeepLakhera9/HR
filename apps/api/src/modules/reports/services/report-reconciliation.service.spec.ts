import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ReportReconciliationService } from './report-reconciliation.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('ReportReconciliationService (Phase 10 - Step 10: Data Quality & Report Reconciliation)', () => {
  let service: ReportReconciliationService;
  let prisma: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    employeeCode: 'EMP-ADM-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-1',
    roles: ['ADMIN'],
    organizationId: 'org-1',
    permissions: ['REPORT_VIEW'],
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'manager@example.com',
    firstName: 'Manager',
    lastName: 'User',
    employeeCode: 'EMP-MGR-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-2',
    roles: ['MANAGER'],
    organizationId: 'org-1',
    permissions: ['REPORT_VIEW'],
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'employee@example.com',
    firstName: 'Employee',
    lastName: 'User',
    employeeCode: 'EMP-01',
    status: 'ACTIVE' as any,
    sessionId: 'session-3',
    roles: ['EMPLOYEE'],
    organizationId: 'org-1',
    permissions: ['REPORT_VIEW'],
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      attendanceDailySummary: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      leaveBalanceAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      performanceReview: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportReconciliationService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ReportReconciliationService>(ReportReconciliationService);
  });

  describe('1. Access Control and Authorization', () => {
    it('rejects Manager and Employee users with ForbiddenException', async () => {
      await expect(service.runDataQualityChecks(mockManagerUser, {})).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.runDataQualityChecks(mockEmployeeUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows Admin and HR users to execute reconciliation audits', async () => {
      const result = await service.runDataQualityChecks(mockAdminUser, {});
      expect(result).toBeDefined();
      expect(result.organizationId).toBe('org-1');
    });
  });

  describe('2. Clean State (Zero Discrepancies)', () => {
    it('returns HEALTHY status when all domain source records are consistent', async () => {
      const result = await service.runDataQualityChecks(mockAdminUser, {});

      expect(result.status).toBe('HEALTHY');
      expect(result.totalDiscrepanciesFound).toBe(0);
      expect(result.discrepancies).toHaveLength(0);
      expect(result.totalChecksEvaluated).toBeGreaterThan(0);
    });
  });

  describe('3. Workforce Data Quality Checks (DQ-WF)', () => {
    it('detects DQ-WF-01: Exited employee with missing exit date', async () => {
      prisma.employee.findMany.mockImplementation(async (args: any) => {
        if (args?.where?.exitDate === null && args?.where?.status) {
          return [
            {
              id: 'emp-bad-1',
              employeeCode: 'EMP-901',
              status: 'TERMINATED',
            },
          ];
        }
        return [];
      });

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'WORKFORCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-WF-01');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
      expect(d?.recordReference).toBe('EMP:EMP-901');
      expect(result.status).toBe('CRITICAL_DISCREPANCIES');
    });

    it('detects DQ-WF-02: Active employee missing department and branch hierarchy', async () => {
      prisma.employee.findMany.mockImplementation(async (args: any) => {
        if (args?.where?.employment === null) {
          return [
            {
              id: 'emp-bad-2',
              employeeCode: 'EMP-902',
              status: 'ACTIVE',
            },
          ];
        }
        return [];
      });

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'WORKFORCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-WF-02');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('WARNING');
      expect(d?.suggestedRemediation).toContain('Department and Branch');
    });

    it('detects DQ-WF-03: Inverted chronology where joiningDate > exitDate', async () => {
      prisma.employee.findMany.mockImplementation(async (args: any) => {
        if (args?.where?.exitDate?.not !== undefined) {
          return [
            {
              id: 'emp-bad-3',
              employeeCode: 'EMP-903',
              joiningDate: new Date('2026-06-01T00:00:00Z'),
              exitDate: new Date('2025-01-01T00:00:00Z'),
            },
          ];
        }
        return [];
      });

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'WORKFORCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-WF-03');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
    });
  });

  describe('4. Attendance Data Quality Checks (DQ-ATT)', () => {
    it('detects DQ-ATT-01: Summary marked PRESENT with zero work minutes and missing punch', async () => {
      prisma.attendanceDailySummary.findMany.mockImplementation(async (args: any) => {
        if (args?.where?.status === 'PRESENT') {
          return [
            {
              id: 'att-bad-1',
              date: new Date('2026-05-10T00:00:00Z'),
              totalWorkMinutes: 0,
              employee: { employeeCode: 'EMP-904' },
            },
          ];
        }
        return [];
      });

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'ATTENDANCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-ATT-01');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('WARNING');
      expect(d?.recordReference).toBe('ATT:EMP-904:2026-05-10');
    });

    it('detects DQ-ATT-02: Stale INCOMPLETE or PENDING_REVIEW summaries past 48h SLA', async () => {
      prisma.attendanceDailySummary.findMany.mockImplementation(async (args: any) => {
        if (args?.where?.status?.in?.includes('INCOMPLETE')) {
          return [
            {
              id: 'att-bad-2',
              date: new Date('2026-05-01T00:00:00Z'),
              status: 'INCOMPLETE',
              employee: { employeeCode: 'EMP-905' },
            },
          ];
        }
        return [];
      });

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'ATTENDANCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-ATT-02');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('INFO');
    });
  });

  describe('5. Leave Balances Ledger Reconciliation (DQ-LV)', () => {
    it('detects DQ-LV-01: Usage ledger drift between balance account and approved requests', async () => {
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([
        {
          id: 'bal-1',
          employeeId: 'emp-10',
          leaveTypeId: 'lt-annual',
          allocatedBalance: 20,
          usedBalance: 12, // Recorded 12 days used
          employee: { employeeCode: 'EMP-906' },
          leaveType: { name: 'Annual Leave' },
        },
      ]);

      // But actual approved leave requests sum to only 8 days
      prisma.leaveRequest.findMany.mockResolvedValue([
        { chargeableDays: 5 },
        { chargeableDays: 3 },
      ]);

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'LEAVE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-LV-01');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
      expect(d?.expectedValue).toBe(8);
      expect(d?.actualValue).toBe(12);
      expect(d?.recordReference).toBe('BAL:EMP-906:Annual Leave');
    });

    it('detects DQ-LV-02: Overdrawn leave balance where usedBalance > allocatedBalance', async () => {
      prisma.leaveBalanceAccount.findMany.mockResolvedValue([
        {
          id: 'bal-2',
          employeeId: 'emp-11',
          leaveTypeId: 'lt-casual',
          allocatedBalance: 10,
          usedBalance: 15, // Overdrawn
          employee: { employeeCode: 'EMP-907' },
          leaveType: { name: 'Casual Leave' },
        },
      ]);

      prisma.leaveRequest.findMany.mockResolvedValue([{ chargeableDays: 15 }]);

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'LEAVE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-LV-02');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('WARNING');
      expect(d?.description).toContain('exceeds allocated balance');
    });
  });

  describe('6. Request Interval Conflicts (DQ-REQ)', () => {
    it('detects DQ-REQ-01: Overlapping approved leave requests for the same employee', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          employeeId: 'emp-20',
          startDate: new Date('2026-07-01T00:00:00Z'),
          endDate: new Date('2026-07-05T00:00:00Z'),
          employee: { employeeCode: 'EMP-908' },
        },
        {
          id: 'req-2',
          employeeId: 'emp-20',
          startDate: new Date('2026-07-04T00:00:00Z'), // Overlaps with req-1
          endDate: new Date('2026-07-08T00:00:00Z'),
          employee: { employeeCode: 'EMP-908' },
        },
      ]);

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'REQUESTS' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-REQ-01');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
      expect(d?.description).toContain('Overlapping leave request dates');
    });
  });

  describe('7. Performance Review Rating Policy (DQ-PM)', () => {
    it('detects DQ-PM-01: Finalized review with missing rating score', async () => {
      prisma.performanceReview.findMany.mockResolvedValue([
        {
          id: 'rev-bad-1',
          overallScore: null,
          employee: { employeeCode: 'EMP-909' },
          cycle: { name: 'Annual Review 2026' },
        },
      ]);

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'PERFORMANCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-PM-01');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
      expect(d?.actualValue).toBe('NULL');
    });

    it('detects DQ-PM-02: Overall rating score outside the approved [1.00, 5.00] scale', async () => {
      prisma.performanceReview.findMany.mockResolvedValue([
        {
          id: 'rev-bad-2',
          overallScore: 6.25,
          employee: { employeeCode: 'EMP-910' },
          cycle: { name: 'Annual Review 2026' },
        },
      ]);

      const result = await service.runDataQualityChecks(mockAdminUser, { domain: 'PERFORMANCE' });

      const d = result.discrepancies.find((item) => item.checkCode === 'DQ-PM-02');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('CRITICAL');
      expect(d?.actualValue).toBe(6.25);
    });
  });

  describe('8. Non-Destructive Guarantee & Privacy', () => {
    it('strictly executes read-only operations and never mutates or deletes source records', async () => {
      await service.runDataQualityChecks(mockAdminUser, {});

      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.employee.delete).not.toHaveBeenCalled();
      expect(prisma.attendanceDailySummary.update).not.toHaveBeenCalled();
      expect(prisma.attendanceDailySummary.delete).not.toHaveBeenCalled();
      expect(prisma.leaveBalanceAccount.update).not.toHaveBeenCalled();
      expect(prisma.leaveRequest.update).not.toHaveBeenCalled();
      expect(prisma.leaveRequest.delete).not.toHaveBeenCalled();
      expect(prisma.performanceReview.update).not.toHaveBeenCalled();
    });

    it('redacts sensitive personal details and exposes only safe identifier references', async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: 'e1', employeeCode: 'EMP-SAFE-01', status: 'TERMINATED' },
      ]);

      const result = await service.runDataQualityChecks(mockAdminUser, {});
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('salary');
      expect(serialized).not.toContain('medical');
      expect(serialized).not.toContain('secret');
    });
  });
});
