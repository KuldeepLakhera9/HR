import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FormulaParserUtil } from '../utils/formula-parser.util';
import { SalaryComponentsService } from '../services/salary-components.service';
import { SalaryStructuresService } from '../services/salary-structures.service';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { Prisma } from '@prisma/client';

describe('Phase 11.2: Salary Components & Salary Structure Administration Tests', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'hr-admin@example.com',
    firstName: 'HR',
    lastName: 'Admin',
    employeeCode: 'EMP-001',
    status: 'ACTIVE' as any,
    sessionId: 'sess-1',
    roles: ['HR', 'ADMIN'],
    organizationId: 'org-test-1',
    permissions: ['PAYROLL_VIEW', 'PAYROLL_MANAGE'],
  };

  describe('1. FormulaParserUtil (Safe Zero-Eval Mathematical Engine)', () => {
    it('evaluates valid arithmetic formula using Prisma.Decimal without JS float errors', () => {
      const context = {
        BASIC: new Prisma.Decimal('50000.00'),
        GROSS: new Prisma.Decimal('100000.00'),
      };

      // 50% of Basic
      const res1 = FormulaParserUtil.evaluate('0.50 * BASIC', context);
      expect(res1.toFixed(2)).toBe('25000.00');

      // (GROSS - BASIC) * 0.2
      const res2 = FormulaParserUtil.evaluate('(GROSS - BASIC) * 0.2', context);
      expect(res2.toFixed(2)).toBe('10000.00');

      // Operator precedence: BASIC + 500 * 2 = 50000 + 1000 = 51000
      const res3 = FormulaParserUtil.evaluate('BASIC + 500 * 2', context);
      expect(res3.toFixed(2)).toBe('51000.00');
    });

    it('strictly rejects arbitrary code execution, SQL injection and dangerous tokens', () => {
      const dangerousFormulas = [
        'eval("alert(1)")',
        'process.exit(1)',
        'BASIC; DROP TABLE users;',
        'BASIC && window.location',
        'function() { return 1; }',
        '<script>alert(1)</script>',
        'BASIC = 100',
        'BASIC == 100',
        'BASIC % 10',
      ];

      for (const formula of dangerousFormulas) {
        expect(() => {
          FormulaParserUtil.validateAndExtractDependencies(formula);
        }).toThrow(BadRequestException);
      }
    });

    it('extracts correct unique component identifier dependencies', () => {
      const formula = '0.50 * BASIC + 0.10 * DA + 2000 - PF';
      const deps = FormulaParserUtil.validateAndExtractDependencies(formula);
      expect(deps).toEqual(['BASIC', 'DA', 'PF']);
    });

    it('detects circular dependencies in structure formula graphs and prevents infinite loops', () => {
      // Direct cycle: A depends on B, B depends on A
      const directCycle = new Map<string, string[]>([
        ['HRA', ['BASIC']],
        ['BASIC', ['HRA']],
      ]);

      expect(() => {
        FormulaParserUtil.detectCircularDependencies(directCycle);
      }).toThrow(BadRequestException);

      // Transitive cycle: A -> B -> C -> A
      const transitiveCycle = new Map<string, string[]>([
        ['COMP_A', ['COMP_B']],
        ['COMP_B', ['COMP_C']],
        ['COMP_C', ['COMP_A']],
      ]);

      expect(() => {
        FormulaParserUtil.detectCircularDependencies(transitiveCycle);
      }).toThrow(/Circular dependency detected.*COMP_A -> COMP_B -> COMP_C -> COMP_A/);

      // Acyclic DAG passes cleanly
      const validDag = new Map<string, string[]>([
        ['BASIC', []],
        ['HRA', ['BASIC']],
        ['DA', ['BASIC']],
        ['SPECIAL_ALLOWANCE', ['BASIC', 'HRA', 'DA']],
      ]);

      expect(() => {
        FormulaParserUtil.detectCircularDependencies(validDag);
      }).not.toThrow();
    });

    it('safely catches division by zero in formula calculations', () => {
      const context = {
        BASIC: new Prisma.Decimal('50000.00'),
        ZERO_VAR: new Prisma.Decimal('0'),
      };

      expect(() => {
        FormulaParserUtil.evaluate('BASIC / ZERO_VAR', context);
      }).toThrow(/Division by zero/);
    });
  });

  describe('2. SalaryComponentsService Unit Tests', () => {
    let service: SalaryComponentsService;
    let mockPrisma: any;
    let mockAudit: any;

    beforeEach(() => {
      mockPrisma = {
        salaryComponent: {
          findMany: jest.fn(),
          count: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        salaryStructureItem: {
          count: jest.fn(),
        },
      };

      mockAudit = {
        record: jest.fn().mockResolvedValue(undefined),
      };

      service = new SalaryComponentsService(mockPrisma as any, mockAudit as any);
    });

    it('creates a new salary component with code normalization', async () => {
      mockPrisma.salaryComponent.findUnique.mockResolvedValue(null);
      mockPrisma.salaryComponent.create.mockImplementation(({ data }: any) => ({
        id: 'comp-1',
        ...data,
      }));

      const res = await service.create(mockUser, {
        code: 'hra',
        name: 'House Rent Allowance',
        type: 'EARNING',
        calculationType: 'PERCENTAGE_OF_BASIC',
        isTaxable: true,
        isProRataApplicable: true,
      });

      expect(res.code).toBe('HRA');
      expect(mockPrisma.salaryComponent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'HRA',
            name: 'House Rent Allowance',
            type: 'EARNING',
          }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalled();
    });

    it('rejects duplicate component code in same organization', async () => {
      mockPrisma.salaryComponent.findUnique.mockResolvedValue({
        id: 'comp-existing',
        code: 'BASIC',
        deletedAt: null,
      });

      await expect(
        service.create(mockUser, {
          code: 'BASIC',
          name: 'Basic Pay',
          type: 'EARNING',
          calculationType: 'PERCENTAGE_OF_GROSS',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('requires formula expression when calculationType is FORMULA', async () => {
      mockPrisma.salaryComponent.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockUser, {
          code: 'SPECIAL',
          name: 'Special Allowance',
          type: 'EARNING',
          calculationType: 'FORMULA',
          formula: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents retiring component when in use by active salary structures', async () => {
      mockPrisma.salaryComponent.findFirst.mockResolvedValue({
        id: 'comp-basic',
        code: 'BASIC',
      });
      mockPrisma.salaryStructureItem.count.mockResolvedValue(3); // in 3 active structures

      await expect(service.retire(mockUser, 'comp-basic')).rejects.toThrow(
        /Cannot retire component 'BASIC' because it is in use by 3 active salary structure/,
      );
    });
  });

  describe('3. SalaryStructuresService & Calculation Preview Tests', () => {
    let service: SalaryStructuresService;
    let mockPrisma: any;
    let mockAudit: any;

    beforeEach(() => {
      mockPrisma = {
        salaryStructure: {
          findMany: jest.fn(),
          count: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        salaryStructureItem: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
        salaryComponent: {
          findMany: jest.fn(),
        },
        $transaction: jest.fn(async (callback) => callback(mockPrisma)),
      };

      mockAudit = {
        record: jest.fn().mockResolvedValue(undefined),
      };

      service = new SalaryStructuresService(mockPrisma as any, mockAudit as any);
    });

    it('creates a version 1 salary structure when components are valid and acyclic', async () => {
      mockPrisma.salaryStructure.findUnique.mockResolvedValue(null);
      mockPrisma.salaryComponent.findMany.mockResolvedValue([
        { id: 'c-basic', code: 'BASIC', type: 'EARNING' },
        { id: 'c-hra', code: 'HRA', type: 'EARNING' },
      ]);
      mockPrisma.salaryStructure.create.mockResolvedValue({
        id: 'struct-1',
        code: 'EXEC_2026',
        version: 1,
      });
      mockPrisma.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        code: 'EXEC_2026',
        name: 'Executive Structure',
        version: 1,
        currency: 'INR',
        isActive: true,
        items: [
          { componentId: 'c-basic', component: { type: 'EARNING', code: 'BASIC' } },
          { componentId: 'c-hra', component: { type: 'EARNING', code: 'HRA' } },
        ],
        _count: { compensations: 0 },
      });

      const res = await service.create(mockUser, {
        code: 'EXEC_2026',
        name: 'Executive Structure',
        items: [
          {
            componentId: 'c-basic',
            calculationType: 'PERCENTAGE_OF_GROSS',
            amountOrPercentage: 50,
          },
          {
            componentId: 'c-hra',
            calculationType: 'PERCENTAGE_OF_BASIC',
            amountOrPercentage: 50,
          },
        ],
      });

      expect(res.code).toBe('EXEC_2026');
      expect(res.version).toBe(1);
    });

    it('rejects structure creation if it has zero EARNING components', async () => {
      mockPrisma.salaryStructure.findUnique.mockResolvedValue(null);
      mockPrisma.salaryComponent.findMany.mockResolvedValue([
        { id: 'c-pf', code: 'PF', type: 'DEDUCTION' },
      ]);

      await expect(
        service.create(mockUser, {
          code: 'DEDUCTIONS_ONLY',
          name: 'Invalid Structure',
          items: [
            {
              componentId: 'c-pf',
              calculationType: 'PERCENTAGE_OF_BASIC',
              amountOrPercentage: 12,
            },
          ],
        }),
      ).rejects.toThrow(/Salary structure must include at least one EARNING component/);
    });

    it('prevents direct in-place mutation of a structure with assigned active employees', async () => {
      mockPrisma.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        code: 'LOCKED_STRUCT',
        version: 1,
        items: [],
        _count: { compensations: 15 }, // 15 active employees assigned!
      });

      await expect(
        service.update(mockUser, 'struct-1', {
          items: [{ componentId: 'c-1', calculationType: 'FLAT_AMOUNT', amountOrPercentage: 1000 }],
        }),
      ).rejects.toThrow(
        /Modifying components directly is prohibited to maintain historical integrity/,
      );
    });

    it('clones a structure to a new version (v+1) under the same code', async () => {
      mockPrisma.salaryStructure.findFirst
        .mockResolvedValueOnce({
          id: 'struct-v1',
          code: 'CORP_STD',
          name: 'Corporate Standard',
          version: 1,
          currency: 'INR',
          description: 'Original',
          items: [
            {
              componentId: 'c-1',
              calculationType: 'PERCENTAGE_OF_GROSS',
              amountOrPercentage: new Prisma.Decimal(50),
              formula: null,
              displayOrder: 0,
              component: { type: 'EARNING' },
            },
          ],
          _count: { compensations: 10 },
        })
        .mockResolvedValueOnce({
          version: 1, // highest version
        })
        .mockResolvedValueOnce({
          id: 'struct-v2',
          code: 'CORP_STD',
          version: 2,
          name: 'Corporate Standard (v2)',
          items: [],
          _count: { compensations: 0 },
        });

      mockPrisma.salaryStructure.create.mockResolvedValue({
        id: 'struct-v2',
        code: 'CORP_STD',
        version: 2,
      });

      const cloned = await service.clone(mockUser, 'struct-v1', {});
      expect(cloned.version).toBe(2);
      expect(cloned.code).toBe('CORP_STD');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SALARY_STRUCTURE_CLONE',
        }),
      );
    });

    it('simulates accurate preview calculation given a sample annual CTC', async () => {
      mockPrisma.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-sim',
        code: 'SIM_STD',
        name: 'Simulation Structure',
        version: 1,
        currency: 'INR',
        items: [
          {
            componentId: 'c-basic',
            calculationType: 'PERCENTAGE_OF_GROSS',
            amountOrPercentage: new Prisma.Decimal('50.00'),
            formula: null,
            component: { id: 'c-basic', code: 'BASIC', name: 'Basic Salary', type: 'EARNING' },
          },
          {
            componentId: 'c-hra',
            calculationType: 'PERCENTAGE_OF_BASIC',
            amountOrPercentage: new Prisma.Decimal('50.00'),
            formula: null,
            component: { id: 'c-hra', code: 'HRA', name: 'House Rent Allowance', type: 'EARNING' },
          },
          {
            componentId: 'c-pf',
            calculationType: 'PERCENTAGE_OF_BASIC',
            amountOrPercentage: new Prisma.Decimal('12.00'),
            formula: null,
            component: {
              id: 'c-pf',
              code: 'PF_EMPLOYEE',
              name: 'Provident Fund',
              type: 'DEDUCTION',
            },
          },
        ],
        _count: { compensations: 0 },
      });

      // Sample CTC: ₹1,200,000 / year => ₹100,000 / month gross
      const preview = await service.preview(mockUser, 'struct-sim', {
        annualCtc: 1200000,
      });

      expect(preview.monthlyGross).toBe('100000.00');

      // Earnings:
      // BASIC = 50% of 100,000 = 50,000.00
      // HRA = 50% of Basic = 25,000.00
      const basic = preview.breakdown.earnings.find((i) => i.code === 'BASIC');
      const hra = preview.breakdown.earnings.find((i) => i.code === 'HRA');
      expect(basic?.monthlyAmount).toBe('50000.00');
      expect(hra?.monthlyAmount).toBe('25000.00');
      expect(preview.summary.totalEarningsMonthly).toBe('75000.00');

      // Deductions:
      // PF = 12% of Basic = 12% of 50,000 = 6,000.00
      const pf = preview.breakdown.deductions.find((i) => i.code === 'PF_EMPLOYEE');
      expect(pf?.monthlyAmount).toBe('6000.00');
      expect(preview.summary.totalDeductionsMonthly).toBe('6000.00');

      // Net Take Home:
      // Total Earnings (75,000) - Total Deductions (6,000) = 69,000.00
      expect(preview.summary.estimatedNetTakeHomeMonthly).toBe('69000.00');
      expect(preview.summary.estimatedNetTakeHomeAnnual).toBe('828000.00');
    });

    it('rejects structure creation if effectiveTo date precedes effectiveFrom date', async () => {
      await expect(
        service.create(mockUser, {
          name: 'Invalid Dates Structure',
          code: 'INVALID_DATES',
          effectiveFrom: new Date('2026-12-31').toISOString(),
          effectiveTo: new Date('2026-01-01').toISOString(),
          items: [
            {
              componentId: 'comp-basic-id',
              calculationType: 'FLAT_AMOUNT',
              amountOrPercentage: 50000,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('retires an active structure and audits the state transition', async () => {
      mockPrisma.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-to-retire',
        code: 'CORP_OLD',
        name: 'Old Structure',
        version: 1,
        currency: 'INR',
        isActive: true,
        items: [],
        _count: { compensations: 0 },
      });

      mockPrisma.salaryStructure.update.mockResolvedValue({
        id: 'struct-to-retire',
        isActive: false,
      });

      const retired = await service.retire(mockUser, 'struct-to-retire');
      expect(retired.structure.isActive).toBe(false);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SALARY_STRUCTURE_RETIRE',
          entity: 'SalaryStructure',
        }),
      );
    });
  });

  describe('4. Component Rounding & Precision Rules', () => {
    it('applies HALF_UP rounding rule correctly', () => {
      const val1 = FormulaParserUtil.round(new Prisma.Decimal('100.125'), 'HALF_UP', 2);
      expect(val1.toFixed(2)).toBe('100.13');

      const val2 = FormulaParserUtil.round(new Prisma.Decimal('100.124'), 'HALF_UP', 2);
      expect(val2.toFixed(2)).toBe('100.12');
    });

    it('applies UP and DOWN rounding rules correctly', () => {
      const valUp = FormulaParserUtil.round(new Prisma.Decimal('100.121'), 'UP', 2);
      expect(valUp.toFixed(2)).toBe('100.13');

      const valDown = FormulaParserUtil.round(new Prisma.Decimal('100.129'), 'DOWN', 2);
      expect(valDown.toFixed(2)).toBe('100.12');
    });

    it('applies NEAREST_INTEGER rounding rule correctly', () => {
      const val1 = FormulaParserUtil.round(new Prisma.Decimal('100.49'), 'NEAREST_INTEGER', 0);
      expect(val1.toFixed(0)).toBe('100');

      const val2 = FormulaParserUtil.round(new Prisma.Decimal('100.50'), 'NEAREST_INTEGER', 0);
      expect(val2.toFixed(0)).toBe('101');
    });
  });
});
