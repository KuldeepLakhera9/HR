import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  CreatePayrollPeriodDto,
  QueryPayrollPeriodsDto,
  UpdatePayrollPeriodDto,
} from '../dto/payroll-period.dto';

@Injectable()
export class PayrollPeriodsService {
  private readonly logger = new Logger(PayrollPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, dto: CreatePayrollPeriodDto, actorId?: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date supplied.');
    }

    if (startDate >= endDate) {
      throw new BadRequestException('Start date must strictly precede end date.');
    }

    if (dto.cutoffDate) {
      const cutoff = new Date(dto.cutoffDate);
      if (cutoff < startDate || cutoff > endDate) {
        throw new BadRequestException(
          'Cutoff date must fall within the start and end dates of the period.',
        );
      }
    }

    if (dto.payoutDate) {
      const payout = new Date(dto.payoutDate);
      if (payout < startDate) {
        throw new BadRequestException('Payout date cannot be before period start date.');
      }
    }

    // Check existing period for organization, year, month
    const existing = await this.prisma.payrollPeriod.findUnique({
      where: {
        organizationId_year_month: {
          organizationId,
          year: dto.year,
          month: dto.month,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Payroll period for year ${dto.year} and month ${dto.month} already exists.`,
      );
    }

    // Compute total calendar days in interval
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const totalDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    const period = await this.prisma.payrollPeriod.create({
      data: {
        organizationId,
        year: dto.year,
        month: dto.month,
        startDate,
        endDate,
        totalDays,
        cutoffDate: dto.cutoffDate ? new Date(dto.cutoffDate) : null,
        payoutDate: dto.payoutDate ? new Date(dto.payoutDate) : null,
        processingDeadline: dto.processingDeadline ? new Date(dto.processingDeadline) : null,
        status: 'OPEN',
      },
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_PERIOD_CREATED',
      entity: 'PayrollPeriod',
      entityId: period.id,
      metadata: {
        year: period.year,
        month: period.month,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        totalDays: period.totalDays,
      },
    });

    this.logger.log(`Created payroll period ${dto.year}-${dto.month} (${period.id})`);
    return period;
  }

  async findAll(organizationId: string, query: QueryPayrollPeriodsDto) {
    const where: any = { organizationId };

    if (query.year) {
      where.year = query.year;
    }
    if (query.status) {
      where.status = query.status;
    }

    const periods = await this.prisma.payrollPeriod.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        _count: {
          select: { runs: true, adjustments: true },
        },
      },
    });

    return periods.map((p) => ({
      ...p,
      runsCount: p._count.runs,
      adjustmentsCount: p._count.adjustments,
    }));
  }

  async findById(organizationId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: { id, organizationId },
      include: {
        runs: {
          orderBy: { runNumber: 'desc' },
          select: {
            id: true,
            runNumber: true,
            title: true,
            scope: true,
            calculationVersion: true,
            status: true,
            totalEmployees: true,
            totalGross: true,
            totalNet: true,
            createdAt: true,
          },
        },
        _count: {
          select: { runs: true, adjustments: true },
        },
      },
    });

    if (!period) {
      throw new NotFoundException(`Payroll period ${id} not found.`);
    }

    return period;
  }

  async update(organizationId: string, id: string, dto: UpdatePayrollPeriodDto, actorId?: string) {
    const existing = await this.findById(organizationId, id);

    if (existing.status === 'CLOSED') {
      throw new BadRequestException('Cannot modify a closed payroll period.');
    }

    const data: any = {};
    if (dto.cutoffDate !== undefined) {
      data.cutoffDate = dto.cutoffDate ? new Date(dto.cutoffDate) : null;
    }
    if (dto.payoutDate !== undefined) {
      data.payoutDate = dto.payoutDate ? new Date(dto.payoutDate) : null;
    }
    if (dto.processingDeadline !== undefined) {
      data.processingDeadline = dto.processingDeadline ? new Date(dto.processingDeadline) : null;
    }

    const updated = await this.prisma.payrollPeriod.update({
      where: { id },
      data,
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_PERIOD_UPDATED',
      entity: 'PayrollPeriod',
      entityId: id,
      metadata: {
        oldValues: {
          cutoffDate: existing.cutoffDate,
          payoutDate: existing.payoutDate,
          processingDeadline: existing.processingDeadline,
        },
        newValues: data,
      },
    });

    return updated;
  }

  async close(organizationId: string, id: string, actorId?: string) {
    const period = await this.findById(organizationId, id);

    if (period.status === 'CLOSED') {
      return period;
    }

    // Check for open/unfinalized runs
    const activeRuns = await this.prisma.payrollRun.findMany({
      where: {
        periodId: id,
        organizationId,
        status: {
          in: ['DRAFT', 'CALCULATING', 'REVIEW_PENDING', 'APPROVED'],
        },
      },
      select: { id: true, title: true, status: true },
    });

    if (activeRuns.length > 0) {
      throw new BadRequestException(
        `Cannot close payroll period: found ${activeRuns.length} unfinalized run(s) (e.g. ${activeRuns[0].title} in status ${activeRuns[0].status}). All runs must be LOCKED, PUBLISHED, or CANCELLED before closing.`,
      );
    }

    const closed = await this.prisma.payrollPeriod.update({
      where: { id },
      data: { status: 'CLOSED' },
    });

    await this.auditService.record({
      organizationId,
      userId: actorId,
      action: 'PAYROLL_PERIOD_CLOSED',
      entity: 'PayrollPeriod',
      entityId: id,
      metadata: { status: 'CLOSED' },
    });

    this.logger.log(`Closed payroll period ${id}`);
    return closed;
  }
}
