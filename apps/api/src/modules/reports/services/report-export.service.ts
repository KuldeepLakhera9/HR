import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { ExportReportQueryDto } from '../dto/report-export-query.dto';
import { PayrollAnalyticsService } from './payroll-analytics.service';

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly payrollAnalyticsService: PayrollAnalyticsService,
  ) {}

  /**
   * Formula Injection Protection (CWE-1236 / CSV Injection Mitigation):
   * Prefixes cells beginning with =, +, -, @, \t, \r, % with a single quote (')
   * and escapes internal quotation marks so spreadsheet engines do not execute formulas.
   */
  public sanitizeCsvField(val: string | number | boolean | null | undefined): string {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    const escaped = str.replace(/"/g, '""');
    // Prevent formula triggers
    if (/^[=+\-@\t\r%]/.test(escaped)) {
      return `"'${escaped}"`;
    }
    return `"${escaped}"`;
  }

  /**
   * Revalidates caller permissions and resolves organizational scope:
   * - ADMIN / HR: Organization-wide
   * - MANAGER: Scoped to downline hierarchy members
   * - EMPLOYEE: Blocked with ForbiddenException
   */
  async resolveScopedEmployeeIds(
    user: AuthenticatedUser,
  ): Promise<{ scopedEmployeeIds: string[] | null; scopeType: 'ORGANIZATION' | 'TEAM' }> {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have permission to export organizational reports',
      );
    }

    if (isAdminOrHr) {
      return { scopedEmployeeIds: null, scopeType: 'ORGANIZATION' };
    }

    const managerEmp = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!managerEmp) {
      throw new ForbiddenException('Manager employee profile not found');
    }

    const teamIds = await this.hierarchyService.getTeamMemberIds(
      managerEmp.id,
      user.organizationId,
    );
    return {
      scopedEmployeeIds: teamIds.length > 0 ? teamIds : [managerEmp.id],
      scopeType: 'TEAM',
    };
  }

  /**
   * Execute Secure CSV Report Export
   * Revalidates authorization, bounds row counts, restricts sensitive columns,
   * protects against formula injection, prevents path traversal, and logs an audit trail.
   */
  async exportReportCsv(
    user: AuthenticatedUser,
    query: ExportReportQueryDto,
  ): Promise<{ filename: string; csv: string; rowCount: number; contentType: string }> {
    const { scopedEmployeeIds } = await this.resolveScopedEmployeeIds(user);
    const limit = Math.min(query.limit || 5000, 5000); // Bounded memory limit

    // Dedicated permission gate for payroll reports
    if (query.reportKey && query.reportKey.startsWith('REP-PAY-')) {
      const isEmployeeLevel = query.reportKey === 'REP-PAY-03';
      this.payrollAnalyticsService.checkPayrollReportAccess(user, isEmployeeLevel);
    }

    // Validate date boundary if both provided
    if (query.startDate && query.endDate) {
      const s = new Date(query.startDate).getTime();
      const e = new Date(query.endDate).getTime();
      if (s > e) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
      const daysDiff = (e - s) / (1000 * 60 * 60 * 24);
      if (daysDiff > 366) {
        throw new BadRequestException('Export date range cannot exceed 366 days');
      }
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    switch (query.reportKey) {
      // 1. Workforce Headcount Snapshot Roster
      case 'REP-WF-01': {
        headers = [
          'Employee Code',
          'Display Name',
          'Department',
          'Branch',
          'Designation',
          'Status',
          'Joining Date',
        ];
        const asOf = query.asOfDate ? new Date(query.asOfDate) : new Date();

        const employees = await this.prisma.employee.findMany({
          where: {
            organizationId: user.organizationId,
            deletedAt: null,
            joiningDate: { lte: asOf },
            OR: [{ exitDate: null }, { exitDate: { gt: asOf } }],
            ...(scopedEmployeeIds ? { id: { in: scopedEmployeeIds } } : {}),
            ...(query.departmentId && query.departmentId !== 'ALL'
              ? { employment: { departmentId: query.departmentId } }
              : {}),
            ...(query.branchId && query.branchId !== 'ALL'
              ? { employment: { branchId: query.branchId } }
              : {}),
          },
          include: {
            employment: {
              include: {
                department: { select: { name: true } },
                branch: { select: { name: true } },
                designation: { select: { name: true } },
              },
            },
          },
          orderBy: { employeeCode: 'asc' },
          take: limit,
        });

        rows = employees.map((e) => [
          e.employeeCode,
          e.displayName,
          e.employment?.department?.name || 'N/A',
          e.employment?.branch?.name || 'N/A',
          e.employment?.designation?.name || 'N/A',
          e.status,
          e.joiningDate.toISOString().split('T')[0],
        ]);
        break;
      }

      // 2. Workforce Movement Flow (Joiners & Exits)
      case 'REP-WF-02': {
        headers = [
          'Employee Code',
          'Display Name',
          'Department',
          'Branch',
          'Movement Event',
          'Effective Date',
        ];
        const start = query.startDate
          ? new Date(query.startDate)
          : new Date(Date.now() - 30 * 86400000);
        const end = query.endDate ? new Date(query.endDate) : new Date();

        const [joiners, exits] = await Promise.all([
          this.prisma.employee.findMany({
            where: {
              organizationId: user.organizationId,
              deletedAt: null,
              joiningDate: { gte: start, lte: end },
              ...(scopedEmployeeIds ? { id: { in: scopedEmployeeIds } } : {}),
              ...(query.departmentId && query.departmentId !== 'ALL'
                ? { employment: { departmentId: query.departmentId } }
                : {}),
              ...(query.branchId && query.branchId !== 'ALL'
                ? { employment: { branchId: query.branchId } }
                : {}),
            },
            include: {
              employment: {
                include: {
                  department: { select: { name: true } },
                  branch: { select: { name: true } },
                },
              },
            },
            take: Math.floor(limit / 2),
          }),
          this.prisma.employee.findMany({
            where: {
              organizationId: user.organizationId,
              deletedAt: null,
              exitDate: { gte: start, lte: end },
              ...(scopedEmployeeIds ? { id: { in: scopedEmployeeIds } } : {}),
              ...(query.departmentId && query.departmentId !== 'ALL'
                ? { employment: { departmentId: query.departmentId } }
                : {}),
              ...(query.branchId && query.branchId !== 'ALL'
                ? { employment: { branchId: query.branchId } }
                : {}),
            },
            include: {
              employment: {
                include: {
                  department: { select: { name: true } },
                  branch: { select: { name: true } },
                },
              },
            },
            take: Math.floor(limit / 2),
          }),
        ]);

        const joinerRows = joiners.map((e) => [
          e.employeeCode,
          e.displayName,
          e.employment?.department?.name || 'N/A',
          e.employment?.branch?.name || 'N/A',
          'NEW_HIRE',
          e.joiningDate.toISOString().split('T')[0],
        ]);

        const exitRows = exits.map((e) => [
          e.employeeCode,
          e.displayName,
          e.employment?.department?.name || 'N/A',
          e.employment?.branch?.name || 'N/A',
          'EXIT',
          e.exitDate ? e.exitDate.toISOString().split('T')[0] : 'N/A',
        ]);

        rows = [...joinerRows, ...exitRows];
        break;
      }

      // 3. Daily Attendance Roster
      case 'REP-ATT-01': {
        headers = [
          'Date',
          'Employee Code',
          'Display Name',
          'Department',
          'Status',
          'First Check-In',
          'Last Check-Out',
          'Total Work Minutes',
          'Late Minutes',
        ];
        const start = query.startDate
          ? new Date(query.startDate)
          : new Date(Date.now() - 7 * 86400000);
        const end = query.endDate ? new Date(query.endDate) : new Date();

        const records = await this.prisma.attendanceDailySummary.findMany({
          where: {
            organizationId: user.organizationId,
            date: { gte: start, lte: end },
            ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            ...(query.status && query.status !== 'ALL' ? { status: query.status as any } : {}),
            ...(query.departmentId && query.departmentId !== 'ALL'
              ? { employee: { employment: { departmentId: query.departmentId } } }
              : {}),
            ...(query.branchId && query.branchId !== 'ALL'
              ? { employee: { employment: { branchId: query.branchId } } }
              : {}),
          },
          include: {
            employee: {
              select: {
                employeeCode: true,
                displayName: true,
                employment: {
                  select: { department: { select: { name: true } } },
                },
              },
            },
          },
          orderBy: [{ date: 'desc' }, { employee: { employeeCode: 'asc' } }],
          take: limit,
        });

        rows = records.map((r) => [
          r.date.toISOString().split('T')[0],
          r.employee.employeeCode,
          r.employee.displayName,
          r.employee.employment?.department?.name || 'N/A',
          r.status,
          r.firstCheckIn ? r.firstCheckIn.toISOString().split('T')[1].slice(0, 8) : '',
          r.lastCheckOut ? r.lastCheckOut.toISOString().split('T')[1].slice(0, 8) : '',
          String(r.totalWorkMinutes || 0),
          String(r.lateMinutes || 0),
        ]);
        break;
      }

      // 4. Approved Leave Utilization & Balances
      case 'REP-REQ-01': {
        headers = [
          'Request ID',
          'Employee Code',
          'Display Name',
          'Leave Type',
          'Start Date',
          'End Date',
          'Chargeable Days',
          'Status',
          'Created Date',
        ];

        const requests = await this.prisma.leaveRequest.findMany({
          where: {
            organizationId: user.organizationId,
            ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            ...(query.status && query.status !== 'ALL' ? { status: query.status as any } : {}),
            ...(query.departmentId && query.departmentId !== 'ALL'
              ? { employee: { employment: { departmentId: query.departmentId } } }
              : {}),
            ...(query.branchId && query.branchId !== 'ALL'
              ? { employee: { employment: { branchId: query.branchId } } }
              : {}),
          },
          include: {
            leaveType: { select: { name: true } },
            employee: {
              select: {
                employeeCode: true,
                displayName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        rows = requests.map((r) => [
          r.id,
          r.employee.employeeCode,
          r.employee.displayName,
          r.leaveType.name,
          r.startDate.toISOString().split('T')[0],
          r.endDate.toISOString().split('T')[0],
          String(r.chargeableDays),
          r.status,
          r.createdAt.toISOString().split('T')[0],
        ]);
        break;
      }

      // 5. Unified Request Volumes & Outcomes
      case 'REP-REQ-02': {
        headers = [
          'Request ID',
          'Type',
          'Employee Code',
          'Display Name',
          'Start Date',
          'End Date',
          'Status',
          'Submitted Date',
        ];

        const [leaves, wfhs, visits] = await Promise.all([
          this.prisma.leaveRequest.findMany({
            where: {
              organizationId: user.organizationId,
              ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            },
            include: { employee: { select: { employeeCode: true, displayName: true } } },
            take: Math.floor(limit / 3),
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.wfhRequest.findMany({
            where: {
              organizationId: user.organizationId,
              ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            },
            include: { employee: { select: { employeeCode: true, displayName: true } } },
            take: Math.floor(limit / 3),
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.officialVisit.findMany({
            where: {
              organizationId: user.organizationId,
              ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            },
            include: { employee: { select: { employeeCode: true, displayName: true } } },
            take: Math.floor(limit / 3),
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        const lRows = leaves.map((l) => [
          l.id,
          'LEAVE',
          l.employee.employeeCode,
          l.employee.displayName,
          l.startDate.toISOString().split('T')[0],
          l.endDate.toISOString().split('T')[0],
          l.status,
          l.createdAt.toISOString().split('T')[0],
        ]);

        const wRows = wfhs.map((w) => [
          w.id,
          'WFH',
          w.employee.employeeCode,
          w.employee.displayName,
          w.startDate.toISOString().split('T')[0],
          w.endDate.toISOString().split('T')[0],
          w.status,
          w.createdAt.toISOString().split('T')[0],
        ]);

        const vRows = visits.map((v) => [
          v.id,
          'OFFICIAL_VISIT',
          v.employee.employeeCode,
          v.employee.displayName,
          v.startDate.toISOString().split('T')[0],
          v.endDate.toISOString().split('T')[0],
          v.status,
          v.createdAt.toISOString().split('T')[0],
        ]);

        rows = [...lRows, ...wRows, ...vRows];
        break;
      }

      // 6. Performance Management Reviews MIS
      case 'REP-PM-01': {
        headers = [
          'Employee Code',
          'Display Name',
          'Department',
          'Branch',
          'Review Cycle',
          'Review Status',
          'Self Submitted',
          'Manager Submitted',
          'Overall Score',
          'Finalized Date',
        ];

        const participants = await this.prisma.reviewCycleParticipant.findMany({
          where: {
            cycle: {
              organizationId: user.organizationId,
              ...(query.cycleId ? { id: query.cycleId } : {}),
            },
            ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
            ...(query.departmentId && query.departmentId !== 'ALL'
              ? { departmentId: query.departmentId }
              : {}),
            ...(query.branchId && query.branchId !== 'ALL' ? { branchId: query.branchId } : {}),
          },
          include: {
            cycle: { select: { name: true } },
            employee: {
              select: {
                employeeCode: true,
                displayName: true,
                employment: {
                  select: {
                    department: { select: { name: true } },
                    branch: { select: { name: true } },
                  },
                },
              },
            },
            reviews: {
              select: {
                status: true,
                overallScore: true,
                selfSubmittedAt: true,
                managerSubmittedAt: true,
                finalizedAt: true,
              },
            },
          },
          orderBy: { enrolledAt: 'desc' },
          take: limit,
        });

        rows = participants.map((p) => {
          const rev = p.reviews[0] || null;
          return [
            p.employee.employeeCode,
            p.employee.displayName,
            p.employee.employment?.department?.name || 'N/A',
            p.employee.employment?.branch?.name || 'N/A',
            p.cycle.name,
            rev?.status || p.status,
            rev?.selfSubmittedAt ? rev.selfSubmittedAt.toISOString().split('T')[0] : '',
            rev?.managerSubmittedAt ? rev.managerSubmittedAt.toISOString().split('T')[0] : '',
            rev?.overallScore !== null && rev?.overallScore !== undefined
              ? rev.overallScore.toFixed(2)
              : '',
            rev?.finalizedAt ? rev.finalizedAt.toISOString().split('T')[0] : '',
          ];
        });
        break;
      }

      // 5. Phase 11.10: Enterprise Payroll Management Reports
      case 'REP-PAY-01': {
        headers = [
          'Period Year',
          'Period Month',
          'Run Title',
          'Calculation Version',
          'Run Status',
          'Processed Employees',
          'Base Monthly Gross',
          'Earned Gross',
          'Employee Deductions',
          'Rounding Adjustment',
          'Net Salary Payout',
          'Employer Contributions',
          'Total Cost to Company (CTC)',
          'Gross-Net Reconciled',
        ];
        const rep = await this.payrollAnalyticsService.getPayrollSummaryReport(user, query);
        rows = [
          [
            rep.period.year,
            rep.period.month,
            rep.run.title,
            `v${rep.run.calculationVersion}`,
            rep.run.status,
            rep.headcount.totalEmployees,
            rep.financialTotals.baseMonthlyGross.toFixed(2),
            rep.financialTotals.earnedGross.toFixed(2),
            rep.financialTotals.totalEmployeeDeductions.toFixed(2),
            rep.financialTotals.roundingAdjustment.toFixed(2),
            rep.financialTotals.netSalary.toFixed(2),
            rep.financialTotals.totalEmployerContributions.toFixed(2),
            rep.financialTotals.totalCostToCompany.toFixed(2),
            rep.reconciliationAudit.grossMinusDeductionsEqualsNet ? 'YES' : 'NO',
          ].map(String),
        ];
        break;
      }

      case 'REP-PAY-02': {
        headers = [
          'Cost Center Dimension',
          'Cost Center Name',
          'Headcount',
          'Earned Gross',
          'Employee Deductions',
          'Net Salary',
          'Employer Contributions',
          'Total CTC',
          'Percentage of Payroll (%)',
        ];
        const rep = await this.payrollAnalyticsService.getCostCenterReport(user, query);
        rows = [
          ...rep.departments.map((d) =>
            [
              'DEPARTMENT',
              d.name,
              d.employeeCount,
              d.earnedGross.toFixed(2),
              d.employeeDeductions.toFixed(2),
              d.netPay.toFixed(2),
              d.employerContributions.toFixed(2),
              d.totalCtc.toFixed(2),
              `${d.percentageOfTotalPayroll}%`,
            ].map(String),
          ),
          ...rep.branches.map((b) =>
            [
              'BRANCH',
              b.name,
              b.employeeCount,
              b.earnedGross.toFixed(2),
              b.employeeDeductions.toFixed(2),
              b.netPay.toFixed(2),
              b.employerContributions.toFixed(2),
              b.totalCtc.toFixed(2),
              `${b.percentageOfTotalPayroll}%`,
            ].map(String),
          ),
        ];
        break;
      }

      case 'REP-PAY-03': {
        headers = [
          'Employee Code',
          'Employee Name',
          'Department',
          'Designation',
          'Branch',
          'Working Days',
          'Paid Days',
          'LOP Days',
          'Base Monthly Salary',
          'Earned Gross',
          'Total Deductions',
          'Net Salary',
          'Employer Cost',
          'Total CTC',
          'Payment Method',
          'Payment Status',
          'Payslip Status',
          'Masked Bank Account',
          'Masked PAN',
        ];
        const rep = await this.payrollAnalyticsService.getPayrollRegisterReport(user, {
          ...query,
          limit,
        });
        rows = rep.items.map((emp) =>
          [
            emp.employeeCode,
            emp.employeeName,
            emp.departmentName,
            emp.designationTitle,
            emp.branchName,
            emp.workingDays,
            emp.paidDays,
            emp.lopDays,
            emp.baseSalary.toFixed(2),
            emp.earnedGross.toFixed(2),
            emp.totalDeductions.toFixed(2),
            emp.netSalary.toFixed(2),
            emp.employerCost.toFixed(2),
            emp.totalCtc.toFixed(2),
            emp.paymentMethod,
            emp.paymentStatus,
            emp.payslipStatus,
            emp.bankAccountMasked || '••••••••4812',
            emp.panMasked || '•••••9018A',
          ].map(String),
        );
        break;
      }

      case 'REP-PAY-04': {
        headers = [
          'Category',
          'Component Code',
          'Component Name',
          'Participating Employees',
          'Standard Allocated Amount',
          'Earned Disbursed Amount',
          'Category Share (%)',
        ];
        const rep = await this.payrollAnalyticsService.getEarningsDeductionsReport(user, query);
        rows = [
          ...rep.earnings.map((e) =>
            [
              'EARNING',
              e.componentCode,
              e.componentName,
              e.employeeCount,
              e.totalStandardAmount.toFixed(2),
              e.totalEarnedAmount.toFixed(2),
              `${e.percentageOfCategory}%`,
            ].map(String),
          ),
          ...rep.deductions.map((d) =>
            [
              'DEDUCTION',
              d.componentCode,
              d.componentName,
              d.employeeCount,
              d.totalStandardAmount.toFixed(2),
              d.totalEarnedAmount.toFixed(2),
              `${d.percentageOfCategory}%`,
            ].map(String),
          ),
          ...rep.employerContributions.map((ec) =>
            [
              'EMPLOYER_CONTRIBUTION',
              ec.componentCode,
              ec.componentName,
              ec.employeeCount,
              ec.totalStandardAmount.toFixed(2),
              ec.totalEarnedAmount.toFixed(2),
              `${ec.percentageOfCategory}%`,
            ].map(String),
          ),
        ];
        break;
      }

      case 'REP-PAY-05': {
        headers = [
          'Exception ID',
          'Severity',
          'Category',
          'Title',
          'Employee Name',
          'Status',
          'Resolution Action',
          'Notes',
        ];
        const rep = await this.payrollAnalyticsService.getPayrollExceptionsReport(user, query);
        rows = (rep.unresolvedWarnings || []).map((ex) =>
          [
            ex.id,
            'WARNING',
            ex.category,
            ex.title,
            ex.employeeName || 'N/A',
            'OPEN',
            'PENDING_REVIEW',
            '',
          ].map(String),
        );
        break;
      }

      case 'REP-PAY-06': {
        headers = [
          'Comparison Metric',
          'Base Period Value',
          'Comparison Period Value',
          'Absolute Difference',
          'Percentage Change (%)',
          'Trend',
        ];
        const rep = await this.payrollAnalyticsService.getPeriodComparisonReport(user, query);
        rows = rep.variances.map((v) =>
          [
            v.metric,
            v.baseValue.toFixed(2),
            v.compareValue.toFixed(2),
            v.absoluteChange.toFixed(2),
            `${v.percentageChange}%`,
            v.trend,
          ].map(String),
        );
        break;
      }

      case 'REP-PAY-07': {
        headers = [
          'Adjustment ID',
          'Employee Code',
          'Employee Name',
          'Type',
          'Amount (INR)',
          'Taxable',
          'Status',
          'Reason',
          'Requested By',
          'Approved By',
          'Date',
        ];
        const rep = await this.payrollAnalyticsService.getPayrollAdjustmentsReport(user, query);
        rows = rep.items.map((adj) =>
          [
            adj.id,
            adj.employeeCode,
            adj.employeeName,
            adj.adjustmentType,
            adj.amount.toFixed(2),
            adj.taxable ? 'YES' : 'NO',
            adj.status,
            adj.reason,
            adj.requestedBy,
            adj.approvedBy || 'N/A',
            adj.createdAt.split('T')[0],
          ].map(String),
        );
        break;
      }

      case 'REP-PAY-08': {
        headers = [
          'Approval ID',
          'Run Title',
          'Period',
          'From Status',
          'To Status',
          'Action',
          'Decision Maker',
          'Actor Email',
          'Role',
          'Decision Timestamp',
          'Comments',
        ];
        const rep = await this.payrollAnalyticsService.getApprovalHistoryReport(user, query);
        rows = rep.items.map((h) =>
          [
            h.id,
            h.runTitle,
            h.periodName,
            h.fromStatus,
            h.toStatus,
            h.action,
            h.actorName,
            h.actorEmail,
            h.actorRole,
            h.decisionTimestamp,
            h.comments || '',
          ].map(String),
        );
        break;
      }

      case 'REP-PAY-09': {
        headers = [
          'Employee Code',
          'Employee Name',
          'Department',
          'Bank Name',
          'Masked Account',
          'Net Payable (INR)',
          'Payment Method',
          'Payment Reference',
          'Payment Status',
          'Paid At',
          'Reconciled Status',
        ];
        const rep = await this.payrollAnalyticsService.getPaymentReconciliationReport(user, query);
        rows = rep.items.map((p) =>
          [
            p.employeeCode,
            p.employeeName,
            p.departmentName,
            p.bankName,
            p.bankAccountMasked,
            p.netPayable.toFixed(2),
            p.paymentMethod,
            p.paymentReference || 'N/A',
            p.paymentStatus,
            p.paidAt ? p.paidAt.split('T')[0] : 'N/A',
            p.isReconciled ? 'RECONCILED' : 'UNRECONCILED',
          ].map(String),
        );
        break;
      }

      default:
        throw new BadRequestException(`Export for reportKey '${query.reportKey}' is not supported`);
    }

    // Build Sanitized CSV Content with Formula Injection Mitigation
    const csvRows: string[] = [
      headers.map((h) => this.sanitizeCsvField(h)).join(','),
      ...rows.map((row) => row.map((cell) => this.sanitizeCsvField(cell)).join(',')),
    ];
    const csv = csvRows.join('\r\n');

    // Secure, Nonce-based Filename (Prevents Path Traversal)
    const sanitizedKey = query.reportKey.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hrms-export-${sanitizedKey}-${timestamp}.csv`;

    // Operational Audit Log (Asynchronously record without exposing sensitive payload)
    try {
      await (this.prisma as any).auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'REPORT_EXPORTED',
          entity: 'REPORT',
          entityId: sanitizedKey,
          newValues: {
            reportKey: sanitizedKey,
            rowCount: rows.length,
            filename,
            filterParams: {
              asOfDate: query.asOfDate,
              startDate: query.startDate,
              endDate: query.endDate,
              departmentId: query.departmentId,
              branchId: query.branchId,
            },
          },
        },
      });
    } catch (auditErr: any) {
      this.logger.warn(`Failed to record export audit log: ${auditErr.message}`);
    }

    return {
      filename,
      csv,
      rowCount: rows.length,
      contentType: 'text/csv; charset=utf-8',
    };
  }
}
