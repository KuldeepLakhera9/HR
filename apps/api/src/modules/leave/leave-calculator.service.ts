import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveDurationType } from '@prisma/client';

export interface CalculatedLeaveDaysResult {
  totalCalendarDays: number;
  chargeableDays: number;
  holidayDays: number;
  weekendDays: number;
  holidaysEncountered: Array<{ name: string; date: string }>;
  isSandwichApplied: boolean;
}

@Injectable()
export class LeaveCalculatorService {
  private readonly logger = new Logger(LeaveCalculatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalizes an ISO string or Date to UTC Midnight (00:00:00.000Z)
   */
  normalizeDateToUtc(input: string | Date): Date {
    const d = typeof input === 'string' ? new Date(input) : input;
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date format provided');
    }
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  }

  /**
   * Evaluates net chargeable leave days between start and end date,
   * taking into account employee shift workdays, gazetted holidays, and policy sandwich rules.
   */
  async calculateLeaveDays(params: {
    organizationId: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    durationType?: LeaveDurationType;
  }): Promise<CalculatedLeaveDaysResult> {
    const { organizationId, employeeId, leaveTypeId } = params;
    const start = this.normalizeDateToUtc(params.startDate);
    const end = this.normalizeDateToUtc(params.endDate);
    const durationType = params.durationType || LeaveDurationType.FULL_DAY;

    if (end < start) {
      throw new BadRequestException('Leave end date cannot be earlier than start date');
    }

    // 1. Resolve employee's branch for regional holiday lookups
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        employment: { select: { branchId: true } },
      },
    });
    const branchId = employee?.employment?.branchId || null;

    // 2. Fetch employee's active shift to determine standard working days (default Mon-Fri: [1, 2, 3, 4, 5])
    const shiftAssignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        organizationId,
        employeeId,
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    const workDays: number[] = shiftAssignment?.shift?.workDays || [1, 2, 3, 4, 5];

    // 3. Resolve active LeavePolicy to inspect Sandwich rules
    const policyAssignment = await this.prisma.employeeLeavePolicyAssignment.findFirst({
      where: {
        organizationId,
        employeeId,
        leavePolicy: { leaveTypeId },
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
      include: { leavePolicy: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const countWeekendsAsLeave = policyAssignment?.leavePolicy?.countWeekendsAsLeave ?? false;
    const countHolidaysAsLeave = policyAssignment?.leavePolicy?.countHolidaysAsLeave ?? false;

    // 4. Fetch all holidays falling within the leave date range for this org / branch
    const holidays = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        date: { gte: start, lte: end },
        OR: [{ branchId: null }, { branchId }],
      },
    });

    const holidayMap = new Map<string, string>();
    for (const h of holidays) {
      const dateKey = h.date.toISOString().split('T')[0];
      holidayMap.set(dateKey, h.name);
    }

    // 5. Day-by-day iteration
    let totalCalendarDays = 0;
    let weekendDays = 0;
    let holidayDays = 0;
    let chargeableFullDays = 0;
    const holidaysEncountered: Array<{ name: string; date: string }> = [];

    const current = new Date(start);
    while (current <= end) {
      totalCalendarDays++;
      const dateKey = current.toISOString().split('T')[0];
      // getUTCDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat. In our shifts: 1 = Mon, 7 = Sun.
      const dayOfWeek = current.getUTCDay() === 0 ? 7 : current.getUTCDay();
      const isWorkingDay = workDays.includes(dayOfWeek);
      const isHoliday = holidayMap.has(dateKey);

      if (isHoliday) {
        holidayDays++;
        holidaysEncountered.push({
          name: holidayMap.get(dateKey)!,
          date: dateKey,
        });
      }

      if (!isWorkingDay) {
        weekendDays++;
      }

      // Chargeable determination:
      let shouldCharge = false;
      if (isWorkingDay && !isHoliday) {
        shouldCharge = true;
      } else if (!isWorkingDay && countWeekendsAsLeave) {
        shouldCharge = true;
      } else if (isHoliday && countHolidaysAsLeave) {
        shouldCharge = true;
      }

      if (shouldCharge) {
        chargeableFullDays++;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    // 6. Half-day adjustment
    let chargeableDays = chargeableFullDays;
    if (durationType !== LeaveDurationType.FULL_DAY) {
      if (totalCalendarDays > 1) {
        throw new BadRequestException(
          'Half-day leaves are only permitted for single-day applications.',
        );
      }
      chargeableDays = chargeableFullDays > 0 ? 0.5 : 0;
    }

    const isSandwichApplied =
      (countWeekendsAsLeave && weekendDays > 0) || (countHolidaysAsLeave && holidayDays > 0);

    return {
      totalCalendarDays,
      chargeableDays,
      holidayDays,
      weekendDays,
      holidaysEncountered,
      isSandwichApplied,
    };
  }
}
