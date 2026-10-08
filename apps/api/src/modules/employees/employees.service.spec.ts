import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { BadRequestException } from '@nestjs/common';
import { EmploymentStatus, EmployeeHistoryEventType } from '@prisma/client';
import * as XLSX from 'xlsx';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: any;
  let audit: any;

  const mockOrgId = 'org-123';

  const mockAdminUser: AuthenticatedUser = {
    id: 'usr-admin',
    email: 'admin@peopleos.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP001',
    firstName: 'Vikram',
    lastName: 'Aditya',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE'],
    sessionId: 'ses-1',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'usr-mgr',
    email: 'manager@peopleos.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP003',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    status: 'ACTIVE',
    roles: ['MANAGER'],
    permissions: ['EMPLOYEE_VIEW'],
    sessionId: 'ses-2',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'usr-emp',
    email: 'employee@peopleos.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP004',
    firstName: 'Priya',
    lastName: 'Nair',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: ['EMPLOYEE_VIEW'],
    sessionId: 'ses-3',
  };

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeEmployment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeContact: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      emergencyContact: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      employeeHistory: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      branch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'br-1', organizationId: mockOrgId, name: 'BLR HQ' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'br-1', code: 'BLR-HQ', name: 'BLR HQ' }]),
      },
      department: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'dept-1', organizationId: mockOrgId, name: 'Engineering' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'dept-1', code: 'ENG', name: 'Engineering' }]),
      },
      designation: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'desig-1', organizationId: mockOrgId, title: 'Engineer' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'desig-1', code: 'SWE', title: 'Engineer' }]),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'usr-new' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 'role-emp', code: 'EMPLOYEE' }),
      },
      userRole: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  describe('Data Access Scoping', () => {
    it('should grant ADMIN organization-wide employee scope', async () => {
      const filter = await service.getScopedEmployeeFilter(mockAdminUser);
      expect(filter).toEqual({ organizationId: mockOrgId });
    });

    it('should restrict MANAGER to reporting subtree and self', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-mgr' });
      prisma.employeeEmployment.findMany
        .mockResolvedValueOnce([{ employeeId: 'emp-report-1' }])
        .mockResolvedValueOnce([]); // No indirect reports

      const filter: any = await service.getScopedEmployeeFilter(mockManagerUser);

      expect(filter.organizationId).toBe(mockOrgId);
      expect(filter.id.in).toContain('emp-mgr');
      expect(filter.id.in).toContain('emp-report-1');
    });

    it('should restrict EMPLOYEE to self profile only', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 'emp-self' });

      const filter: any = await service.getScopedEmployeeFilter(mockEmployeeUser);

      expect(filter.organizationId).toBe(mockOrgId);
      expect(filter.id).toBe('emp-self');
    });
  });

  describe('Manager Hierarchy & Validation', () => {
    it('should reject employee as their own manager', async () => {
      await expect(service.validateManagerHierarchy('emp-1', 'emp-1', mockOrgId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should detect and reject circular manager relationship (A -> B -> A)', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-mgr',
        organizationId: mockOrgId,
        isActive: true,
      });

      // Manager 'emp-mgr' reports to employee 'emp-target'
      prisma.employeeEmployment.findUnique.mockResolvedValue({
        managerId: 'emp-target',
      });

      await expect(
        service.validateManagerHierarchy('emp-target', 'emp-mgr', mockOrgId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Controlled Status Lifecycle', () => {
    it('should permit valid transition from PROBATION to ACTIVE', async () => {
      const mockEmp = {
        id: 'emp-1',
        status: EmploymentStatus.PROBATION,
        employment: { id: 'empl-1' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockEmp);

      const result = await service.transitionStatus(
        'emp-1',
        { status: EmploymentStatus.ACTIVE, reason: 'Probation cleared' },
        mockAdminUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-1' },
          data: expect.objectContaining({ status: EmploymentStatus.ACTIVE }),
        }),
      );
      expect(prisma.employeeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EmployeeHistoryEventType.STATUS_CHANGED,
            previousValue: EmploymentStatus.PROBATION,
            newValue: EmploymentStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should reject invalid transition from EXITED to ACTIVE', async () => {
      const mockExitedEmp = {
        id: 'emp-exited',
        status: EmploymentStatus.EXITED,
      };
      prisma.employee.findFirst.mockResolvedValue(mockExitedEmp);

      await expect(
        service.transitionStatus('emp-exited', { status: EmploymentStatus.ACTIVE }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('History Tracking on Changes', () => {
    it('should record DEPARTMENT_CHANGED history when department is updated', async () => {
      const existing = {
        id: 'emp-1',
        status: EmploymentStatus.ACTIVE,
        employment: {
          departmentId: 'dept-old',
          department: { name: 'Engineering' },
        },
      };
      prisma.employee.findFirst.mockResolvedValue(existing);
      prisma.department.findUnique.mockResolvedValue({
        id: 'dept-new',
        name: 'Data Engineering',
      });

      await service.update('emp-1', { departmentId: 'dept-new' }, mockAdminUser);

      expect(prisma.employeeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EmployeeHistoryEventType.DEPARTMENT_CHANGED,
            previousValue: 'Engineering',
            newValue: 'Data Engineering',
          }),
        }),
      );
    });
  });

  describe('Org Chart Hierarchy', () => {
    it('should construct hierarchical tree with direct reports count', async () => {
      const employees = [
        {
          id: 'leader-1',
          employeeCode: 'EMP001',
          displayName: 'Vikram Aditya',
          status: EmploymentStatus.ACTIVE,
          employment: {
            managerId: null,
            designation: { title: 'CTO' },
            department: { name: 'EXEC' },
          },
        },
        {
          id: 'report-1',
          employeeCode: 'EMP003',
          displayName: 'Rajesh Kumar',
          status: EmploymentStatus.ACTIVE,
          employment: {
            managerId: 'leader-1',
            designation: { title: 'EM' },
            department: { name: 'ENG' },
          },
        },
      ];

      prisma.employee.findMany.mockResolvedValue(employees);

      const tree = await service.getOrgChart({ organizationId: mockOrgId });

      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe('leader-1');
      expect(tree[0].directReportsCount).toBe(1);
      expect(tree[0].subordinates[0].id).toBe('report-1');
    });
  });

  describe('Bulk Import Validation', () => {
    it('should preview import and flag missing required fields and duplicates', async () => {
      const testData = [
        {
          'Employee Code': 'EMP999',
          'First Name': 'Rohan',
          'Last Name': 'Mehta',
          'Work Email': 'rohan@peopleos.local',
          'Department Code': 'ENG',
          'Designation Code': 'SWE',
          'Branch Code': 'BLR-HQ',
        },
        {
          'Employee Code': '', // Missing code
          'First Name': 'Invalid',
          'Last Name': 'Row',
          'Work Email': 'bad-email',
          'Department Code': 'NONEXISTENT',
          'Designation Code': 'SWE',
          'Branch Code': 'BLR-HQ',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(testData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Import');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      prisma.employee.findMany.mockResolvedValue([]);

      const preview = await service.previewImport(buffer, mockOrgId);

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.errorRowsCount).toBeGreaterThanOrEqual(1);
      expect(preview.errors.some((e) => e.field === 'employeeCode')).toBe(true);
      expect(preview.errors.some((e) => e.field === 'workEmail')).toBe(true);
    });
  });

  describe('Employee Directory Export', () => {
    it('should generate valid CSV export file', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          employeeCode: 'EMP001',
          displayName: 'Vikram Aditya',
          status: EmploymentStatus.ACTIVE,
          joiningDate: new Date('2022-01-01'),
          contact: { workEmail: 'admin@peopleos.local', phone: '123' },
          employment: {
            branch: { name: 'BLR' },
            department: { name: 'ENG' },
            designation: { title: 'CTO' },
          },
        },
      ]);

      const result = await service.exportEmployees(mockAdminUser, 'csv', {});

      expect(result.contentType).toBe('text/csv');
      expect(result.buffer).toBeInstanceOf(Buffer);
      const content = result.buffer.toString('utf-8');
      expect(content).toContain('EMP001');
      expect(content).toContain('Vikram Aditya');
    });
  });
});
