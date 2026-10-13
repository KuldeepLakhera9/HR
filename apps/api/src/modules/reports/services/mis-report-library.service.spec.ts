import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { MisReportLibraryService } from './mis-report-library.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('Phase 10 — Step 7: MIS Report Library Specification Tests', () => {
  let service: MisReportLibraryService;
  let mockPrisma: any;
  let mockHierarchy: any;
  let mockWorkforce: any;
  let mockAttendanceAnalytics: any;
  let mockRequestAnalytics: any;
  let mockPerformanceAnalytics: any;

  const adminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@company.com',
    roles: ['ADMIN'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-ADM',
    firstName: 'Admin',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-admin',
  };

  const managerUser: AuthenticatedUser = {
    id: 'user-mgr-1',
    email: 'manager@company.com',
    roles: ['MANAGER'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-MGR',
    firstName: 'Manager',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-mgr',
  };

  const employeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    email: 'emp@company.com',
    roles: ['EMPLOYEE'],
    organizationId: 'org-test-1',
    permissions: ['REPORT_VIEW'],
    employeeCode: 'EMP-001',
    firstName: 'Employee',
    lastName: 'User',
    status: 'ACTIVE' as any,
    sessionId: 'sess-emp',
  };

  beforeEach(() => {
    mockPrisma = {
      savedReportDefinition: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockHierarchy = {
      getTeamMemberIds: jest.fn().mockResolvedValue(['emp-sub-1']),
    };

    mockWorkforce = {
      getHeadcountReport: jest.fn().mockResolvedValue({ totalActiveHeadcount: 42 }),
      getMovementReport: jest.fn().mockResolvedValue({}),
      getTrendsReport: jest.fn().mockResolvedValue({}),
    };

    mockAttendanceAnalytics = {
      getDailyReport: jest.fn().mockResolvedValue({}),
      getWeeklyReport: jest.fn().mockResolvedValue({}),
      getMonthlyReport: jest.fn().mockResolvedValue({}),
      getExceptionsReport: jest.fn().mockResolvedValue({}),
    };

    mockRequestAnalytics = {
      getLeaveUtilizationReport: jest.fn().mockResolvedValue({}),
      getRequestVolumesReport: jest.fn().mockResolvedValue({}),
      getApprovalTurnaroundReport: jest.fn().mockResolvedValue({}),
    };

    mockPerformanceAnalytics = {
      getPerformanceOverviewReport: jest.fn().mockResolvedValue({}),
      getGoalProgressReport: jest.fn().mockResolvedValue({}),
      getDevelopmentPlanReport: jest.fn().mockResolvedValue({}),
    };

    const mockPayrollAnalytics = {
      getPayrollSummaryReport: jest.fn().mockResolvedValue({}),
      getCostCenterReport: jest.fn().mockResolvedValue({}),
      getPayrollRegisterReport: jest.fn().mockResolvedValue({}),
      getEarningsDeductionsReport: jest.fn().mockResolvedValue({}),
      getPayrollExceptionsReport: jest.fn().mockResolvedValue({}),
      getPeriodComparisonReport: jest.fn().mockResolvedValue({}),
      getPayrollAdjustmentsReport: jest.fn().mockResolvedValue({}),
      getApprovalHistoryReport: jest.fn().mockResolvedValue({}),
      getPaymentReconciliationReport: jest.fn().mockResolvedValue({}),
    };

    service = new MisReportLibraryService(
      mockPrisma,
      mockHierarchy,
      mockWorkforce,
      mockAttendanceAnalytics,
      mockRequestAnalytics,
      mockPerformanceAnalytics,
      mockPayrollAnalytics as any,
    );
  });

  describe('1. Report Discovery & Catalog Filtering', () => {
    it('returns the full authorized report catalog for ADMIN and HR', async () => {
      const catalog = await service.getCatalog(adminUser, {});
      expect(catalog.length).toBeGreaterThanOrEqual(13); // At least 13 categorized reports
      expect(catalog.map((c) => c.category)).toContain('WORKFORCE');
      expect(catalog.map((c) => c.category)).toContain('ATTENDANCE');
      expect(catalog.map((c) => c.category)).toContain('LEAVE_REQUESTS');
      expect(catalog.map((c) => c.category)).toContain('PERFORMANCE');
    });

    it('filters catalog items by category and keyword search safely', async () => {
      const filtered = await service.getCatalog(adminUser, {
        category: 'ATTENDANCE',
        search: 'matrix',
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].key).toBe('REP-ATT-02');
      expect(filtered[0].title).toContain('Weekly Attendance Matrix');
    });

    it('rejects regular EMPLOYEE from discovering reporting catalog', async () => {
      await expect(service.getCatalog(employeeUser, {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Saved Report Definitions (Safe Parameterization)', () => {
    it('creates a saved report definition with safe parameterized filterConfig', async () => {
      mockPrisma.savedReportDefinition.create.mockResolvedValue({
        id: 's-1',
        organizationId: 'org-test-1',
        userId: adminUser.id,
        reportKey: 'REP-WF-01',
        name: 'Engineering Headcount As-Of Q4',
        description: 'Tracking Q4 headcount allocation',
        filterConfig: { departmentId: 'dept-eng', asOfDate: '2026-10-12' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createSavedReport(adminUser, {
        reportKey: 'REP-WF-01',
        name: 'Engineering Headcount As-Of Q4',
        description: 'Tracking Q4 headcount allocation',
        filterConfig: { departmentId: 'dept-eng', asOfDate: '2026-10-12' },
      });

      expect(res.id).toBe('s-1');
      expect(res.reportKey).toBe('REP-WF-01');
      expect(res.filterConfig.departmentId).toBe('dept-eng');
      expect(mockPrisma.savedReportDefinition.create).toHaveBeenCalled();
    });

    it('rejects saved reports specifying unsupported filter keys', async () => {
      await expect(
        service.createSavedReport(adminUser, {
          reportKey: 'REP-WF-01',
          name: 'Invalid Report',
          filterConfig: { unsupportedMysteryField: '123' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects saved reports containing SQL injection keywords in filter values', async () => {
      await expect(
        service.createSavedReport(adminUser, {
          reportKey: 'REP-WF-01',
          name: 'Injection Attempt',
          filterConfig: { departmentId: 'dept-eng; DROP TABLE users;--' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Execution & Dynamic Scope Revalidation', () => {
    it('revalidates permissions on every run and executes through authoritative underlying service', async () => {
      mockPrisma.savedReportDefinition.findFirst.mockResolvedValue({
        id: 's-headcount',
        organizationId: 'org-test-1',
        userId: managerUser.id,
        reportKey: 'REP-WF-01',
        name: 'Team Headcount',
        description: null,
        filterConfig: { asOfDate: '2026-10-12' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const outcome = await service.executeSavedReport(managerUser, 's-headcount');

      expect(outcome.catalogItem.key).toBe('REP-WF-01');
      expect(outcome.scopeType).toBe('TEAM');
      expect(outcome.data.totalActiveHeadcount).toBe(42);
      expect(mockWorkforce.getHeadcountReport).toHaveBeenCalledWith(managerUser, {
        asOfDate: '2026-10-12',
      });
    });

    it('throws NotFoundException when saved report does not exist in user organization', async () => {
      mockPrisma.savedReportDefinition.findFirst.mockResolvedValue(null);

      await expect(service.executeSavedReport(managerUser, 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks non-owner from deleting someone elses saved report', async () => {
      mockPrisma.savedReportDefinition.findFirst.mockResolvedValue({
        id: 's-other',
        organizationId: 'org-test-1',
        userId: 'user-another-person',
      });

      await expect(service.deleteSavedReport(managerUser, 's-other')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows ADMIN to delete any saved report in the organization', async () => {
      mockPrisma.savedReportDefinition.findFirst.mockResolvedValue({
        id: 's-other',
        organizationId: 'org-test-1',
        userId: 'user-another-person',
      });
      mockPrisma.savedReportDefinition.delete.mockResolvedValue({});

      const res = await service.deleteSavedReport(adminUser, 's-other');
      expect(res.success).toBe(true);
      expect(mockPrisma.savedReportDefinition.delete).toHaveBeenCalledWith({
        where: { id: 's-other' },
      });
    });
  });
});
