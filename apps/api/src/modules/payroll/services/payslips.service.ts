import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PayslipPdfService } from './payslip-pdf.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { PayslipListItemDto, PayslipDetailDto, PayslipCorrectionVersionDto } from '@hrms/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pdfService: PayslipPdfService,
  ) {}

  /**
   * Resolve an authenticated user to their internal employee record
   */
  private async resolveEmployee(
    user: AuthenticatedUser,
  ): Promise<{ id: string; employeeCode: string } | null> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, { employeeCode: user.employeeCode }],
      },
      select: { id: true, employeeCode: true },
    });
    return employee;
  }

  /**
   * ESS: List all published payslips available to the authenticated employee
   */
  async getMyPayslips(
    user: AuthenticatedUser,
    query: { year?: number; month?: number; page?: number; limit?: number } = {},
  ): Promise<{
    items: PayslipListItemDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const employee = await this.resolveEmployee(user);
    if (!employee) {
      return {
        items: [],
        meta: { page: 1, limit: query.limit || 20, total: 0, totalPages: 0 },
      };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeePayrollSnapshotWhereInput = {
      organizationId: user.organizationId,
      employeeId: employee.id,
      payslipStatus: 'PUBLISHED', // Strictly PUBLISHED only. Draft or withheld are hidden from ESS.
    };

    if (query.year || query.month) {
      where.payrollRun = {
        period: {
          ...(query.year ? { year: Number(query.year) } : {}),
          ...(query.month ? { month: Number(query.month) } : {}),
        },
      };
    }

    const [total, snapshots] = await Promise.all([
      this.prisma.employeePayrollSnapshot.count({ where }),
      this.prisma.employeePayrollSnapshot.findMany({
        where,
        include: {
          payrollRun: {
            include: { period: true },
          },
        },
        orderBy: [
          { payrollRun: { period: { startDate: 'desc' } } },
          { payrollRun: { runNumber: 'desc' } },
        ],
        skip,
        take: limit,
      }),
    ]);

    const items: PayslipListItemDto[] = snapshots.map((s: any) => ({
      id: s.id,
      payslipNumber: s.payslipNumber,
      payrollRunId: s.payrollRunId,
      runTitle: s.payrollRun.title,
      runNumber: s.payrollRun.runNumber,
      periodId: s.payrollRun.periodId,
      periodYear: s.payrollRun.period.year,
      periodMonth: s.payrollRun.period.month,
      periodStartDate: s.payrollRun.period.startDate.toISOString(),
      periodEndDate: s.payrollRun.period.endDate.toISOString(),
      payoutDate: s.payrollRun.period.payoutDate
        ? s.payrollRun.period.payoutDate.toISOString()
        : null,
      grossPay: Number(s.earnedGross),
      totalDeductions: Number(s.totalDeductions),
      netPay: Number(s.netSalary),
      currency: s.currency,
      paidDays: Number(s.paidDays),
      workingDays: Number(s.workingDays),
      payslipStatus: s.payslipStatus,
      paymentStatus: s.paymentStatus,
      publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
      isCorrection: Boolean(s.payrollRun.parentRunId || s.payrollRun.correctionReason),
      correctionReason: s.payrollRun.correctionReason || null,
      version: s.payrollRun.calculationVersion,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve itemized payslip details with authorization check, masking, and correction history
   */
  async getPayslipDetail(id: string, user: AuthenticatedUser): Promise<PayslipDetailDto> {
    const snapshot = await this.prisma.employeePayrollSnapshot.findFirst({
      where: { id, organizationId: user.organizationId },
      include: {
        payrollRun: {
          include: {
            period: true,
            parentRun: true,
          },
        },
        items: {
          include: { component: true },
          orderBy: { displayOrder: 'asc' },
        },
        employee: {
          include: {
            employment: {
              include: {
                department: true,
                designation: true,
                branch: true,
              },
            },
          },
        },
      },
    });

    if (!snapshot) {
      throw new NotFoundException(`Payslip with ID '${id}' was not found.`);
    }

    // Authorization & Ownership Verification (Strict Anti-IDOR boundary)
    const currentEmp = await this.resolveEmployee(user);
    const isOwner = Boolean(currentEmp && currentEmp.id === snapshot.employeeId);
    const hasAdminAccess =
      user.roles.includes('ADMIN') ||
      user.roles.includes('HR') ||
      user.permissions.includes('PAYROLL_VIEW') ||
      user.permissions.includes('PAYROLL_MANAGE') ||
      user.permissions.includes('payroll:view_all') ||
      user.permissions.includes('payroll:manage') ||
      user.permissions.includes('payroll:reports_view');

    if (!isOwner && !hasAdminAccess) {
      throw new ForbiddenException('Access denied: You are not authorized to view this payslip.');
    }

    // Self-Service Rule: Regular employees can only access PUBLISHED payslips
    if (isOwner && !hasAdminAccess && snapshot.payslipStatus !== 'PUBLISHED') {
      throw new ForbiddenException(
        'Access denied: This payslip has not yet been published by HR/Finance.',
      );
    }

    // Audit Logging
    if (!isOwner && hasAdminAccess) {
      await this.auditService.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PAYSLIP_ADMIN_VIEWED',
        entity: 'EmployeePayrollSnapshot',
        entityId: snapshot.id,
        metadata: {
          targetEmployeeId: snapshot.employeeId,
          targetEmployeeCode: snapshot.employeeCode,
          payslipNumber: snapshot.payslipNumber,
          periodId: snapshot.payrollRun.periodId,
        },
      });
    } else if (isOwner) {
      await this.auditService.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PAYSLIP_VIEWED',
        entity: 'EmployeePayrollSnapshot',
        entityId: snapshot.id,
        metadata: {
          payslipNumber: snapshot.payslipNumber,
          periodId: snapshot.payrollRun.periodId,
        },
      });
    }

    // Versioning & Correction Lineage: Find all snapshots for this employee in the same period
    const siblingSnapshots = await this.prisma.employeePayrollSnapshot.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: snapshot.employeeId,
        payrollRun: {
          periodId: snapshot.payrollRun.periodId,
        },
        ...(hasAdminAccess ? {} : { payslipStatus: 'PUBLISHED' }),
      },
      include: {
        payrollRun: true,
      },
      orderBy: {
        payrollRun: { runNumber: 'asc' },
      },
    });

    const versions: PayslipCorrectionVersionDto[] = siblingSnapshots.map((sib: any) => ({
      snapshotId: sib.id,
      payslipNumber: sib.payslipNumber,
      runNumber: sib.payrollRun.runNumber,
      runTitle: sib.payrollRun.title,
      version: sib.payrollRun.calculationVersion,
      isCurrent: sib.id === snapshot.id,
      publishedAt: sib.publishedAt ? sib.publishedAt.toISOString() : null,
      correctionReason: sib.payrollRun.correctionReason || null,
      netSalary: Number(sib.netSalary),
      earnedGross: Number(sib.earnedGross),
      totalDeductions: Number(sib.totalDeductions),
    }));

    // Partition Line Items
    const earnings = snapshot.items
      .filter((it: any) => it.type === 'EARNING')
      .map((it: any) => ({
        componentCode: it.componentCode,
        componentName: it.componentName,
        standardAmount: Number(it.standardAmount),
        earnedAmount: Number(it.earnedAmount),
      }));

    const deductions = snapshot.items
      .filter((it: any) => it.type === 'DEDUCTION')
      .map((it: any) => ({
        componentCode: it.componentCode,
        componentName: it.componentName,
        standardAmount: Number(it.standardAmount),
        earnedAmount: Number(it.earnedAmount),
      }));

    // Employer Contributions summary from calculation snapshot
    const calcSnapshot = (snapshot.calculationInputSnapshot as Record<string, any>) || {};
    const totalEmployerContributions = Number(calcSnapshot.totalEmployerContributions || 0);

    const employerContributions: Array<{
      componentCode: string;
      componentName: string;
      amount: number;
    }> = [];
    if (totalEmployerContributions > 0) {
      if (Array.isArray(calcSnapshot.employerContributionItems)) {
        for (const item of calcSnapshot.employerContributionItems) {
          employerContributions.push({
            componentCode: item.componentCode || 'EMP_CONTRIB',
            componentName: item.componentName || 'Employer Contribution',
            amount: Number(item.amount || 0),
          });
        }
      } else {
        employerContributions.push({
          componentCode: 'EMP_STATUTORY',
          componentName: 'Employer Statutory Contribution (PF/ESI/Gratuity)',
          amount: totalEmployerContributions,
        });
      }
    }

    // Also extract EMPLOYER_CONTRIBUTION items from snapshot.items
    const employerContribFromItems = (snapshot.items || [])
      .filter(
        (it: any) =>
          it.type === 'EMPLOYER_CONTRIBUTION' ||
          (it.componentCode && it.componentCode.startsWith('EMPLOYER_')),
      )
      .map((it: any) => ({
        componentCode: it.componentCode,
        componentName: it.componentName,
        amount: Number(it.earnedAmount || it.standardAmount || 0),
      }));

    if (employerContributions.length === 0 && employerContribFromItems.length > 0) {
      employerContributions.push(...employerContribFromItems);
    }

    const effectiveEmployerContrib =
      totalEmployerContributions > 0
        ? totalEmployerContributions
        : employerContributions.reduce((sum, item) => sum + item.amount, 0);

    const totalCtc = Number(snapshot.earnedGross) + effectiveEmployerContrib;

    return {
      snapshot: {
        id: snapshot.id,
        organizationId: snapshot.organizationId,
        payrollRunId: snapshot.payrollRunId,
        employeeId: snapshot.employeeId,
        payslipNumber: snapshot.payslipNumber,
        payslipStatus: snapshot.payslipStatus,
        publishedAt: snapshot.publishedAt ? snapshot.publishedAt.toISOString() : null,
        employeeCode: snapshot.employeeCode,
        employeeName: snapshot.employeeName,
        departmentName: snapshot.departmentName,
        designationTitle: snapshot.designationTitle,
        branchName: snapshot.branchName,
        bankName: snapshot.bankName,
        bankAccountMasked: snapshot.bankAccountMasked,
        panMasked: snapshot.panMasked,
        pfUan: snapshot.pfUan,
        calendarDays: Number(snapshot.calendarDays),
        workingDays: Number(snapshot.workingDays),
        paidDays: Number(snapshot.paidDays),
        lopDays: Number(snapshot.lopDays),
        baseMonthlyGross: Number(snapshot.baseMonthlyGross),
        earnedGross: Number(snapshot.earnedGross),
        totalDeductions: Number(snapshot.totalDeductions),
        netSalary: Number(snapshot.netSalary),
        roundingAdjustment: Number(snapshot.roundingAdjustment),
        currency: snapshot.currency,
        paymentStatus: snapshot.paymentStatus,
        paymentMethod: snapshot.paymentMethod,
        paymentReference: snapshot.paymentReference,
        paidAt: snapshot.paidAt ? snapshot.paidAt.toISOString() : null,
        isException: snapshot.isException,
        exceptionReason: snapshot.exceptionReason,
        createdAt: snapshot.createdAt ? snapshot.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: snapshot.updatedAt ? snapshot.updatedAt.toISOString() : new Date().toISOString(),
      },
      period: {
        id: snapshot.payrollRun.period.id,
        year: snapshot.payrollRun.period.year,
        month: snapshot.payrollRun.period.month,
        startDate: snapshot.payrollRun.period.startDate.toISOString(),
        endDate: snapshot.payrollRun.period.endDate.toISOString(),
        cutoffDate: snapshot.payrollRun.period.cutoffDate
          ? snapshot.payrollRun.period.cutoffDate.toISOString()
          : null,
        payoutDate: snapshot.payrollRun.period.payoutDate
          ? snapshot.payrollRun.period.payoutDate.toISOString()
          : null,
      },
      run: {
        id: snapshot.payrollRun.id,
        title: snapshot.payrollRun.title,
        runNumber: snapshot.payrollRun.runNumber,
        calculationVersion: snapshot.payrollRun.calculationVersion,
        status: snapshot.payrollRun.status,
        parentRunId: snapshot.payrollRun.parentRunId,
        correctionReason: snapshot.payrollRun.correctionReason,
      },
      earnings,
      deductions,
      employerContributions,
      totalEmployerContributions: effectiveEmployerContrib,
      totalCtc,
      versions,
      canDownloadPdf: true,
    };
  }

  /**
   * Generate and authorize PDF download for a specific payslip
   */
  async getPayslipPdfBuffer(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string; snapshot: any }> {
    const detail = await this.getPayslipDetail(id, user);

    // Retrieve Organization Details for Header Branding
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, city: true, state: true, country: true },
    });

    const currentEmp = await this.resolveEmployee(user);
    const isOwner = Boolean(currentEmp && currentEmp.id === detail.snapshot.employeeId);
    const hasAdminAccess =
      user.roles.includes('ADMIN') ||
      user.roles.includes('HR') ||
      user.permissions.includes('PAYROLL_VIEW') ||
      user.permissions.includes('PAYROLL_MANAGE') ||
      user.permissions.includes('payroll:view_all') ||
      user.permissions.includes('payroll:manage') ||
      user.permissions.includes('payroll:reports_view');

    // Audit Logging for Download Action
    if (!isOwner && hasAdminAccess) {
      await this.auditService.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PAYSLIP_ADMIN_DOWNLOADED',
        entity: 'EmployeePayrollSnapshot',
        entityId: detail.snapshot.id,
        metadata: {
          targetEmployeeId: detail.snapshot.employeeId,
          targetEmployeeCode: detail.snapshot.employeeCode,
          payslipNumber: detail.snapshot.payslipNumber,
          periodId: detail.period.id,
        },
      });
    } else {
      await this.auditService.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PAYSLIP_DOWNLOADED',
        entity: 'EmployeePayrollSnapshot',
        entityId: detail.snapshot.id,
        metadata: {
          payslipNumber: detail.snapshot.payslipNumber,
          periodId: detail.period.id,
        },
      });
    }

    const pdfBuffer = await this.pdfService.generatePayslipPdf({
      snapshot: {
        ...detail.snapshot,
        publishedAt: detail.snapshot.publishedAt,
      },
      period: {
        year: detail.period.year,
        month: detail.period.month,
        startDate: detail.period.startDate,
        endDate: detail.period.endDate,
        payoutDate: detail.period.payoutDate,
      },
      run: {
        title: detail.run.title,
        runNumber: detail.run.runNumber,
        calculationVersion: detail.run.calculationVersion,
        parentRunId: detail.run.parentRunId,
        correctionReason: detail.run.correctionReason,
      },
      organization: {
        name: organization?.name || 'Enterprise Corporation',
        city: organization?.city,
        state: organization?.state,
        country: organization?.country,
      },
      earnings: detail.earnings,
      deductions: detail.deductions,
      employerContributions: detail.employerContributions,
      totalEmployerContributions: detail.totalEmployerContributions,
      totalCtc: detail.totalCtc,
    });

    const monthStr = String(detail.period.month).padStart(2, '0');
    const filename = `Payslip_${detail.snapshot.employeeCode}_${detail.period.year}_${monthStr}.pdf`;

    return {
      buffer: pdfBuffer,
      filename,
      snapshot: detail.snapshot,
    };
  }
}
