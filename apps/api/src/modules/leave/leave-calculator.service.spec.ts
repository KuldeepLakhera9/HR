import { Test, TestingModule } from '@nestjs/testing';
import { LeaveCalculatorService } from './leave-calculator.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { LeaveDurationType } from '@prisma/client';

describe('LeaveCalculatorService', () => {
  let service: LeaveCalculatorService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'emp-1',
          employment: { branchId: 'branch-1' },
        }),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          shift: { workDays: [1, 2, 3, 4, 5] }, // Mon to Fri
        }),
      },
      employeeLeavePolicyAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          leavePolicy: {
            countWeekendsAsLeave: false,
            countHolidaysAsLeave: false,
          },
        }),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveCalculatorService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LeaveCalculatorService>(LeaveCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('normalizeDateToUtc', () => {
    it('normalizes string date to UTC midnight', () => {
      const normalized = service.normalizeDateToUtc('2026-10-15');
      expect(normalized.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });

    it('throws BadRequestException for invalid date string', () => {
      expect(() => service.normalizeDateToUtc('not-a-date')).toThrow(BadRequestException);
    });
  });

  describe('calculateLeaveDays', () => {
    it('calculates standard 5 working days from Monday to Friday', async () => {
      // 2026-10-12 (Mon) to 2026-10-16 (Fri)
      const res = await service.calculateLeaveDays({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
        startDate: new Date('2026-10-12'),
        endDate: new Date('2026-10-16'),
        durationType: LeaveDurationType.FULL_DAY,
      });

      expect(res.totalCalendarDays).toBe(5);
      expect(res.chargeableDays).toBe(5);
      expect(res.weekendDays).toBe(0);
      expect(res.holidayDays).toBe(0);
    });

    it('excludes Saturday and Sunday by default when spanning across a weekend', async () => {
      // 2026-10-16 (Fri) to 2026-10-19 (Mon) -> 4 calendar days (Fri, Sat, Sun, Mon)
      const res = await service.calculateLeaveDays({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
        startDate: new Date('2026-10-16'),
        endDate: new Date('2026-10-19'),
        durationType: LeaveDurationType.FULL_DAY,
      });

      expect(res.totalCalendarDays).toBe(4);
      expect(res.chargeableDays).toBe(2); // Only Friday and Monday
      expect(res.weekendDays).toBe(2); // Saturday and Sunday
      expect(res.isSandwichApplied).toBe(false);
    });

    it('includes weekends when countWeekendsAsLeave is true in policy (Sandwich Rule)', async () => {
      prisma.employeeLeavePolicyAssignment.findFirst.mockResolvedValueOnce({
        leavePolicy: {
          countWeekendsAsLeave: true,
          countHolidaysAsLeave: false,
        },
      });

      // 2026-10-16 (Fri) to 2026-10-19 (Mon) -> 4 calendar days
      const res = await service.calculateLeaveDays({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
        startDate: new Date('2026-10-16'),
        endDate: new Date('2026-10-19'),
        durationType: LeaveDurationType.FULL_DAY,
      });

      expect(res.totalCalendarDays).toBe(4);
      expect(res.chargeableDays).toBe(4); // All 4 days charged
      expect(res.weekendDays).toBe(2);
      expect(res.isSandwichApplied).toBe(true);
    });

    it('excludes public gazetted holidays falling within the leave period by default', async () => {
      prisma.holiday.findMany.mockResolvedValueOnce([
        {
          id: 'h-1',
          name: 'Diwali',
          date: new Date('2026-10-20T00:00:00.000Z'),
        },
      ]);

      // 2026-10-19 (Mon) to 2026-10-21 (Wed) -> 3 days, but Tuesday is Diwali
      const res = await service.calculateLeaveDays({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
        startDate: new Date('2026-10-19'),
        endDate: new Date('2026-10-21'),
        durationType: LeaveDurationType.FULL_DAY,
      });

      expect(res.totalCalendarDays).toBe(3);
      expect(res.chargeableDays).toBe(2); // Mon and Wed charged; Tue holiday skipped
      expect(res.holidayDays).toBe(1);
      expect(res.holidaysEncountered).toEqual([{ name: 'Diwali', date: '2026-10-20' }]);
    });

    it('calculates 0.5 chargeable days for half-day leave on a working day', async () => {
      const res = await service.calculateLeaveDays({
        organizationId: 'org-1',
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
        startDate: new Date('2026-10-14'),
        endDate: new Date('2026-10-14'),
        durationType: LeaveDurationType.FIRST_HALF,
      });

      expect(res.totalCalendarDays).toBe(1);
      expect(res.chargeableDays).toBe(0.5);
    });

    it('rejects multi-day half-day application with BadRequestException', async () => {
      await expect(
        service.calculateLeaveDays({
          organizationId: 'org-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-1',
          startDate: new Date('2026-10-14'),
          endDate: new Date('2026-10-15'),
          durationType: LeaveDurationType.FIRST_HALF,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if endDate is before startDate', async () => {
      await expect(
        service.calculateLeaveDays({
          organizationId: 'org-1',
          employeeId: 'emp-1',
          leaveTypeId: 'lt-1',
          startDate: new Date('2026-10-20'),
          endDate: new Date('2026-10-15'),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
