import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HierarchyService } from '../../employees/hierarchy.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { WorkforceAnalyticsService } from './workforce-analytics.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { RequestAnalyticsService } from './request-analytics.service';
import { PerformanceAnalyticsService } from './performance-analytics.service';
import { PayrollAnalyticsService } from './payroll-analytics.service';
import {
  CreateSavedReportDefinitionDto,
  QuerySavedReportsDto,
  QueryReportCatalogDto,
} from '../dto/mis-library.dto';
import {
  MisReportCatalogItemDto,
  SavedReportDefinitionDto,
  ExecuteSavedReportResultDto,
} from '@hrms/types';

@Injectable()
export class MisReportLibraryService {
  private readonly logger = new Logger(MisReportLibraryService.name);

  // Authoritative Centralized MIS Report Catalog
  private readonly REPORT_CATALOG: MisReportCatalogItemDto[] = [
    // 1. Workforce & Headcount
    {
      key: 'REP-WF-01',
      title: 'Multi-Dimensional Headcount Snapshot',
      category: 'WORKFORCE',
      description:
        'Point-in-time active workforce distribution broken down by department, branch, designation, and employment status with privacy protections.',
      endpoint: '/reports/workforce/headcount',
      supportedFilters: ['asOfDate', 'departmentId', 'branchId', 'designationId', 'employmentType'],
      supportedDatePresets: ['AS_OF_DATE'],
      metricDefinitions: [
        {
          code: 'M-WF-01',
          name: 'Active Headcount',
          formula: 'Active, Probation, and Notice employees active on or before target date',
        },
      ],
      dataFreshness: 'Real-time transactional read with snapshot date boundary',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-WF-02',
      title: 'Joiners, Exits & Movement Flow',
      category: 'WORKFORCE',
      description:
        'Longitudinal analysis of new hires, departures, net workforce velocity, and annualized institutional turnover rates.',
      endpoint: '/reports/workforce/movement',
      supportedFilters: ['startDate', 'endDate', 'departmentId', 'branchId', 'page', 'limit'],
      supportedDatePresets: ['7D', '30D', 'MTD', 'CUSTOM'],
      metricDefinitions: [
        { code: 'M-WF-02', name: 'Period Joiners', formula: 'Sum of joiningDate in window' },
        {
          code: 'M-WF-03',
          name: 'Annualized Attrition Rate',
          formula: '(Exits / Avg Headcount) * (365.25 / Days) * 100',
        },
      ],
      dataFreshness: 'Aggregated real-time employee history and event timestamps',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-WF-03',
      title: 'Longitudinal Workforce Trends',
      category: 'WORKFORCE',
      description:
        'Rolling monthly headcount trends, monthly net changes, and localized retention trajectories over configurable intervals.',
      endpoint: '/reports/workforce/trends',
      supportedFilters: ['months', 'departmentId', 'branchId'],
      supportedDatePresets: ['6_MONTHS', '12_MONTHS'],
      metricDefinitions: [
        {
          code: 'M-WF-04',
          name: 'Net Workforce Growth',
          formula: 'Closing Headcount - Starting Headcount',
        },
      ],
      dataFreshness: 'Monthly rollups computed from verified join and exit ledgers',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },

    // 2. Attendance & Exceptions
    {
      key: 'REP-ATT-01',
      title: 'Daily Attendance Roster & Summary',
      category: 'ATTENDANCE',
      description:
        'Detailed daily attendance logs, check-in timestamps, punctuality compliance, working hours, and shift assignments.',
      endpoint: '/reports/attendance/daily',
      supportedFilters: [
        'startDate',
        'endDate',
        'branchId',
        'departmentId',
        'shiftId',
        'employeeId',
        'status',
        'page',
        'limit',
      ],
      supportedDatePresets: ['TODAY', 'YESTERDAY', '7D', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-ATT-01',
          name: 'Daily Attendance Rate',
          formula: 'Present Equivalent / Expected Working Days',
        },
      ],
      dataFreshness: 'Live punch logs and daily summary records',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-ATT-02',
      title: 'Weekly Attendance Matrix',
      category: 'ATTENDANCE',
      description:
        '7-day rolling attendance rate, daily present vs absent headcount breakdown, and on-time arrival trend analysis.',
      endpoint: '/reports/attendance/weekly',
      supportedFilters: [
        'startDate',
        'endDate',
        'branchId',
        'departmentId',
        'shiftId',
        'employeeId',
      ],
      supportedDatePresets: ['LAST_WEEK', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-ATT-02',
          name: 'Punctuality Compliance',
          formula: 'Zero late minutes check-ins / Total first punches * 100',
        },
      ],
      dataFreshness: 'Evaluated daily from shift assignments and daily attendance summaries',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-ATT-03',
      title: 'Monthly Timesheet Summary',
      category: 'ATTENDANCE',
      description:
        'Monthly aggregate work hours, overtime, deficit hours, half days, paid holidays, and weekly offs per employee.',
      endpoint: '/reports/attendance/monthly',
      supportedFilters: [
        'year',
        'month',
        'branchId',
        'departmentId',
        'employeeId',
        'shiftId',
        'status',
        'page',
        'limit',
      ],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-ATT-03',
          name: 'Monthly Productive Hours',
          formula: 'Sum of daily totalWorkMinutes / 60',
        },
      ],
      dataFreshness: 'Monthly rollups aligned to organizational timezone and cutoff dates',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-ATT-04',
      title: 'Attendance Exceptions & Irregularities',
      category: 'ATTENDANCE',
      description:
        'Confirmed attendance exceptions including unauthorized late arrivals, missing check-outs, early departures, and unresolved discrepancies.',
      endpoint: '/reports/attendance/exceptions',
      supportedFilters: [
        'startDate',
        'endDate',
        'branchId',
        'departmentId',
        'exceptionType',
        'status',
        'page',
        'limit',
      ],
      supportedDatePresets: ['7D', '30D', 'MTD', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-ATT-04',
          name: 'Exception Ratio',
          formula: 'Irregular Days / Evaluated Working Days * 100',
        },
      ],
      dataFreshness: 'Real-time exception queue backed by AttendanceDailySummary audit flags',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },

    // 3. Leave, WFH & Requests
    {
      key: 'REP-REQ-01',
      title: 'Approved Leave Utilization & Balance Ledgers',
      category: 'LEAVE_REQUESTS',
      description:
        'Authoritative leave quota utilization by category, distinguishing chargeable business days, calendar spans, pending reservations, and posted deductions.',
      endpoint: '/reports/requests/utilization',
      supportedFilters: [
        'startDate',
        'endDate',
        'leaveTypeId',
        'departmentId',
        'branchId',
        'employeeId',
      ],
      supportedDatePresets: ['30D', 'MTD', 'YEAR_TO_DATE', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-LV-01',
          name: 'Leave Utilization Rate',
          formula: 'Consumed Chargeable Days / Total Quota Allocated * 100',
        },
      ],
      dataFreshness: 'Authoritative balance accounts updated immediately on approval',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-REQ-02',
      title: 'Unified Request Volumes & Outcomes',
      category: 'LEAVE_REQUESTS',
      description:
        'Volume, outcome distributions, approval rates, and cancellation patterns across Leave, Remote Work (WFH), and Official Visits.',
      endpoint: '/reports/requests/volumes',
      supportedFilters: [
        'startDate',
        'endDate',
        'requestType',
        'status',
        'departmentId',
        'branchId',
      ],
      supportedDatePresets: ['7D', '30D', 'MTD', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-REQ-01',
          name: 'Workflow Approval Rate',
          formula: 'Approved Count / (Approved + Rejected + Cancelled) * 100',
        },
      ],
      dataFreshness: 'Real-time multi-workflow transaction logs',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-REQ-03',
      title: 'Approval Turnaround Time (TAT) & SLA Aging',
      category: 'LEAVE_REQUESTS',
      description:
        'Pending request aging brackets (< 24h, 1-3d, 4-7d, > 7d) and approval velocity measured in working business hours vs calendar hours.',
      endpoint: '/reports/requests/turnaround',
      supportedFilters: [
        'startDate',
        'endDate',
        'requestType',
        'departmentId',
        'branchId',
        'employeeId',
      ],
      supportedDatePresets: ['30D', 'MTD', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-REQ-02',
          name: 'Average Approval TAT',
          formula: 'Sum of decision elapsed working hours / Total Decided',
        },
      ],
      dataFreshness: 'Measured from submission createdAt to final decision decidedAt',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },

    // 4. Performance Management
    {
      key: 'REP-PM-01',
      title: 'Review Cycle Participation & Outcome Funnel',
      category: 'PERFORMANCE',
      description:
        'Review cycle enrollment, self-assessment completion, manager reviews, overdue appraisals, and differential privacy rating distributions.',
      endpoint: '/reports/performance/overview',
      supportedFilters: ['cycleId', 'departmentId', 'branchId', 'employeeId'],
      supportedDatePresets: ['CYCLE_WINDOW'],
      metricDefinitions: [
        {
          code: 'M-PM-01',
          name: 'Cycle Completion Rate',
          formula: 'Finalized Reviews / (Enrolled - Exempted - Withdrawn) * 100',
        },
      ],
      dataFreshness: 'Active cycle state with finalized score integrity guards',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PM-02',
      title: 'Goal Progress & Lagging Actions',
      category: 'PERFORMANCE',
      description:
        'Goal volume, completion rates, category distributions, average progress percentage, and lagging / at-risk goal inspect queues.',
      endpoint: '/reports/performance/goals',
      supportedFilters: ['cycleId', 'departmentId', 'branchId', 'employeeId'],
      supportedDatePresets: ['CYCLE_WINDOW'],
      metricDefinitions: [
        {
          code: 'M-PM-02',
          name: 'Average Goal Progress',
          formula: 'Sum of progressPercentage / Eligible Active Goals',
        },
      ],
      dataFreshness: 'Real-time progress updates from verified goal ledgers',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PM-03',
      title: 'Employee Development Plan Action Items',
      category: 'PERFORMANCE',
      description:
        'Employee capability development actions, execution progress, target date milestones, and overdue action tracking.',
      endpoint: '/reports/performance/development-plans',
      supportedFilters: ['cycleId', 'departmentId', 'branchId', 'employeeId'],
      supportedDatePresets: ['CYCLE_WINDOW'],
      metricDefinitions: [
        {
          code: 'M-PM-03',
          name: 'Plan Completion Rate',
          formula: 'Completed Actions / (Total - Cancelled) * 100',
        },
      ],
      dataFreshness: 'Development plan status updates and milestone confirmations',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },

    // 5. Phase 11.10: Enterprise Payroll Management & Reconciliation
    {
      key: 'REP-PAY-01',
      title: 'Executive Payroll Summary & Reconciliation',
      category: 'PAYROLL',
      description:
        'Authoritative gross-to-net reconciliation summary across active and historical runs with rounding balance audits and status rollups.',
      endpoint: '/reports/payroll/summary',
      supportedFilters: ['periodId', 'runId', 'departmentId', 'branchId', 'payrollStatus'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-01',
          name: 'Net Payroll Spend',
          formula: 'Earned Gross - Total Deductions + Rounding Adjustment',
        },
        {
          code: 'M-PAY-02',
          name: 'Total Cost to Company (CTC)',
          formula: 'Earned Gross + Employer Contributions',
        },
      ],
      dataFreshness:
        'Immutable snapshot aggregations tied to approved and locked payroll calculation versions',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PAY-02',
      title: 'Department & Branch Payroll Cost Centers',
      category: 'PAYROLL',
      description:
        'Cost allocation across organizational dimensions including department and branch payroll percentages of total company payroll spend.',
      endpoint: '/reports/payroll/cost-center',
      supportedFilters: ['periodId', 'runId', 'departmentId', 'branchId'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-03',
          name: 'Cost Center Ratio',
          formula: 'Department Total CTC / Total Organization CTC * 100',
        },
      ],
      dataFreshness: 'Real-time calculation run rollup with departmental assignment mapping',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PAY-03',
      title: 'Comprehensive Payroll Register (Restricted)',
      category: 'PAYROLL',
      description:
        'Confidential employee-level salary register itemizing working days, paid days, LOP, base salary, gross earnings, deductions, net salary, and disbursement channels.',
      endpoint: '/reports/payroll/register',
      supportedFilters: [
        'periodId',
        'runId',
        'departmentId',
        'branchId',
        'payrollStatus',
        'paymentStatus',
        'search',
        'page',
        'limit',
      ],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-04',
          name: 'Employee Net Pay',
          formula: 'Earned Gross - Statutory Deductions - Voluntary Deductions',
        },
      ],
      dataFreshness: 'Direct snapshot read with masked banking and tax identifiers',
      allowedRoles: ['ADMIN', 'HR'],
      supportedViews: ['TABLE'],
    },
    {
      key: 'REP-PAY-04',
      title: 'Salary Earnings & Deductions Breakdown',
      category: 'PAYROLL',
      description:
        'Itemized line-item ledger across all salary component types (Basic, HRA, Allowances, PF, PT, TDS, ESI, and Overtime) with employee participation metrics.',
      endpoint: '/reports/payroll/earnings-deductions',
      supportedFilters: ['periodId', 'runId', 'departmentId'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-05',
          name: 'Component Utilization',
          formula: 'Component Earned Amount / Category Total * 100',
        },
      ],
      dataFreshness: 'Verified line-item calculation snapshot aggregates',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PAY-05',
      title: 'Payroll Exceptions & Discrepancies',
      category: 'PAYROLL',
      description:
        'Diagnostic log of blocking calculation errors, warnings, unresolved attendance inputs, negative net pay exceptions, and override decisions.',
      endpoint: '/reports/payroll/exceptions',
      supportedFilters: ['periodId', 'runId', 'severity', 'status'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-06',
          name: 'Blocking Exception Count',
          formula: 'Sum of open BLOCKING_ERROR exceptions',
        },
      ],
      dataFreshness: 'Live transactional exception ledger synchronized with run orchestration',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['TABLE'],
    },
    {
      key: 'REP-PAY-06',
      title: 'Longitudinal Payroll Period Comparison',
      category: 'PAYROLL',
      description:
        'Variance analysis between successive payroll cycles identifying employee count changes, salary increments, joiner/leaver impacts, and gross deviations.',
      endpoint: '/reports/payroll/period-comparison',
      supportedFilters: ['periodId', 'runId', 'compareRunId', 'comparePeriodId', 'departmentId'],
      supportedDatePresets: ['MONTH_OVER_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-07',
          name: 'Payroll Variance (%)',
          formula: '(Current Run Gross - Base Run Gross) / Base Run Gross * 100',
        },
      ],
      dataFreshness: 'Comparative delta computed across consecutive finalized calculation versions',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
    {
      key: 'REP-PAY-07',
      title: 'Manual Payroll Adjustments & Offsets',
      category: 'PAYROLL',
      description:
        'Audit trail of manual payroll adjustments (bonuses, arrear payouts, expense reimbursements, and LOP offsets) with approval metadata.',
      endpoint: '/reports/payroll/adjustments',
      supportedFilters: ['periodId', 'adjustmentType', 'payrollStatus'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-08',
          name: 'Net Adjustment Impact',
          formula: 'Total Additions - Total Deductions',
        },
      ],
      dataFreshness: 'Immediate transactional ledger reflecting adjustment approval states',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['TABLE'],
    },
    {
      key: 'REP-PAY-08',
      title: 'Payroll Finalization & Approval History',
      category: 'PAYROLL',
      description:
        'Compliance audit log of workflow approval transitions (Submission, Review, Approval, Rejection, Locking, and Publishing) with separation-of-duties evidence.',
      endpoint: '/reports/payroll/approval-history',
      supportedFilters: ['runId', 'periodId'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-09',
          name: 'Approval Turnaround',
          formula: 'Timestamp difference between submission and final sign-off',
        },
      ],
      dataFreshness: 'Immutable audit log of all transition events',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['TABLE'],
    },
    {
      key: 'REP-PAY-09',
      title: 'Bank Disbursement & Payment Reconciliation',
      category: 'PAYROLL',
      description:
        'Reconciliation of bank disbursement status, tracking settled payouts, pending transactions, failed direct deposits, and bank batch references.',
      endpoint: '/reports/payroll/payment-reconciliation',
      supportedFilters: ['periodId', 'runId', 'departmentId', 'paymentStatus'],
      supportedDatePresets: ['CURRENT_MONTH', 'LAST_MONTH', 'CUSTOM'],
      metricDefinitions: [
        {
          code: 'M-PAY-10',
          name: 'Reconciliation Percentage',
          formula: 'Disbursed Amount / Total Net Payable * 100',
        },
      ],
      dataFreshness: 'Bank settlement file upload and payment processor webhook updates',
      allowedRoles: ['ADMIN', 'HR', 'MANAGER'],
      supportedViews: ['CHART', 'TABLE'],
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly workforceAnalyticsService: WorkforceAnalyticsService,
    private readonly attendanceAnalyticsService: AttendanceAnalyticsService,
    private readonly requestAnalyticsService: RequestAnalyticsService,
    private readonly performanceAnalyticsService: PerformanceAnalyticsService,
    private readonly payrollAnalyticsService: PayrollAnalyticsService,
  ) {}

  /**
   * Helper: Ensure caller has authorized reporting role (ADMIN, HR, or MANAGER)
   */
  private checkReportAccess(user: AuthenticatedUser): {
    isAdminOrHr: boolean;
    isManager: boolean;
  } {
    const isAdminOrHr = user.roles.includes('ADMIN') || user.roles.includes('HR');
    const isManager = user.roles.includes('MANAGER');

    if (!isAdminOrHr && !isManager) {
      throw new ForbiddenException(
        'Employees do not have authorized access to the centralized MIS Report Library',
      );
    }
    return { isAdminOrHr, isManager };
  }

  /**
   * 1. Discover Report Catalog
   * Returns list of authorized reports with descriptions, supported filters, and metric formulas.
   */
  async getCatalog(
    user: AuthenticatedUser,
    query: QueryReportCatalogDto,
  ): Promise<MisReportCatalogItemDto[]> {
    this.checkReportAccess(user);

    const items = this.REPORT_CATALOG.filter((item) => {
      // Role filter check
      const matchesRole = item.allowedRoles.some((r) => user.roles.includes(r as any));
      if (!matchesRole) return false;

      // Category filter check
      if (query.category && query.category !== 'ALL' && item.category !== query.category) {
        return false;
      }

      // Search keyword filter check
      if (query.search) {
        const s = query.search.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(s);
        const matchesDesc = item.description.toLowerCase().includes(s);
        const matchesKey = item.key.toLowerCase().includes(s);
        if (!matchesTitle && !matchesDesc && !matchesKey) return false;
      }

      return true;
    });

    return items;
  }

  /**
   * 2. Get User's Saved Report Definitions
   */
  async getSavedReports(
    user: AuthenticatedUser,
    query: QuerySavedReportsDto,
  ): Promise<{ items: SavedReportDefinitionDto[]; total: number }> {
    this.checkReportAccess(user);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: user.organizationId,
      userId: user.id, // Scoped to the user's saved definitions
      ...(query.reportKey ? { reportKey: query.reportKey } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rawItems, total] = await Promise.all([
      (this.prisma as any).savedReportDefinition.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).savedReportDefinition.count({ where }),
    ]);

    const items: SavedReportDefinitionDto[] = rawItems.map((r: any) => ({
      id: r.id,
      organizationId: r.organizationId,
      userId: r.userId,
      reportKey: r.reportKey,
      name: r.name,
      description: r.description,
      filterConfig: r.filterConfig as Record<string, any>,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { items, total };
  }

  /**
   * 3. Create a Saved Report Definition (Safe Parameterized Filter Preservation)
   * Validates that the reportKey exists and filterConfig contains only safe known fields.
   */
  async createSavedReport(
    user: AuthenticatedUser,
    dto: CreateSavedReportDefinitionDto,
  ): Promise<SavedReportDefinitionDto> {
    this.checkReportAccess(user);

    const catalogItem = this.REPORT_CATALOG.find((c) => c.key === dto.reportKey);
    if (!catalogItem) {
      throw new BadRequestException(
        `Invalid reportKey '${dto.reportKey}'. Must correspond to an approved report in the catalog.`,
      );
    }

    // Security Gate: Ensure filterConfig only contains allowed filter keys for this report
    const sanitizedConfig: Record<string, any> = {};
    const allowed = new Set(catalogItem.supportedFilters);

    for (const [key, value] of Object.entries(dto.filterConfig)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(
          `Filter key '${key}' is not allowed for report '${catalogItem.key}'. Supported filters: ${catalogItem.supportedFilters.join(', ')}`,
        );
      }
      // Reject any malicious or arbitrary SQL keywords
      if (
        typeof value === 'string' &&
        /union\s+select|drop\s+table|insert\s+into|delete\s+from|;|--/i.test(value)
      ) {
        throw new BadRequestException(
          'Invalid filter value: forbidden SQL character sequence detected',
        );
      }
      sanitizedConfig[key] = value;
    }

    const created = await (this.prisma as any).savedReportDefinition.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        reportKey: dto.reportKey,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        filterConfig: sanitizedConfig,
      },
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      userId: created.userId,
      reportKey: created.reportKey,
      name: created.name,
      description: created.description,
      filterConfig: created.filterConfig as Record<string, any>,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * 4. Delete Saved Report Definition
   */
  async deleteSavedReport(user: AuthenticatedUser, id: string): Promise<{ success: boolean }> {
    this.checkReportAccess(user);

    const existing = await (this.prisma as any).savedReportDefinition.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Saved report definition not found');
    }

    // Only owner or admin can delete
    const isOwner = existing.userId === user.id;
    const isAdmin = user.roles.includes('ADMIN');
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this saved report');
    }

    await (this.prisma as any).savedReportDefinition.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 5. Authoritative Saved Report Execution
   * Critical Security Rule: Revalidates current user permissions and organizational scope
   * every time a saved report runs. Never uses stored privileges or static pre-computed totals.
   */
  async executeSavedReport(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ExecuteSavedReportResultDto> {
    const { isAdminOrHr } = this.checkReportAccess(user);

    const existing = await (this.prisma as any).savedReportDefinition.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Saved report definition not found in current organization');
    }

    const catalogItem = this.REPORT_CATALOG.find((c) => c.key === existing.reportKey);
    if (!catalogItem) {
      throw new BadRequestException(
        'The catalog specification for this saved report is not recognized',
      );
    }

    // Revalidate role permission
    const isRoleAuthorized = catalogItem.allowedRoles.some((r) => user.roles.includes(r as any));
    if (!isRoleAuthorized) {
      throw new ForbiddenException(
        `Your current role does not permit running report '${catalogItem.title}'`,
      );
    }

    const config = (existing.filterConfig || {}) as Record<string, any>;
    const executedAt = new Date().toISOString();
    const scopeType = isAdminOrHr ? 'ORGANIZATION' : 'TEAM';
    let data: any = null;

    // Dispatch execution to authoritative underlying services with re-validated caller context
    switch (existing.reportKey) {
      case 'REP-WF-01':
        data = await this.workforceAnalyticsService.getHeadcountReport(user, config);
        break;
      case 'REP-WF-02':
        data = await this.workforceAnalyticsService.getMovementReport(user, config);
        break;
      case 'REP-WF-03':
        data = await this.workforceAnalyticsService.getTrendsReport(user, config);
        break;
      case 'REP-ATT-01':
        data = await this.attendanceAnalyticsService.getDailyReport(user, config);
        break;
      case 'REP-ATT-02':
        data = await this.attendanceAnalyticsService.getWeeklyReport(user, config);
        break;
      case 'REP-ATT-03':
        data = await this.attendanceAnalyticsService.getMonthlyReport(user, config);
        break;
      case 'REP-ATT-04':
        data = await this.attendanceAnalyticsService.getExceptionsReport(user, config);
        break;
      case 'REP-REQ-01':
        data = await this.requestAnalyticsService.getLeaveUtilizationReport(user, config);
        break;
      case 'REP-REQ-02':
        data = await this.requestAnalyticsService.getRequestVolumesReport(user, config);
        break;
      case 'REP-REQ-03':
        data = await this.requestAnalyticsService.getApprovalTurnaroundReport(user, config);
        break;
      case 'REP-PM-01':
        data = await this.performanceAnalyticsService.getPerformanceOverviewReport(user, config);
        break;
      case 'REP-PM-02':
        data = await this.performanceAnalyticsService.getGoalProgressReport(user, config);
        break;
      case 'REP-PM-03':
        data = await this.performanceAnalyticsService.getDevelopmentPlanReport(user, config);
        break;
      case 'REP-PAY-01':
        data = await this.payrollAnalyticsService.getPayrollSummaryReport(user, config);
        break;
      case 'REP-PAY-02':
        data = await this.payrollAnalyticsService.getCostCenterReport(user, config);
        break;
      case 'REP-PAY-03':
        data = await this.payrollAnalyticsService.getPayrollRegisterReport(user, config);
        break;
      case 'REP-PAY-04':
        data = await this.payrollAnalyticsService.getEarningsDeductionsReport(user, config);
        break;
      case 'REP-PAY-05':
        data = await this.payrollAnalyticsService.getPayrollExceptionsReport(user, config);
        break;
      case 'REP-PAY-06':
        data = await this.payrollAnalyticsService.getPeriodComparisonReport(user, config);
        break;
      case 'REP-PAY-07':
        data = await this.payrollAnalyticsService.getPayrollAdjustmentsReport(user, config);
        break;
      case 'REP-PAY-08':
        data = await this.payrollAnalyticsService.getApprovalHistoryReport(user, config);
        break;
      case 'REP-PAY-09':
        data = await this.payrollAnalyticsService.getPaymentReconciliationReport(user, config);
        break;
      default:
        throw new BadRequestException(`Unmapped report key '${existing.reportKey}'`);
    }

    return {
      savedReport: {
        id: existing.id,
        organizationId: existing.organizationId,
        userId: existing.userId,
        reportKey: existing.reportKey,
        name: existing.name,
        description: existing.description,
        filterConfig: config,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      },
      catalogItem,
      executedAt,
      scopeType,
      data,
    };
  }
}
