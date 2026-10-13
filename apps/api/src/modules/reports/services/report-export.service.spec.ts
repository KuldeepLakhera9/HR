import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReportExportService } from './report-export.service';
import { PayrollAnalyticsService } from './payroll-analytics.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('ReportExportService (Phase 10 - Step 8: Secure Report Exports)', () => {
  let service: ReportExportService;
  let prisma: any;
  let hierarchyService: any;

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
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      attendanceDailySummary: {
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
      reviewCycleParticipant: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
    };

    hierarchyService = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-subordinate-1', 'emp-subordinate-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: HierarchyService, useValue: hierarchyService },
        {
          provide: PayrollAnalyticsService,
          useValue: {
            checkPayrollReportAccess: jest.fn(),
            getPayrollSummaryReport: jest.fn().mockResolvedValue({}),
            getCostCenterReport: jest.fn().mockResolvedValue({}),
            getPayrollRegisterReport: jest.fn().mockResolvedValue({ items: [] }),
            getEarningsDeductionsReport: jest
              .fn()
              .mockResolvedValue({ earnings: [], deductions: [], employerContributions: [] }),
            getPayrollExceptionsReport: jest.fn().mockResolvedValue({}),
            getPeriodComparisonReport: jest.fn().mockResolvedValue({ variances: [] }),
            getPayrollAdjustmentsReport: jest.fn().mockResolvedValue({ items: [] }),
            getPayrollApprovalHistory: jest.fn().mockResolvedValue({ items: [] }),
            getPaymentReconciliationReport: jest.fn().mockResolvedValue({ items: [] }),
          },
        },
      ],
    }).compile();

    service = module.get<ReportExportService>(ReportExportService);
  });

  describe('1. Formula Injection Protection (CWE-1236)', () => {
    it('should prefix dangerous formula starters (=, +, -, @, \\t, \\r, %) with a single quote', () => {
      expect(service.sanitizeCsvField('=cmd|"/c calc"!A0')).toBe(`"'=cmd|""/c calc""!A0"`);
      expect(service.sanitizeCsvField('+123456789')).toBe(`"'+123456789"`);
      expect(service.sanitizeCsvField('-987654321')).toBe(`"'-987654321"`);
      expect(service.sanitizeCsvField('@SUM(A1:A10)')).toBe(`"'@SUM(A1:A10)"`);
      expect(service.sanitizeCsvField('\tTAB_INJECT')).toBe(`"'\tTAB_INJECT"`);
      expect(service.sanitizeCsvField('\rCR_INJECT')).toBe(`"'\rCR_INJECT"`);
      expect(service.sanitizeCsvField('%PERCENT')).toBe(`"'%PERCENT"`);
    });

    it('should properly format normal text and escape internal double quotes', () => {
      expect(service.sanitizeCsvField('Engineering')).toBe(`"Engineering"`);
      expect(service.sanitizeCsvField('Jane "The Rock" Doe')).toBe(`"Jane ""The Rock"" Doe"`);
      expect(service.sanitizeCsvField(100)).toBe(`"100"`);
      expect(service.sanitizeCsvField(null)).toBe('""');
      expect(service.sanitizeCsvField(undefined)).toBe('""');
    });
  });

  describe('2. RBAC Scope Enforcement', () => {
    it('should reject employee users with ForbiddenException', async () => {
      await expect(
        service.exportReportCsv(mockEmployeeUser, { reportKey: 'REP-WF-01' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should grant organization-wide scope to ADMIN and HR users', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      const result = await service.exportReportCsv(mockAdminUser, { reportKey: 'REP-WF-01' });

      expect(result).toBeDefined();
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            id: expect.anything(),
          }),
        }),
      );
    });

    it('should restrict MANAGER to their organizational downline hierarchy', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'mgr-emp-1' });
      prisma.employee.findMany.mockResolvedValue([]);

      await service.exportReportCsv(mockManagerUser, { reportKey: 'REP-WF-01' });

      expect(hierarchyService.getTeamMemberIds).toHaveBeenCalledWith('mgr-emp-1', 'org-1');
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['emp-subordinate-1', 'emp-subordinate-2'] },
          }),
        }),
      );
    });
  });

  describe('3. Validation Rules (Date Bounds and Row Counts)', () => {
    it('should reject date ranges where startDate is after endDate', async () => {
      await expect(
        service.exportReportCsv(mockAdminUser, {
          reportKey: 'REP-ATT-01',
          startDate: '2026-05-10',
          endDate: '2026-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject date ranges spanning more than 366 days', async () => {
      await expect(
        service.exportReportCsv(mockAdminUser, {
          reportKey: 'REP-ATT-01',
          startDate: '2024-01-01',
          endDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cap export limit at 5000 rows maximum', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await service.exportReportCsv(mockAdminUser, {
        reportKey: 'REP-WF-01',
        limit: 10000,
      });

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5000,
        }),
      );
    });

    it('should reject unsupported report catalog keys', async () => {
      await expect(
        service.exportReportCsv(mockAdminUser, { reportKey: 'UNKNOWN-REPORT-KEY' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Column Whitelisting & Nonce Filenames (Prevent Traversal)', () => {
    it('should export REP-WF-01 with authorized columns and safe filename', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          employeeCode: 'EMP-001',
          displayName: '=Injected Formula User',
          status: 'ACTIVE',
          joiningDate: new Date('2025-01-15T00:00:00Z'),
          employment: {
            department: { name: 'Engineering' },
            branch: { name: 'HQ-London' },
            designation: { name: 'Staff Engineer' },
          },
        },
      ]);

      const result = await service.exportReportCsv(mockAdminUser, { reportKey: 'REP-WF-01' });

      expect(result.rowCount).toBe(1);
      expect(result.filename).toMatch(/^hrms-export-REP-WF-01-[\w-]+\.csv$/);
      expect(result.filename).not.toContain('..');
      expect(result.filename).not.toContain('/');
      expect(result.filename).not.toContain('\\');

      // Verify formula injection sanitized in output
      expect(result.csv).toContain(`"EMP-001"`);
      expect(result.csv).toContain(`"'=Injected Formula User"`);
      expect(result.csv).toContain(`"Engineering"`);
      expect(result.csv).toContain(`"HQ-London"`);
    });

    it('should export REP-ATT-01 with whitelisted daily summary fields', async () => {
      prisma.attendanceDailySummary.findMany.mockResolvedValue([
        {
          date: new Date('2026-04-10T00:00:00Z'),
          status: 'PRESENT',
          firstCheckIn: new Date('2026-04-10T09:05:00Z'),
          lastCheckOut: new Date('2026-04-10T17:30:00Z'),
          totalWorkMinutes: 505,
          lateMinutes: 5,
          employee: {
            employeeCode: 'EMP-002',
            displayName: 'Alice Smith',
            employment: { department: { name: 'Product' } },
          },
        },
      ]);

      const result = await service.exportReportCsv(mockAdminUser, { reportKey: 'REP-ATT-01' });

      expect(result.rowCount).toBe(1);
      expect(result.csv).toContain('Total Work Minutes');
      expect(result.csv).toContain('"505"');
      expect(result.csv).toContain('"5"');
    });

    it('should export REP-PM-01 without exposing private peer reviews or confidential text comments', async () => {
      prisma.reviewCycleParticipant.findMany.mockResolvedValue([
        {
          status: 'MANAGER_REVIEW_SUBMITTED',
          enrolledAt: new Date(),
          cycle: { name: 'Q1 2026 Cycle' },
          employee: {
            employeeCode: 'EMP-003',
            displayName: 'Bob Johnson',
            employment: {
              department: { name: 'Operations' },
              branch: { name: 'Singapore' },
            },
          },
          reviews: [
            {
              status: 'COMPLETED',
              overallScore: 4.25,
              selfSubmittedAt: new Date('2026-03-25T10:00:00Z'),
              managerSubmittedAt: new Date('2026-03-28T14:30:00Z'),
              finalizedAt: new Date('2026-03-29T09:00:00Z'),
            },
          ],
        },
      ]);

      const result = await service.exportReportCsv(mockAdminUser, { reportKey: 'REP-PM-01' });

      expect(result.rowCount).toBe(1);
      expect(result.csv).toContain('Review Cycle');
      expect(result.csv).toContain('"4.25"');
      // Must not leak private internal notes or unapproved fields
      expect(result.csv).not.toContain('confidentialFeedback');
      expect(result.csv).not.toContain('privateNotes');
    });
  });

  describe('5. Audit Logging', () => {
    it('should log REPORT_EXPORTED action with entity REPORT and metadata in AuditLog', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      await service.exportReportCsv(mockAdminUser, {
        reportKey: 'REP-WF-01',
        departmentId: 'dept-eng',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-admin-1',
            action: 'REPORT_EXPORTED',
            entity: 'REPORT',
            entityId: 'REP-WF-01',
            newValues: expect.objectContaining({
              reportKey: 'REP-WF-01',
              rowCount: 0,
            }),
          }),
        }),
      );
    });
  });
});
