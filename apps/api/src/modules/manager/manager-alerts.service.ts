import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HierarchyService } from '../employees/hierarchy.service';
import { NotificationsService, InternalNotification } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

export interface PendingRequestAlertParams {
  organizationId: string;
  employeeId: string;
  type: 'LEAVE' | 'WFH' | 'VISIT' | 'OFFICIAL_VISIT';
  requestId: string;
  startDate: string | Date;
  endDate: string | Date;
  summary?: string;
}

export interface ApprovalOutcomeAlertParams {
  organizationId: string;
  employeeId: string;
  type: 'LEAVE' | 'WFH' | 'VISIT' | 'OFFICIAL_VISIT';
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  decidedByUserId: string;
  startDate: string | Date;
  endDate: string | Date;
  sanitizedComments?: string;
}

export interface AttendanceExceptionAlertParams {
  organizationId: string;
  employeeId: string;
  exceptionId: string;
  exceptionType: string;
  severity: string;
  date: string | Date;
  details?: Record<string, any>;
}

export interface ManagerAlertsQueryDto {
  type?: string;
  isRead?: boolean;
  limit?: number;
}

@Injectable()
export class ManagerAlertsService {
  private readonly logger = new Logger(ManagerAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchyService: HierarchyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 1. Alert Manager of New Request Requiring Action (Leave, WFH, Official Visits).
   * - Resolves direct reporting manager authorized to act.
   * - Omits confidential medical reasons or sensitive personal details.
   * - Stores deep link pointing to the manager unified approvals portal.
   * - Retries produce no duplicate notifications via deterministic idempotencyKey.
   * - Guaranteed non-blocking delivery: failures will not corrupt caller transaction.
   */
  async notifyManagerOfPendingRequest(
    params: PendingRequestAlertParams,
  ): Promise<InternalNotification | null> {
    try {
      const employee = await this.prisma.employee.findUnique({
        where: { id: params.employeeId },
        select: {
          id: true,
          displayName: true,
          employeeCode: true,
          managerId: true,
          manager: {
            select: { id: true, userId: true, displayName: true },
          },
          employment: {
            select: {
              managerId: true,
              manager: { select: { id: true, userId: true, displayName: true } },
            },
          },
        },
      });

      if (!employee) {
        this.logger.debug(
          `[Manager Alert] Employee #${params.employeeId} not found. Skipping notification.`,
        );
        return null;
      }

      const managerUserId =
        employee.manager?.userId || employee.employment?.manager?.userId || null;

      if (!managerUserId) {
        this.logger.debug(
          `[Manager Alert] No reporting manager user found for employee ${employee.displayName} (${employee.id}).`,
        );
        return null;
      }

      const typeLabel = this.formatTypeLabel(params.type);
      const dateRangeStr = this.formatDateRange(params.startDate, params.endDate);
      const title = `Action Required: New ${typeLabel} Request`;
      const message = `${employee.displayName} submitted a ${typeLabel} request for ${dateRangeStr}. Review and action required.`;
      const normType =
        params.type.toUpperCase() === 'OFFICIAL_VISIT' ? 'VISIT' : params.type.toUpperCase();

      return await this.notificationsService.createNotification({
        userId: managerUserId,
        organizationId: params.organizationId,
        title,
        message,
        type: 'ACTION_REQUIRED',
        link: `/manager?tab=approvals&type=${normType}&id=${params.requestId}`,
        idempotencyKey: `notif:mgr_pending:${normType}:${params.requestId}`,
        metadata: {
          requestId: params.requestId,
          type: normType,
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          startDate: this.toDateString(params.startDate),
          endDate: this.toDateString(params.endDate),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch pending request alert to manager: ${err.message}`);
      return null;
    }
  }

  /**
   * 2. Alert Employee and Manager of Approval Decision Outcomes.
   * - Dispatches outcome notification to applicant employee.
   * - Also notifies manager if decision was an executive/HR override.
   * - Omits sensitive private notes while including high-level review status.
   * - Retries produce no duplicate notifications via deterministic idempotencyKey.
   */
  async notifyApprovalOutcome(params: ApprovalOutcomeAlertParams): Promise<{
    employeeNotification: InternalNotification | null;
    managerNotification: InternalNotification | null;
  }> {
    let employeeNotification: InternalNotification | null = null;
    let managerNotification: InternalNotification | null = null;

    try {
      const employee = await this.prisma.employee.findUnique({
        where: { id: params.employeeId },
        select: {
          id: true,
          userId: true,
          displayName: true,
          employeeCode: true,
          managerId: true,
          manager: { select: { id: true, userId: true, displayName: true } },
          employment: { select: { manager: { select: { id: true, userId: true } } } },
        },
      });

      if (!employee) {
        return { employeeNotification: null, managerNotification: null };
      }

      const typeLabel = this.formatTypeLabel(params.type);
      const normType =
        params.type.toUpperCase() === 'OFFICIAL_VISIT' ? 'VISIT' : params.type.toUpperCase();
      const isApproved = params.decision.toUpperCase() === 'APPROVED';
      const dateRangeStr = this.formatDateRange(params.startDate, params.endDate);

      // A. Notify Applicant Employee
      if (employee.userId) {
        const employeeLink =
          normType === 'LEAVE'
            ? `/leave?id=${params.requestId}`
            : normType === 'WFH'
              ? `/wfh?id=${params.requestId}`
              : `/visits?id=${params.requestId}`;

        const employeeTitle = `${typeLabel} Request ${isApproved ? 'Approved' : 'Rejected'}`;
        const employeeMsg = `Your ${typeLabel} request for ${dateRangeStr} has been ${isApproved ? 'approved' : 'rejected'}.${params.sanitizedComments ? ` Remarks: "${params.sanitizedComments}"` : ''}`;

        employeeNotification = await this.notificationsService.createNotification({
          userId: employee.userId,
          organizationId: params.organizationId,
          title: employeeTitle,
          message: employeeMsg,
          type: isApproved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
          link: employeeLink,
          idempotencyKey: `notif:outcome:${normType}:${params.requestId}:${params.decision}`,
          metadata: {
            requestId: params.requestId,
            type: normType,
            decision: params.decision,
            approverUserId: params.decidedByUserId,
          },
        });
      }

      // B. If decision was made by an override / someone other than direct manager, notify manager too
      const managerUserId =
        employee.manager?.userId || employee.employment?.manager?.userId || null;
      if (managerUserId && managerUserId !== params.decidedByUserId) {
        const mgrTitle = `Team Request ${isApproved ? 'Approved' : 'Rejected'}: ${employee.displayName}`;
        const mgrMsg = `${employee.displayName}'s ${typeLabel} request for ${dateRangeStr} was ${isApproved ? 'approved' : 'rejected'}.`;

        managerNotification = await this.notificationsService.createNotification({
          userId: managerUserId,
          organizationId: params.organizationId,
          title: mgrTitle,
          message: mgrMsg,
          type: isApproved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
          link: `/manager?tab=approvals&type=${normType}&id=${params.requestId}`,
          idempotencyKey: `notif:mgr_outcome:${normType}:${params.requestId}:${params.decision}`,
          metadata: {
            requestId: params.requestId,
            type: normType,
            decision: params.decision,
            employeeId: employee.id,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch approval outcome alerts: ${err.message}`);
    }

    return { employeeNotification, managerNotification };
  }

  /**
   * 3. Alert Manager of Actionable Attendance Exceptions (MEDIUM/HIGH/CRITICAL).
   * - Redacts precise coordinates, tokens, and system secrets.
   * - Delivers actionable exception alert to direct reporting manager.
   * - Uses deep link to manager attendance view.
   * - Prevents duplicate notifications on exception evaluation retries.
   */
  async notifyActionableAttendanceException(
    params: AttendanceExceptionAlertParams,
  ): Promise<InternalNotification | null> {
    try {
      const severityNorm = (params.severity || 'MEDIUM').toUpperCase();
      // Skip LOW severity from spamming managers with action notifications
      if (severityNorm === 'LOW') {
        return null;
      }

      const employee = await this.prisma.employee.findUnique({
        where: { id: params.employeeId },
        select: {
          id: true,
          displayName: true,
          employeeCode: true,
          managerId: true,
          manager: { select: { id: true, userId: true } },
          employment: { select: { manager: { select: { id: true, userId: true } } } },
        },
      });

      if (!employee) return null;

      const managerUserId =
        employee.manager?.userId || employee.employment?.manager?.userId || null;
      if (!managerUserId) return null;

      const friendlyType = this.formatExceptionType(params.exceptionType);
      const dateStr = this.toDateString(params.date);
      const title = `Attendance Exception: ${friendlyType} (${severityNorm})`;
      const message = `${employee.displayName} (${employee.employeeCode}) was flagged for ${friendlyType} on ${dateStr}. Review and action may be required.`;

      return await this.notificationsService.createNotification({
        userId: managerUserId,
        organizationId: params.organizationId,
        title,
        message,
        type: 'EXCEPTION_ALERT',
        link: `/attendance?id=${params.exceptionId}`,
        idempotencyKey: `notif:mgr_exception:${params.exceptionId}`,
        metadata: {
          exceptionId: params.exceptionId,
          employeeId: employee.id,
          exceptionType: params.exceptionType,
          severity: severityNorm,
          date: dateStr,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch attendance exception alert: ${err.message}`);
      return null;
    }
  }

  /**
   * 4. Scan and Alert Manager of Upcoming Approved Absences for Team Roster.
   * - Detects team members with approved leave, WFH, or official visits starting within next 24-48 hours.
   * - Non-duplicate idempotent notifications so running periodically or on demand is safe.
   */
  async scanAndNotifyUpcomingAbsences(
    user: AuthenticatedUser,
    targetDate?: Date,
  ): Promise<{ scannedCount: number; alertedCount: number; alerts: InternalNotification[] }> {
    const alerts: InternalNotification[] = [];
    try {
      const managerEmployee = await this.prisma.employee.findFirst({
        where: { userId: user.id, organizationId: user.organizationId },
        select: { id: true, displayName: true },
      });

      if (!managerEmployee) {
        return { scannedCount: 0, alertedCount: 0, alerts: [] };
      }

      // Resolve team subordinates
      const hierarchy = await this.hierarchyService.getTeam(
        managerEmployee.id,
        user.organizationId,
      );

      const subordinateIds = (hierarchy.allMemberIds || []).filter(
        (id: string) => id !== managerEmployee.id,
      );

      if (subordinateIds.length === 0) {
        return { scannedCount: 0, alertedCount: 0, alerts: [] };
      }

      // Target Date: Tomorrow (or specified date)
      const target = targetDate ? new Date(targetDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const dateStr = target.toISOString().split('T')[0];
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

      // Query upcoming approved leaves, WFH, and official visits
      const [approvedLeaves, approvedWfh, approvedVisits] = await Promise.all([
        this.prisma.leaveRequest.findMany({
          where: {
            organizationId: user.organizationId,
            employeeId: { in: subordinateIds },
            status: 'APPROVED',
            startDate: { lte: endOfDay },
            endDate: { gte: startOfDay },
          },
          include: {
            employee: { select: { id: true, displayName: true, employeeCode: true } },
            leaveType: { select: { name: true } },
          },
        }),
        this.prisma.wfhRequest.findMany({
          where: {
            organizationId: user.organizationId,
            employeeId: { in: subordinateIds },
            status: 'APPROVED',
            startDate: { lte: endOfDay },
            endDate: { gte: startOfDay },
          },
          include: {
            employee: { select: { id: true, displayName: true, employeeCode: true } },
          },
        }),
        this.prisma.officialVisit.findMany({
          where: {
            organizationId: user.organizationId,
            employeeId: { in: subordinateIds },
            status: 'APPROVED',
            startDate: { lte: endOfDay },
            endDate: { gte: startOfDay },
          },
          include: {
            employee: { select: { id: true, displayName: true, employeeCode: true } },
          },
        }),
      ]);

      const totalScanned = approvedLeaves.length + approvedWfh.length + approvedVisits.length;

      // 1. Process Leaves
      for (const leave of approvedLeaves) {
        const empName = leave.employee?.displayName || 'Team Member';
        const leaveTypeName = leave.leaveType?.name || 'Leave';
        const notif = await this.notificationsService.createNotification({
          userId: user.id,
          organizationId: user.organizationId,
          title: `Upcoming Team Absence: ${empName}`,
          message: `${empName} is scheduled for approved ${leaveTypeName} on ${dateStr}.`,
          type: 'UPCOMING_ABSENCE',
          link: '/manager?tab=roster',
          idempotencyKey: `notif:mgr_upcoming:leave:${leave.id}:${dateStr}`,
          metadata: {
            requestId: leave.id,
            absenceType: 'LEAVE',
            employeeId: leave.employeeId,
            date: dateStr,
          },
        });
        if (notif) alerts.push(notif);
      }

      // 2. Process WFH
      for (const wfh of approvedWfh) {
        const empName = wfh.employee?.displayName || 'Team Member';
        const notif = await this.notificationsService.createNotification({
          userId: user.id,
          organizationId: user.organizationId,
          title: `Upcoming Remote Work: ${empName}`,
          message: `${empName} is scheduled for approved Work From Home on ${dateStr}.`,
          type: 'UPCOMING_ABSENCE',
          link: '/manager?tab=roster',
          idempotencyKey: `notif:mgr_upcoming:wfh:${wfh.id}:${dateStr}`,
          metadata: {
            requestId: wfh.id,
            absenceType: 'WFH',
            employeeId: wfh.employeeId,
            date: dateStr,
          },
        });
        if (notif) alerts.push(notif);
      }

      // 3. Process Visits
      for (const visit of approvedVisits) {
        const empName = visit.employee?.displayName || 'Team Member';
        const notif = await this.notificationsService.createNotification({
          userId: user.id,
          organizationId: user.organizationId,
          title: `Upcoming Official Visit: ${empName}`,
          message: `${empName} is scheduled for an approved Official Visit on ${dateStr}.`,
          type: 'UPCOMING_ABSENCE',
          link: '/manager?tab=roster',
          idempotencyKey: `notif:mgr_upcoming:visit:${visit.id}:${dateStr}`,
          metadata: {
            requestId: visit.id,
            absenceType: 'OFFICIAL_VISIT',
            employeeId: visit.employeeId,
            date: dateStr,
          },
        });
        if (notif) alerts.push(notif);
      }

      return {
        scannedCount: totalScanned,
        alertedCount: alerts.length,
        alerts,
      };
    } catch (err: any) {
      this.logger.warn(`Upcoming absences scan failed: ${err.message}`);
      return { scannedCount: 0, alertedCount: 0, alerts: [] };
    }
  }

  /**
   * 5. Get Manager Portal Alerts & Action Items with Read/Unread State.
   */
  async getManagerAlerts(user: AuthenticatedUser, query?: ManagerAlertsQueryDto) {
    const rawNotifications = await this.notificationsService.getNotifications(
      user.id,
      user.organizationId,
      {
        type: query?.type,
        isRead: query?.isRead,
        limit: query?.limit || 50,
      },
    );

    const managerAlertTypes = new Set([
      'ACTION_REQUIRED',
      'REQUEST_PENDING',
      'EXCEPTION_ALERT',
      'UPCOMING_ABSENCE',
      'APPROVAL_APPROVED',
      'APPROVAL_REJECTED',
      'LEAVE_SUBMITTED',
      'INFO',
      'WARNING',
    ]);

    const filtered = rawNotifications.filter((n) => managerAlertTypes.has(n.type || ''));
    const unreadCount = filtered.filter((n) => !n.isRead).length;

    return {
      alerts: filtered,
      total: filtered.length,
      unreadCount,
    };
  }

  // --- Helper formatting methods ---

  private formatTypeLabel(type: string): string {
    const t = type.toUpperCase();
    if (t === 'LEAVE') return 'Leave';
    if (t === 'WFH') return 'Work From Home';
    if (t === 'VISIT' || t === 'OFFICIAL_VISIT') return 'Official Visit';
    return type;
  }

  private formatDateRange(start: string | Date, end: string | Date): string {
    const s = this.toDateString(start);
    const e = this.toDateString(end);
    return s === e ? s : `${s} to ${e}`;
  }

  private toDateString(val: string | Date): string {
    if (typeof val === 'string') {
      return val.split('T')[0];
    }
    return val.toISOString().split('T')[0];
  }

  private formatExceptionType(type: string): string {
    return type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
