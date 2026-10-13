import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayslipsService } from '../services/payslips.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

describe('Phase 11.9: Payslip Generation and Employee Self-Service Integration Tests', () => {
  let payslipsService: PayslipsService;
  let pdfService: PayslipPdfService;
  let mockPrisma: any;
  let mockAudit: any;

  const orgId = 'org-test-1';

  // Synthetic Users
  const employeeUser: AuthenticatedUser = {
    id: 'user-emp-1',
    organizationId: orgId,
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Sharma',
    roles: ['EMPLOYEE'] as any,
    employeeCode: 'EMP001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
    permissions: [],
  };

  const otherEmployeeUser: AuthenticatedUser = {
    id: 'user-emp-2',
    organizationId: orgId,
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Verma',
    roles: ['EMPLOYEE'] as any,
    employeeCode: 'EMP002',
    status: 'ACTIVE' as any,
    sessionId: 'sess-2',
    permissions: [],
  };

  const hrAdminUser: AuthenticatedUser = {
    id: 'user-hr-admin',
    organizationId: orgId,
    email: 'carol.hr@example.com',
    firstName: 'Carol',
    lastName: 'Admin',
    roles: ['HR'],
    employeeCode: 'EMP-HR01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-3',
    permissions: ['payroll:view_all', 'payroll:manage'],
  };

  const financeManagerUser: AuthenticatedUser = {
    id: 'user-finance',
    organizationId: orgId,
    email: 'david.finance@example.com',
    firstName: 'David',
    lastName: 'Finance',
    roles: ['MANAGER'],
    employeeCode: 'EMP-FIN01',
    status: 'ACTIVE' as any,
    sessionId: 'sess-4',
    permissions: ['payroll:reports_view'],
  };

  // Synthetic DB Records
  const mockEmployeeAlice = {
    id: 'emp-uuid-1',
    organizationId: orgId,
    userId: 'user-emp-1',
    employeeCode: 'EMP001',
    firstName: 'Alice',
    lastName: 'Sharma',
  };

  const mockEmployeeBob = {
    id: 'emp-uuid-2',
    organizationId: orgId,
    userId: 'user-emp-2',
    employeeCode: 'EMP002',
    firstName: 'Bob',
    lastName: 'Verma',
  };

  const mockPeriod = {
    id: 'period-2026-10',
    organizationId: orgId,
    year: 2026,
    month: 10,
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-31'),
    cutoffDate: new Date('2026-10-25'),
    payoutDate: new Date('2026-10-31'),
  };

  const mockRunPublished = {
    id: 'run-pub-1',
    organizationId: orgId,
    periodId: mockPeriod.id,
    period: mockPeriod,
    title: 'October 2026 Regular Payroll',
    runNumber: 1,
    calculationVersion: 1,
    status: 'PUBLISHED',
    parentRunId: null,
    correctionReason: null,
  };

  const mockRunDraft = {
    id: 'run-draft-1',
    organizationId: orgId,
    periodId: mockPeriod.id,
    period: mockPeriod,
    title: 'October 2026 Draft Run',
    runNumber: 1,
    calculationVersion: 1,
    status: 'DRAFT',
    parentRunId: null,
    correctionReason: null,
  };

  const mockRunCorrection = {
    id: 'run-corr-2',
    organizationId: orgId,
    periodId: mockPeriod.id,
    period: mockPeriod,
    title: 'October 2026 Retro Adjustment Run',
    runNumber: 2,
    calculationVersion: 2,
    status: 'PUBLISHED',
    parentRunId: 'run-pub-1',
    correctionReason: 'Approved overtime retro payout and LOP correction',
  };

  const mockSnapshotAlicePublished = {
    id: 'snap-alice-pub-1',
    organizationId: orgId,
    payrollRunId: mockRunPublished.id,
    payrollRun: mockRunPublished,
    employeeId: mockEmployeeAlice.id,
    employee: mockEmployeeAlice,
    payslipNumber: 'PS-202610-001',
    payslipStatus: 'PUBLISHED',
    publishedAt: new Date('2026-10-31T10:00:00Z'),
    employeeCode: 'EMP001',
    employeeName: 'Alice Sharma',
    departmentName: 'Engineering',
    designationTitle: 'Lead Software Architect',
    branchName: 'Bengaluru Innovation Center',
    bankName: 'HDFC Bank',
    bankAccountMasked: '••••••••4812',
    panMasked: '•••••9018A',
    pfUan: '100987654321',
    calendarDays: 31,
    workingDays: 22,
    paidDays: 22,
    lopDays: 0,
    baseMonthlyGross: 150000,
    earnedGross: 150000,
    totalDeductions: 18500,
    netSalary: 131500,
    roundingAdjustment: 0,
    currency: 'INR',
    paymentStatus: 'PAID',
    paymentMethod: 'Direct Bank Transfer',
    paymentReference: 'CMS-20261031-99881',
    paidAt: new Date('2026-10-31T12:00:00Z'),
    createdAt: new Date('2026-10-31T10:00:00Z'),
    updatedAt: new Date('2026-10-31T10:00:00Z'),
    isException: false,
    exceptionReason: null,
    items: [
      {
        id: 'item-1',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'BASIC',
        componentName: 'Basic Salary',
        type: 'EARNING',
        standardAmount: 75000,
        earnedAmount: 75000,
        displayOrder: 1,
      },
      {
        id: 'item-2',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'HRA',
        componentName: 'House Rent Allowance',
        type: 'EARNING',
        standardAmount: 37500,
        earnedAmount: 37500,
        displayOrder: 2,
      },
      {
        id: 'item-3',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'SPECIAL_ALLOWANCE',
        componentName: 'Special Allowance',
        type: 'EARNING',
        standardAmount: 37500,
        earnedAmount: 37500,
        displayOrder: 3,
      },
      {
        id: 'item-4',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'EMPLOYEE_PF',
        componentName: 'Provident Fund (Employee)',
        type: 'DEDUCTION',
        standardAmount: 1800,
        earnedAmount: 1800,
        displayOrder: 4,
      },
      {
        id: 'item-5',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'PROFESSIONAL_TAX',
        componentName: 'Professional Tax',
        type: 'DEDUCTION',
        standardAmount: 200,
        earnedAmount: 200,
        displayOrder: 5,
      },
      {
        id: 'item-6',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'TDS',
        componentName: 'Income Tax (TDS)',
        type: 'DEDUCTION',
        standardAmount: 16500,
        earnedAmount: 16500,
        displayOrder: 6,
      },
      {
        id: 'item-7',
        snapshotId: 'snap-alice-pub-1',
        componentCode: 'EMPLOYER_PF',
        componentName: 'Provident Fund (Employer)',
        type: 'EMPLOYER_CONTRIBUTION',
        standardAmount: 1800,
        earnedAmount: 1800,
        displayOrder: 7,
      },
    ],
  };

  const mockSnapshotAliceDraft = {
    ...mockSnapshotAlicePublished,
    id: 'snap-alice-draft-1',
    payrollRunId: mockRunDraft.id,
    payrollRun: mockRunDraft,
    payslipStatus: 'DRAFT',
    publishedAt: null,
  };

  const mockSnapshotAliceCorrected = {
    ...mockSnapshotAlicePublished,
    id: 'snap-alice-corr-2',
    payrollRunId: mockRunCorrection.id,
    payrollRun: mockRunCorrection,
    payslipNumber: 'PS-202610-001-v2',
    earnedGross: 155000,
    netSalary: 136500,
  };

  beforeEach(() => {
    mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Acme Enterprise HR',
          city: 'Bengaluru',
          state: 'Karnataka',
          country: 'India',
        }),
      },
      employee: {
        findFirst: jest.fn().mockImplementation((args: any) => {
          const where = args?.where;
          const orList = where?.OR || [];
          const matchesAlice =
            where?.userId === employeeUser.id ||
            where?.employeeCode === employeeUser.employeeCode ||
            orList.some(
              (cond: any) =>
                cond.userId === employeeUser.id || cond.employeeCode === employeeUser.employeeCode,
            );
          if (matchesAlice) return Promise.resolve(mockEmployeeAlice);

          const matchesBob =
            where?.userId === otherEmployeeUser.id ||
            where?.employeeCode === otherEmployeeUser.employeeCode ||
            orList.some(
              (cond: any) =>
                cond.userId === otherEmployeeUser.id ||
                cond.employeeCode === otherEmployeeUser.employeeCode,
            );
          if (matchesBob) return Promise.resolve(mockEmployeeBob);

          return Promise.resolve(null);
        }),
      },
      employeePayrollSnapshot: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.employeeId === mockEmployeeAlice.id) {
            if (args?.where?.payslipStatus === 'PUBLISHED' && args?.where?.payrollRun?.period) {
              return Promise.resolve([mockSnapshotAlicePublished]);
            }
            return Promise.resolve([mockSnapshotAlicePublished, mockSnapshotAliceCorrected]);
          }
          return Promise.resolve([]);
        }),
        findFirst: jest.fn().mockImplementation((args: any) => {
          const id = args?.where?.id;
          if (id === mockSnapshotAlicePublished.id)
            return Promise.resolve(mockSnapshotAlicePublished);
          if (id === mockSnapshotAliceDraft.id) return Promise.resolve(mockSnapshotAliceDraft);
          if (id === mockSnapshotAliceCorrected.id)
            return Promise.resolve(mockSnapshotAliceCorrected);
          return Promise.resolve(null);
        }),
        findUnique: jest.fn().mockImplementation((args: any) => {
          const id = args?.where?.id;
          if (id === mockSnapshotAlicePublished.id)
            return Promise.resolve(mockSnapshotAlicePublished);
          if (id === mockSnapshotAliceDraft.id) return Promise.resolve(mockSnapshotAliceDraft);
          if (id === mockSnapshotAliceCorrected.id)
            return Promise.resolve(mockSnapshotAliceCorrected);
          return Promise.resolve(null);
        }),
      },
    };

    pdfService = new PayslipPdfService();
    payslipsService = new PayslipsService(mockPrisma, mockAudit, pdfService);
  });

  // ---------------------------------------------------------------------------
  // 1. Employee Own Payslip Access Tests
  // ---------------------------------------------------------------------------
  describe('1. Employee Self-Service Access to Own Payslip', () => {
    it('should allow authenticated employee to view their published payslip detail', async () => {
      const detail = await payslipsService.getPayslipDetail(
        mockSnapshotAlicePublished.id,
        employeeUser,
      );

      expect(detail).toBeDefined();
      expect(detail.snapshot.id).toBe(mockSnapshotAlicePublished.id);
      expect(detail.snapshot.employeeCode).toBe('EMP001');
      expect(detail.snapshot.netSalary).toBe(131500);
      expect(detail.earnings).toHaveLength(3);
      expect(detail.deductions).toHaveLength(3);
      expect(detail.employerContributions).toHaveLength(1);
      expect(detail.totalEmployerContributions).toBe(1800);
      expect(detail.totalCtc).toBe(151800);
      expect(detail.canDownloadPdf).toBe(true);

      // Verify no admin view audit log for own access
      expect(mockAudit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_ADMIN_VIEWED' }),
      );
    });

    it('should query and return only published periods for the authenticated employee in getMyPayslips', async () => {
      mockPrisma.employeePayrollSnapshot.findMany.mockResolvedValue([mockSnapshotAlicePublished]);

      const result = await payslipsService.getMyPayslips(employeeUser, {
        year: 2026,
        month: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].payslipNumber).toBe('PS-202610-001');
      expect(result.items[0].netPay).toBe(131500);
      expect(result.items[0].grossPay).toBe(150000);
      expect(result.items[0].payslipStatus).toBe('PUBLISHED');

      // Verify Prisma query strictly isolated employeeId and PUBLISHED status
      expect(mockPrisma.employeePayrollSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            employeeId: mockEmployeeAlice.id,
            payslipStatus: 'PUBLISHED',
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Anti-IDOR & Access Violation Security Tests
  // ---------------------------------------------------------------------------
  describe('2. Anti-IDOR and Unauthorized Access Restrictions', () => {
    it('should prevent Employee Bob from accessing Employee Alice payslip (IDOR check -> 403 Forbidden)', async () => {
      await expect(
        payslipsService.getPayslipDetail(mockSnapshotAlicePublished.id, otherEmployeeUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        payslipsService.getPayslipDetail(mockSnapshotAlicePublished.id, otherEmployeeUser),
      ).rejects.toThrow('Access denied: You are not authorized to view this payslip.');
    });

    it('should prevent caller without employee profile and without payroll permissions from accessing payslips', async () => {
      const nonEmpUser: AuthenticatedUser = {
        id: 'user-external-guest',
        organizationId: orgId,
        email: 'guest@example.com',
        firstName: 'Guest',
        lastName: 'User',
        roles: ['EMPLOYEE'],
        employeeCode: 'GUEST',
        status: 'ACTIVE' as any,
        sessionId: 'sess-guest',
        permissions: [],
      };

      await expect(
        payslipsService.getPayslipDetail(mockSnapshotAlicePublished.id, nonEmpUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject employee access to an unapproved / draft payslip with 403 Forbidden', async () => {
      // Alice tries to access her own payslip while it is still in DRAFT
      await expect(
        payslipsService.getPayslipDetail(mockSnapshotAliceDraft.id, employeeUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        payslipsService.getPayslipDetail(mockSnapshotAliceDraft.id, employeeUser),
      ).rejects.toThrow('Access denied: This payslip has not yet been published by HR/Finance.');
    });

    it('should throw NotFoundException if payslip snapshot does not exist', async () => {
      await expect(
        payslipsService.getPayslipDetail('non-existent-id', employeeUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Restricted HR / Finance Admin Access & Audit Events
  // ---------------------------------------------------------------------------
  describe('3. Privileged HR / Finance Admin Access and Mandatory Auditing', () => {
    it('should allow HR Admin with payroll permission to view employee payslip and log PAYSLIP_ADMIN_VIEWED audit event', async () => {
      const detail = await payslipsService.getPayslipDetail(
        mockSnapshotAlicePublished.id,
        hrAdminUser,
      );

      expect(detail).toBeDefined();
      expect(detail.snapshot.employeeCode).toBe('EMP001');

      // Mandatory audit event check
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          userId: hrAdminUser.id,
          action: 'PAYSLIP_ADMIN_VIEWED',
          entity: 'EmployeePayrollSnapshot',
          entityId: mockSnapshotAlicePublished.id,
          metadata: expect.objectContaining({
            targetEmployeeId: mockEmployeeAlice.id,
            targetEmployeeCode: 'EMP001',
            payslipNumber: 'PS-202610-001',
          }),
        }),
      );
    });

    it('should allow Finance Manager with payroll permissions to view employee payslip and log PAYSLIP_ADMIN_VIEWED', async () => {
      const detail = await payslipsService.getPayslipDetail(
        mockSnapshotAlicePublished.id,
        financeManagerUser,
      );

      expect(detail).toBeDefined();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          userId: financeManagerUser.id,
          action: 'PAYSLIP_ADMIN_VIEWED',
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Secure PDF Generation and Download Authorization Tests
  // ---------------------------------------------------------------------------
  describe('4. Secure In-Memory PDF Generation and Download Authorization', () => {
    it('should allow authenticated employee to download their own published PDF with valid PDF buffer and audit log', async () => {
      const pdfResult = await payslipsService.getPayslipPdfBuffer(
        mockSnapshotAlicePublished.id,
        employeeUser,
      );

      expect(pdfResult).toBeDefined();
      expect(pdfResult.filename).toContain('EMP001');
      expect(Buffer.isBuffer(pdfResult.buffer)).toBe(true);
      expect(pdfResult.buffer.length).toBeGreaterThan(500);

      // Verify PDF header magic bytes "%PDF-"
      const pdfHeader = pdfResult.buffer.subarray(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');

      // Verify employee self-download audit event
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          userId: employeeUser.id,
          action: 'PAYSLIP_DOWNLOADED',
          entity: 'EmployeePayrollSnapshot',
          entityId: mockSnapshotAlicePublished.id,
        }),
      );
    });

    it('should reject unauthorized employee Bob attempting to download Alice PDF with 403 Forbidden', async () => {
      await expect(
        payslipsService.getPayslipPdfBuffer(mockSnapshotAlicePublished.id, otherEmployeeUser),
      ).rejects.toThrow(ForbiddenException);

      // Ensure no download audit logged
      expect(mockAudit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYSLIP_DOWNLOADED' }),
      );
    });

    it('should allow HR Admin to download employee PDF and log PAYSLIP_ADMIN_DOWNLOADED audit event', async () => {
      const pdfResult = await payslipsService.getPayslipPdfBuffer(
        mockSnapshotAlicePublished.id,
        hrAdminUser,
      );

      expect(pdfResult).toBeDefined();
      expect(Buffer.isBuffer(pdfResult.buffer)).toBe(true);
      expect(pdfResult.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      // Mandatory administrative audit event
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          userId: hrAdminUser.id,
          action: 'PAYSLIP_ADMIN_DOWNLOADED',
          entity: 'EmployeePayrollSnapshot',
          entityId: mockSnapshotAlicePublished.id,
        }),
      );
    });

    it('should reject downloading a draft or unapproved payslip PDF', async () => {
      await expect(
        payslipsService.getPayslipPdfBuffer(mockSnapshotAliceDraft.id, employeeUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Versioning and Correction History Lineage Tests
  // ---------------------------------------------------------------------------
  describe('5. Versioning and Correction History Lineage', () => {
    it('should compute full version history lineage across original and correction runs', async () => {
      const detail = await payslipsService.getPayslipDetail(
        mockSnapshotAlicePublished.id,
        employeeUser,
      );

      expect(detail.versions).toBeDefined();
      expect(detail.versions).toHaveLength(2);

      // Version 1 (Original Run)
      const v1 = detail.versions.find((v) => v.snapshotId === mockSnapshotAlicePublished.id);
      expect(v1).toBeDefined();
      expect(v1?.isCurrent).toBe(true);
      expect(v1?.runNumber).toBe(1);
      expect(v1?.netSalary).toBe(131500);

      // Version 2 (Correction Run)
      const v2 = detail.versions.find((v) => v.snapshotId === mockSnapshotAliceCorrected.id);
      expect(v2).toBeDefined();
      expect(v2?.isCurrent).toBe(false);
      expect(v2?.runNumber).toBe(2);
      expect(v2?.correctionReason).toBe('Approved overtime retro payout and LOP correction');
      expect(v2?.netSalary).toBe(136500);
    });
  });
});
