import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  EmploymentStatus,
  EmployeeHistoryEventType,
  ProfileChangeRequestStatus,
} from '@prisma/client';
import { ProfileChangeReviewDecision } from './dto/profile-change-request.dto';
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
    permissions: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'EMPLOYEE_HISTORY_VIEW',
      'EMPLOYEE_EXPORT',
    ],
    sessionId: 'ses-1',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'usr-hr',
    email: 'hr@peopleos.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP002',
    firstName: 'Ananya',
    lastName: 'Sharma',
    status: 'ACTIVE',
    roles: ['HR'],
    permissions: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'EMPLOYEE_HISTORY_VIEW',
      'EMPLOYEE_EXPORT',
    ],
    sessionId: 'ses-hr',
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
        findUnique: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.id) {
            return Promise.resolve({
              id: args.where.id,
              organizationId: mockOrgId,
              isActive: true,
              displayName: 'Mock Employee',
            });
          }
          return Promise.resolve(null);
        }),
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
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      emergencyContact: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      profileChangeRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
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
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      shiftAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      leaveBalanceAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      wfhRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      officialVisit: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceCorrectionRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      employeeDocumentMetadata: {
        findMany: jest.fn().mockResolvedValue([]),
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

    it('should detect and reject multi-tier circular manager relationship (A -> B -> C -> A)', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-c',
        organizationId: mockOrgId,
        isActive: true,
      });

      // Chain: C -> B -> A
      prisma.employeeEmployment.findUnique
        .mockResolvedValueOnce({ managerId: 'emp-b' }) // C reports to B
        .mockResolvedValueOnce({ managerId: 'emp-target' }); // B reports to A (target)

      await expect(
        service.validateManagerHierarchy('emp-target', 'emp-c', mockOrgId),
      ).rejects.toThrow('Circular manager relationship detected');
    });

    it('should reject manager from a different organization', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-other-org',
        organizationId: 'other-org-999',
        isActive: true,
      });

      await expect(
        service.validateManagerHierarchy('emp-target', 'emp-other-org', mockOrgId),
      ).rejects.toThrow('Assigned manager does not exist in this organization');
    });

    it('should reject inactive employee as manager', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-inactive',
        organizationId: mockOrgId,
        isActive: false,
      });

      await expect(
        service.validateManagerHierarchy('emp-target', 'emp-inactive', mockOrgId),
      ).rejects.toThrow('Cannot assign an inactive employee as manager');
    });
  });

  describe('Uniqueness and Data Constraints', () => {
    it('should reject duplicate employee code with ConflictException', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'existing-emp',
        employeeCode: 'EMP001',
      });

      await expect(
        service.create(
          {
            employeeCode: 'EMP001',
            firstName: 'Aarav',
            lastName: 'Sharma',
            workEmail: 'aarav@peopleos.local',
            branchId: 'br-1',
            departmentId: 'dept-1',
            designationId: 'desig-1',
          } as any,
          mockAdminUser,
        ),
      ).rejects.toThrow("Employee code 'EMP001' already exists");
    });

    it('should reject duplicate work email with ConflictException', async () => {
      prisma.employee.findUnique.mockResolvedValue(null); // Code is unique
      prisma.employeeContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        workEmail: 'existing@peopleos.local',
      });

      await expect(
        service.create(
          {
            employeeCode: 'EMP002',
            firstName: 'Rohan',
            lastName: 'Verma',
            workEmail: 'existing@peopleos.local',
            branchId: 'br-1',
            departmentId: 'dept-1',
            designationId: 'desig-1',
          } as any,
          mockAdminUser,
        ),
      ).rejects.toThrow("Work email 'existing@peopleos.local' is already registered");
    });
  });

  describe('Controlled Status Lifecycle', () => {
    it('should permit valid transition from PROBATION to ACTIVE and execute all 4 lifecycle requirements', async () => {
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

      // Requirement 2: Update employee and employment status
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-1' },
          data: expect.objectContaining({ status: EmploymentStatus.ACTIVE }),
        }),
      );
      expect(prisma.employeeEmployment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-1' },
          data: expect.objectContaining({ employmentStatus: EmploymentStatus.ACTIVE }),
        }),
      );

      // Requirement 3: Create EmployeeHistory
      expect(prisma.employeeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EmployeeHistoryEventType.STATUS_CHANGED,
            previousValue: EmploymentStatus.PROBATION,
            newValue: EmploymentStatus.ACTIVE,
            performedById: mockAdminUser.id,
            metadata: expect.objectContaining({ reason: 'Probation cleared' }),
          }),
        }),
      );

      // Requirement 4: Create AuditLog
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_STATUS_CHANGED',
          entity: 'Employee',
          entityId: 'emp-1',
          userId: mockAdminUser.id,
          organizationId: mockOrgId,
          metadata: expect.objectContaining({
            from: EmploymentStatus.PROBATION,
            to: EmploymentStatus.ACTIVE,
            reason: 'Probation cleared',
          }),
        }),
      );
    });

    it('should permit valid transition from ACTIVE to ON_NOTICE', async () => {
      const mockActiveEmp = {
        id: 'emp-2',
        status: EmploymentStatus.ACTIVE,
        employment: { id: 'empl-2' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockActiveEmp);

      const result = await service.transitionStatus(
        'emp-2',
        { status: EmploymentStatus.ON_NOTICE, reason: 'Resignation tendered' },
        mockAdminUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-2' },
          data: expect.objectContaining({ status: EmploymentStatus.ON_NOTICE }),
        }),
      );
    });

    it('should permit valid transition from ON_NOTICE to EXITED and deactivate user account', async () => {
      const mockNoticeEmp = {
        id: 'emp-3',
        userId: 'usr-3',
        status: EmploymentStatus.ON_NOTICE,
        employment: { id: 'empl-3' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockNoticeEmp);

      const result = await service.transitionStatus(
        'emp-3',
        { status: EmploymentStatus.EXITED, reason: 'Notice period served' },
        mockAdminUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-3' },
          data: expect.objectContaining({ status: EmploymentStatus.EXITED, isActive: false }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-3' },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('should permit valid transition from ACTIVE to TERMINATED', async () => {
      const mockActiveEmp = {
        id: 'emp-4',
        status: EmploymentStatus.ACTIVE,
        employment: { id: 'empl-4' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockActiveEmp);

      const result = await service.transitionStatus(
        'emp-4',
        { status: EmploymentStatus.TERMINATED, reason: 'Policy violation' },
        mockAdminUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-4' },
          data: expect.objectContaining({ status: EmploymentStatus.TERMINATED }),
        }),
      );
    });

    it('should permit valid transition from ON_NOTICE back to ACTIVE (resignation withdrawal)', async () => {
      const mockNoticeEmp = {
        id: 'emp-5',
        status: EmploymentStatus.ON_NOTICE,
        employment: { id: 'empl-5' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockNoticeEmp);

      const result = await service.transitionStatus(
        'emp-5',
        { status: EmploymentStatus.ACTIVE, reason: 'Resignation withdrawn' },
        mockAdminUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-5' },
          data: expect.objectContaining({ status: EmploymentStatus.ACTIVE }),
        }),
      );
    });

    it('should return immediately without changes when target status equals current status (no-op)', async () => {
      const mockEmp = {
        id: 'emp-noop',
        status: EmploymentStatus.ACTIVE,
        employment: { id: 'empl-noop' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockEmp);

      const result = await service.transitionStatus(
        'emp-noop',
        { status: EmploymentStatus.ACTIVE },
        mockAdminUser,
      );

      expect(result).toEqual(mockEmp);
      expect(prisma.employee.update).not.toHaveBeenCalled();
      expect(prisma.employeeHistory.create).not.toHaveBeenCalled();
    });

    it('should reject invalid transitions: EXITED -> ACTIVE (terminal state)', async () => {
      const mockExitedEmp = {
        id: 'emp-exited',
        status: EmploymentStatus.EXITED,
      };
      prisma.employee.findFirst.mockResolvedValue(mockExitedEmp);

      await expect(
        service.transitionStatus('emp-exited', { status: EmploymentStatus.ACTIVE }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid transitions: PROBATION -> EXITED (skipping lifecycle)', async () => {
      const mockProbationEmp = {
        id: 'emp-prob',
        status: EmploymentStatus.PROBATION,
      };
      prisma.employee.findFirst.mockResolvedValue(mockProbationEmp);

      await expect(
        service.transitionStatus('emp-prob', { status: EmploymentStatus.EXITED }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid transitions: ACTIVE -> PROBATION (backward transition)', async () => {
      const mockActiveEmp = {
        id: 'emp-act',
        status: EmploymentStatus.ACTIVE,
      };
      prisma.employee.findFirst.mockResolvedValue(mockActiveEmp);

      await expect(
        service.transitionStatus('emp-act', { status: EmploymentStatus.PROBATION }, mockAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid transitions: TERMINATED -> ACTIVE', async () => {
      const mockTerminatedEmp = {
        id: 'emp-term',
        status: EmploymentStatus.TERMINATED,
      };
      prisma.employee.findFirst.mockResolvedValue(mockTerminatedEmp);

      await expect(
        service.transitionStatus('emp-term', { status: EmploymentStatus.ACTIVE }, mockAdminUser),
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

    it('should validate CSV buffers and detect manager self-assignment, invalid status, and invalid employmentType', async () => {
      const csvData = [
        'employeeCode,firstName,lastName,workEmail,departmentCode,designationCode,branchCode,managerEmployeeCode,employmentType,status',
        'EMP001,Aarav,Patel,aarav@peopleos.local,ENG,SWE,BLR-HQ,EMP001,INVALID_TYPE,INVALID_STATUS',
        'EMP002,Priya,Nair,priya@peopleos.local,ENG,SWE,BLR-HQ,NONEXISTENT_MGR,FULL_TIME,ACTIVE',
      ].join('\n');

      const buffer = Buffer.from(csvData, 'utf-8');

      prisma.employee.findMany.mockResolvedValue([]);

      const preview = await service.previewImport(buffer, mockOrgId);

      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(0);
      expect(preview.errorRowsCount).toBeGreaterThanOrEqual(3);

      // Verify row-level error types
      expect(
        preview.errors.some(
          (e) => e.field === 'managerEmployeeCode' && e.message.includes('own reporting manager'),
        ),
      ).toBe(true);
      expect(
        preview.errors.some(
          (e) => e.field === 'employmentType' && e.message.includes('Invalid employment type'),
        ),
      ).toBe(true);
      expect(
        preview.errors.some(
          (e) => e.field === 'employmentStatus' && e.message.includes('Invalid status'),
        ),
      ).toBe(true);
      expect(
        preview.errors.some(
          (e) => e.field === 'managerEmployeeCode' && e.message.includes('not found in database'),
        ),
      ).toBe(true);
    });

    it('should throw BadRequestException when uploaded file is empty', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, 'Empty');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      await expect(service.previewImport(buffer, mockOrgId)).rejects.toThrow(BadRequestException);
    });

    it('should execute confirmImport within database transaction and return full import summary', async () => {
      const validatedRows = [
        {
          rowNumber: 2,
          employeeCode: 'EMP101',
          firstName: 'Ananya',
          lastName: 'Sen',
          displayName: 'Ananya Sen',
          workEmail: 'ananya@peopleos.local',
          phone: '+91-9999999999',
          departmentId: 'dept-eng',
          designationId: 'desig-swe',
          branchId: 'branch-blr',
          managerEmployeeCode: null,
          employmentType: 'FULL_TIME',
          employmentStatus: 'ACTIVE',
          workMode: 'OFFICE',
          joiningDate: '2026-01-01',
        },
      ];

      prisma.employee.findMany.mockResolvedValue([]);
      prisma.user.create.mockResolvedValue({ id: 'user-101' });
      prisma.role.findFirst.mockResolvedValue({ id: 'role-emp' });
      prisma.userRole.create.mockResolvedValue({ id: 'ur-101' });
      prisma.employee.create.mockResolvedValue({
        id: 'emp-101',
        employeeCode: 'EMP101',
        status: 'ACTIVE',
      });
      prisma.employeeEmployment.create.mockResolvedValue({ id: 'ee-101' });
      prisma.employeeContact.create.mockResolvedValue({ id: 'ec-101' });
      prisma.employeeHistory.create.mockResolvedValue({ id: 'eh-101' });

      const result = await service.confirmImport(validatedRows, mockAdminUser);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(result.totalRows).toBe(1);
      expect(result.validRowsCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_IMPORTED',
          metadata: { count: 1 },
        }),
      );
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
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_EXPORTED',
          metadata: expect.objectContaining({
            format: 'csv',
            recordCount: 1,
          }),
        }),
      );
    });

    it('should generate valid Excel (.xlsx) export file and record audit log', async () => {
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

      const result = await service.exportEmployees(mockAdminUser, 'xlsx', {});

      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.filename).toMatch(/\.xlsx$/);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_EXPORTED',
          metadata: expect.objectContaining({
            format: 'xlsx',
            recordCount: 1,
          }),
        }),
      );
    });

    it('should omit sensitive fields (phone) when exported by unauthorized user for other employees', async () => {
      prisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-other',
          employeeCode: 'EMP999', // not mockEmployeeUser's code (EMP004)
          displayName: 'Other Colleague',
          status: EmploymentStatus.ACTIVE,
          joiningDate: new Date('2023-01-01'),
          contact: { workEmail: 'other@peopleos.local', phone: '+91-9988776655' },
          employment: {
            branch: { name: 'HQ' },
            department: { name: 'Design' },
            designation: { title: 'Designer' },
          },
        },
      ]);

      const result = await service.exportEmployees(mockEmployeeUser, 'csv', {});
      const content = result.buffer.toString('utf-8');

      // Employee code and name should be present
      expect(content).toContain('EMP999');
      // Phone header or personal phone number should NOT be exported
      expect(content).not.toContain('+91-9988776655');
    });
  });

  describe('Role Authorization & Scoped Access Control', () => {
    it('should allow Admin and HR to create employees, but block Manager and Employee with ForbiddenException', async () => {
      // Manager attempts creation
      await expect(
        service.create(
          {
            employeeCode: 'EMP100',
            firstName: 'Test',
            lastName: 'User',
            workEmail: 'test@peopleos.local',
            branchId: 'br-1',
            departmentId: 'dept-1',
            designationId: 'desig-1',
          } as any,
          mockManagerUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Employee attempts creation
      await expect(
        service.create(
          {
            employeeCode: 'EMP101',
            firstName: 'Test',
            lastName: 'User',
            workEmail: 'test2@peopleos.local',
            branchId: 'br-1',
            departmentId: 'dept-1',
            designationId: 'desig-1',
          } as any,
          mockEmployeeUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create employee inside a transaction with all normalized records', async () => {
      prisma.employee.findUnique.mockImplementation((args: any) => {
        if (args?.where?.id) {
          return Promise.resolve({
            id: args.where.id,
            organizationId: mockOrgId,
            displayName: 'Aarav Sharma',
          });
        }
        return Promise.resolve(null);
      });
      prisma.employeeContact.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue({
        id: 'new-emp-id',
        employeeCode: 'EMP200',
        displayName: 'Aarav Sharma',
        status: EmploymentStatus.PROBATION,
      });

      prisma.employee.findFirst.mockResolvedValue({
        id: 'new-emp-id',
        employeeCode: 'EMP200',
        displayName: 'Aarav Sharma',
        status: EmploymentStatus.PROBATION,
      });

      const result = await service.create(
        {
          employeeCode: 'EMP200',
          firstName: 'Aarav',
          lastName: 'Sharma',
          workEmail: 'aarav@peopleos.local',
          branchId: 'br-1',
          departmentId: 'dept-1',
          designationId: 'desig-1',
          createLoginAccount: false,
        } as any,
        mockAdminUser,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.employee.create).toHaveBeenCalled();
      expect(prisma.employeeEmployment.create).toHaveBeenCalled();
      expect(prisma.employeeContact.create).toHaveBeenCalled();
      expect(prisma.employeeHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EmployeeHistoryEventType.JOINED,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should allow Employee to update permitted personal contact info', async () => {
      const mockEmp = {
        id: 'emp-self',
        userId: mockEmployeeUser.id,
        employeeCode: mockEmployeeUser.employeeCode,
        employment: { id: 'empl-1' },
        contact: { id: 'cont-1' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockEmp);
      prisma.employee.update.mockResolvedValue(mockEmp);

      const result = await service.update(
        'emp-self',
        {
          firstName: 'Priya',
          phone: '+91 99999 88888',
          personalEmail: 'priya.personal@gmail.com',
        } as any,
        mockEmployeeUser,
      );

      expect(result).toBeDefined();
      expect(prisma.employeeContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '+91 99999 88888' }),
        }),
      );
    });

    it('should block Employee from modifying organizational assignments with ForbiddenException', async () => {
      const mockEmp = {
        id: 'emp-self',
        userId: mockEmployeeUser.id,
        employeeCode: mockEmployeeUser.employeeCode,
        employment: { id: 'empl-1', departmentId: 'dept-1' },
        contact: { id: 'cont-1' },
      };
      prisma.employee.findFirst.mockResolvedValue(mockEmp);

      await expect(
        service.update(
          'emp-self',
          {
            departmentId: 'dept-2', // Unauthorized org change
          } as any,
          mockEmployeeUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block non-Admin/HR from transitioning employee status with ForbiddenException', async () => {
      await expect(
        service.transitionStatus('emp-1', { status: EmploymentStatus.ACTIVE }, mockEmployeeUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.transitionStatus('emp-1', { status: EmploymentStatus.ACTIVE }, mockManagerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block non-Admin/HR from deactivating employees with ForbiddenException', async () => {
      await expect(service.deactivate('emp-1', mockEmployeeUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.deactivate('emp-1', mockManagerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Data-Scope Security Implementation & IDOR Review (Phase 3 - Step 15)', () => {
    const empSelfId = 'emp-self';
    const empColleagueBId = 'emp-colleague-b';
    const empManagerId = 'emp-mgr';
    const empSubordinateId = 'emp-subordinate';
    const empOutsideTeamId = 'emp-outside-team';
    const empOtherOrgId = 'emp-other-org';

    beforeEach(() => {
      // Mock findUnique for existence in org
      prisma.employee.findUnique.mockImplementation((args: any) => {
        const id = args?.where?.id;
        if (id === empOtherOrgId) {
          return Promise.resolve({ id, organizationId: 'other-org-999', isActive: true });
        }
        if (
          [
            empSelfId,
            empColleagueBId,
            empManagerId,
            empSubordinateId,
            empOutsideTeamId,
            'emp-1',
          ].includes(id)
        ) {
          return Promise.resolve({
            id,
            organizationId: mockOrgId,
            isActive: true,
            displayName: `Employee ${id}`,
          });
        }
        return Promise.resolve(null);
      });
    });

    describe('ADMIN & HR Scope Verification', () => {
      it('ADMIN can access any employee in organization', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: empOutsideTeamId,
          organizationId: mockOrgId,
        });
        const result = await service.findOne(empOutsideTeamId, mockAdminUser);
        expect(result).toBeDefined();
        expect(result.id).toBe(empOutsideTeamId);
      });

      it('HR can access any employee in organization', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: empOutsideTeamId,
          organizationId: mockOrgId,
        });
        const result = await service.findOne(empOutsideTeamId, mockHrUser);
        expect(result).toBeDefined();
        expect(result.id).toBe(empOutsideTeamId);
      });

      it('ADMIN cannot access employee from another organization (throws NotFoundException)', async () => {
        await expect(service.findOne(empOtherOrgId, mockAdminUser)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('HR cannot access employee from another organization (throws NotFoundException)', async () => {
        await expect(service.findOne(empOtherOrgId, mockHrUser)).rejects.toThrow(NotFoundException);
      });
    });

    describe('MANAGER Scope & IDOR Protection', () => {
      beforeEach(() => {
        prisma.employee.findFirst.mockImplementation((args: any) => {
          if (args?.where?.OR) {
            return Promise.resolve({ id: empManagerId });
          }
          const andConditions = args?.where?.AND || [];
          const idCondition = andConditions.find((c: any) => c.id)?.id;

          if (idCondition === empOutsideTeamId) {
            return Promise.resolve(null);
          }
          if (idCondition === empSubordinateId || idCondition === empManagerId) {
            return Promise.resolve({ id: idCondition, organizationId: mockOrgId });
          }
          return Promise.resolve(null);
        });

        prisma.employeeEmployment.findMany
          .mockResolvedValueOnce([{ employeeId: empSubordinateId }])
          .mockResolvedValueOnce([]);
      });

      it('MANAGER can view direct report within team', async () => {
        const result = await service.findOne(empSubordinateId, mockManagerUser);
        expect(result).toBeDefined();
        expect(result.id).toBe(empSubordinateId);
      });

      it('MANAGER accessing EmployeeOutsideTeam (GET /employees/EmployeeOutsideTeam) fails with ForbiddenException', async () => {
        await expect(service.findOne(empOutsideTeamId, mockManagerUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('MANAGER querying organization-wide list receives only self and team subordinates', async () => {
        prisma.employee.findFirst.mockResolvedValue({ id: empManagerId });
        prisma.employeeEmployment.findMany
          .mockResolvedValueOnce([{ employeeId: empSubordinateId }])
          .mockResolvedValueOnce([]);

        prisma.employee.findMany.mockResolvedValue([
          { id: empManagerId, displayName: 'Manager Rajesh', joiningDate: new Date() },
          { id: empSubordinateId, displayName: 'Subordinate Priya', joiningDate: new Date() },
        ]);

        const result = await service.findAll(mockManagerUser, {});

        expect(prisma.employee.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              AND: expect.arrayContaining([
                expect.objectContaining({
                  id: { in: [empManagerId, empSubordinateId] },
                }),
              ]),
            }),
          }),
        );
        expect(result.items.length).toBe(2);
      });

      it('MANAGER tampering URL to get manager of employee outside team fails with ForbiddenException', async () => {
        await expect(service.getManager(empOutsideTeamId, mockManagerUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('MANAGER tampering URL to get direct reports of employee outside team fails with ForbiddenException', async () => {
        await expect(service.getDirectReports(empOutsideTeamId, mockManagerUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('MANAGER tampering URL to get team hierarchy of employee outside team fails with ForbiddenException', async () => {
        await expect(service.getTeam(empOutsideTeamId, mockManagerUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('MANAGER tampering URL to get history of employee outside team fails with ForbiddenException', async () => {
        await expect(service.getHistory(empOutsideTeamId, mockManagerUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('MANAGER tampering URL to update employee outside team fails with ForbiddenException', async () => {
        await expect(
          service.update(empOutsideTeamId, { phone: '123' }, mockManagerUser),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('EMPLOYEE Scope & IDOR Protection', () => {
      beforeEach(() => {
        prisma.employee.findFirst.mockImplementation((args: any) => {
          if (args?.where?.OR) {
            return Promise.resolve({ id: empSelfId });
          }
          const andConditions = args?.where?.AND || [];
          const idCondition = andConditions.find((c: any) => c.id)?.id;
          if (idCondition === empColleagueBId) {
            return Promise.resolve(null);
          }
          if (idCondition === empSelfId) {
            return Promise.resolve({ id: empSelfId, organizationId: mockOrgId });
          }
          return Promise.resolve(null);
        });
      });

      it('EMPLOYEE accessing own profile succeeds', async () => {
        const result = await service.findOne(empSelfId, mockEmployeeUser);
        expect(result).toBeDefined();
        expect(result.id).toBe(empSelfId);
      });

      it('EMPLOYEE accessing Colleague B (GET /employees/B) fails with ForbiddenException', async () => {
        await expect(service.findOne(empColleagueBId, mockEmployeeUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('EMPLOYEE querying directory receives only self', async () => {
        prisma.employee.findFirst.mockResolvedValue({ id: empSelfId });
        prisma.employee.findMany.mockResolvedValue([
          { id: empSelfId, displayName: 'Priya Nair', joiningDate: new Date() },
        ]);

        const result = await service.findAll(mockEmployeeUser, {});

        expect(prisma.employee.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              AND: expect.arrayContaining([expect.objectContaining({ id: empSelfId })]),
            }),
          }),
        );
        expect(result.items.length).toBe(1);
      });

      it('EMPLOYEE tampering URL to view Colleague B history fails with ForbiddenException', async () => {
        await expect(service.getHistory(empColleagueBId, mockEmployeeUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('EMPLOYEE tampering URL to view Colleague B manager fails with ForbiddenException', async () => {
        await expect(service.getManager(empColleagueBId, mockEmployeeUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('EMPLOYEE tampering URL to view Colleague B direct reports fails with ForbiddenException', async () => {
        await expect(service.getDirectReports(empColleagueBId, mockEmployeeUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('EMPLOYEE tampering URL to view Colleague B team fails with ForbiddenException', async () => {
        await expect(service.getTeam(empColleagueBId, mockEmployeeUser)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('EMPLOYEE tampering URL to modify Colleague B (PATCH /employees/B) fails with ForbiddenException', async () => {
        await expect(
          service.update(empColleagueBId, { phone: '123' }, mockEmployeeUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('EMPLOYEE accessing non-existent or other org employee (GET /employees/OtherOrg) fails with NotFoundException', async () => {
        await expect(service.findOne(empOtherOrgId, mockEmployeeUser)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('Org Chart Scope Isolation', () => {
      it('rejects rootEmployeeId from another organization with NotFoundException', async () => {
        prisma.employee.findMany.mockResolvedValue([
          {
            id: 'emp-internal',
            employeeCode: 'EMP001',
            displayName: 'Internal Org Emp',
            organizationId: mockOrgId,
            isActive: true,
            joiningDate: new Date(),
          },
        ]);

        await expect(
          service.getOrgChart({
            organizationId: mockOrgId,
            rootEmployeeId: 'foreign-emp-999',
          }),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Employee Self-Service (ESS) Home Dashboard', () => {
      const mockFullEmployee = {
        id: 'emp-priya',
        userId: mockEmployeeUser.id,
        organizationId: mockOrgId,
        employeeCode: 'EMP004',
        firstName: 'Priya',
        lastName: 'Nair',
        displayName: 'Priya Nair',
        profilePhoto: null,
        status: EmploymentStatus.ACTIVE,
        joiningDate: new Date('2024-01-15T00:00:00.000Z'),
        employment: {
          workMode: 'OFFICE',
          branch: { id: 'br-1', name: 'Bengaluru HQ' },
          department: { id: 'dept-1', name: 'Engineering & Technology' },
          designation: { id: 'desig-1', name: 'Senior Software Engineer' },
          manager: {
            id: 'emp-mgr',
            displayName: 'Rajesh Kumar',
            employeeCode: 'EMP003',
            profilePhoto: null,
          },
        },
        contact: {
          workEmail: 'priya.nair@peopleos.local',
          phone: '+91 98765 43210',
        },
      };

      it('should return aggregated home dashboard with live attendance, leave balances, pending requests, and upcoming absences for authenticated employee', async () => {
        prisma.employee.findFirst.mockResolvedValue(mockFullEmployee);

        // Attendance active session
        prisma.attendanceSession.findFirst
          .mockResolvedValueOnce({
            id: 'sess-active',
            employeeId: 'emp-priya',
            status: 'OPEN',
            attendanceMode: 'OFFICE',
            checkInTime: new Date(Date.now() - 3 * 3600 * 1000), // 3 hours ago
            checkOutTime: null,
            totalBreakMinutes: 15,
            events: [],
          })
          .mockResolvedValueOnce(null); // No completed session

        prisma.shiftAssignment.findFirst.mockResolvedValue({
          shift: {
            name: 'General Shift',
            startTime: '09:00',
            endTime: '18:00',
          },
        });

        // Leave balances
        prisma.leaveBalanceAccount.findMany.mockResolvedValue([
          {
            id: 'bal-cl',
            leaveTypeId: 'lt-cl',
            closingBalance: 8,
            allocatedBalance: 12,
            usedBalance: 4,
            pendingBalance: 1,
            leaveType: { code: 'CL', name: 'Casual Leave' },
          },
          {
            id: 'bal-sl',
            leaveTypeId: 'lt-sl',
            closingBalance: 10,
            allocatedBalance: 10,
            usedBalance: 0,
            pendingBalance: 0,
            leaveType: { code: 'SL', name: 'Sick Leave' },
          },
          {
            id: 'bal-pl',
            leaveTypeId: 'lt-pl',
            closingBalance: 14,
            allocatedBalance: 18,
            usedBalance: 4,
            pendingBalance: 0,
            leaveType: { code: 'PL', name: 'Privilege Leave' },
          },
        ]);

        // Pending requests
        prisma.leaveRequest.findMany
          .mockResolvedValueOnce([
            {
              id: 'lr-pending',
              status: 'SUBMITTED',
              chargeableDays: 2,
              startDate: new Date('2026-11-01'),
              endDate: new Date('2026-11-02'),
              createdAt: new Date(),
              leaveType: { name: 'Casual Leave' },
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'lr-approved',
              status: 'APPROVED',
              chargeableDays: 3,
              startDate: new Date('2026-10-25'),
              endDate: new Date('2026-10-27'),
              leaveType: { name: 'Casual Leave' },
            },
          ]);

        prisma.wfhRequest.findMany
          .mockResolvedValueOnce([
            {
              id: 'wfh-pending',
              status: 'SUBMITTED',
              startDate: new Date('2026-11-05'),
              endDate: new Date('2026-11-05'),
              createdAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([]);

        prisma.officialVisit.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([
          {
            id: 'corr-pending',
            status: 'PENDING',
            targetDate: new Date('2026-10-08'),
            submittedAt: new Date(),
          },
        ]);

        prisma.holiday.findMany.mockResolvedValue([
          {
            id: 'hol-1',
            name: 'Diwali',
            date: new Date('2026-11-01'),
            isOptional: false,
          },
        ]);

        const dashboard = await service.getMyDashboard(mockEmployeeUser);

        expect(dashboard).toBeDefined();
        expect(dashboard.employee.employeeCode).toBe('EMP004');
        expect(dashboard.employee.displayName).toBe('Priya Nair');
        expect(dashboard.employee.designation).toBe('Senior Software Engineer');
        expect(dashboard.employee.manager?.displayName).toBe('Rajesh Kumar');

        expect(dashboard.attendanceToday.isCheckedIn).toBe(true);
        expect(dashboard.attendanceToday.status).toBe('OPEN');
        expect(dashboard.attendanceToday.mode).toBe('OFFICE');
        expect(dashboard.attendanceToday.loggedMinutes).toBeGreaterThan(100);

        expect(dashboard.leaveBalances.length).toBe(3);
        expect(dashboard.leaveBalances[0].code).toBe('CL');
        expect(dashboard.leaveBalances[0].available).toBe(8);

        expect(dashboard.pendingRequests.totalCount).toBe(3); // 1 leave, 1 wfh, 1 correction
        expect(dashboard.pendingRequests.leaveCount).toBe(1);
        expect(dashboard.pendingRequests.wfhCount).toBe(1);
        expect(dashboard.pendingRequests.correctionCount).toBe(1);

        expect(dashboard.upcomingAbsences.length).toBe(1);
        expect(dashboard.upcomingAbsences[0].title).toBe('Casual Leave Leave');
        expect(dashboard.upcomingAbsences[0].daysCount).toBe(3);

        expect(dashboard.upcomingHolidays.length).toBe(1);
        expect(dashboard.upcomingHolidays[0].name).toBe('Diwali');
      });

      it('should throw NotFoundException when current session user has no linked employee profile', async () => {
        prisma.employee.findFirst.mockResolvedValue(null);

        await expect(service.getMyDashboard(mockEmployeeUser)).rejects.toThrow(NotFoundException);
      });

      it('should derive employee strictly by server session userId and organizationId', async () => {
        prisma.employee.findFirst.mockResolvedValue(mockFullEmployee);
        await service.getMyDashboard(mockEmployeeUser);

        expect(prisma.employee.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              userId: mockEmployeeUser.id,
              organizationId: mockOrgId,
              deletedAt: null,
            },
          }),
        );
      });

      it('should handle zero leave balances, zero pending requests, and not checked-in status gracefully', async () => {
        prisma.employee.findFirst.mockResolvedValue(mockFullEmployee);
        prisma.attendanceSession.findFirst.mockResolvedValue(null);
        prisma.shiftAssignment.findFirst.mockResolvedValue(null);
        prisma.leaveBalanceAccount.findMany.mockResolvedValue([]);
        prisma.leaveRequest.findMany.mockResolvedValue([]);
        prisma.wfhRequest.findMany.mockResolvedValue([]);
        prisma.officialVisit.findMany.mockResolvedValue([]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([]);
        prisma.holiday.findMany.mockResolvedValue([]);

        const dashboard = await service.getMyDashboard(mockEmployeeUser);

        expect(dashboard.attendanceToday.isCheckedIn).toBe(false);
        expect(dashboard.attendanceToday.status).toBe('NOT_STARTED');
        expect(dashboard.attendanceToday.checkInTime).toBeNull();
        expect(dashboard.leaveBalances).toEqual([]);
        expect(dashboard.pendingRequests.totalCount).toBe(0);
        expect(dashboard.upcomingAbsences).toEqual([]);
        expect(dashboard.upcomingHolidays).toEqual([]);
      });
    });

    describe('Profile Change Request Workflow (ESS Self-Service)', () => {
      const mockReqEmployee = {
        id: 'emp-ess-001',
        employeeCode: 'EMP003',
        displayName: 'Rahul Verma',
        userId: mockEmployeeUser.id,
        organizationId: mockOrgId,
      };

      const mockAuthoritativeContact = {
        id: 'cnt-1',
        employeeId: mockReqEmployee.id,
        workEmail: 'rahul.verma@peopleos.local',
        personalEmail: 'rahul.old@gmail.com',
        phone: '+91 99999 11111',
        alternatePhone: null,
        address: 'Old Street 1',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      };

      const mockAuthoritativeEmergencyContacts = [
        {
          id: 'emg-1',
          employeeId: mockReqEmployee.id,
          name: 'Sunita Verma',
          relationship: 'Mother',
          phone: '+91 99999 22222',
          alternatePhone: null,
          address: 'Old Street 1',
          isPrimary: true,
        },
      ];

      describe('createProfileChangeRequest', () => {
        it('should stage proposed changes as PENDING without mutating authoritative records', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          prisma.profileChangeRequest.findFirst.mockResolvedValue(null);
          prisma.employeeContact.findUnique.mockResolvedValue(mockAuthoritativeContact);
          prisma.emergencyContact.findMany.mockResolvedValue(mockAuthoritativeEmergencyContacts);

          const createdMockRequest = {
            id: 'pcr-101',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.PENDING,
            data: {
              personalEmail: 'rahul.new@gmail.com',
              phone: '+91 98888 77777',
            },
            currentData: {
              personalEmail: 'rahul.old@gmail.com',
              phone: '+91 99999 11111',
            },
            submittedAt: new Date(),
          };
          prisma.profileChangeRequest.create.mockResolvedValue(createdMockRequest);

          const result = await service.createProfileChangeRequest(mockEmployeeUser, {
            personalEmail: 'rahul.new@gmail.com',
            phone: '+91 98888 77777',
            reason: 'Changed personal phone number',
          });

          expect(result.id).toBe('pcr-101');
          expect(result.status).toBe(ProfileChangeRequestStatus.PENDING);

          // Must NOT mutate authoritative records directly
          expect(prisma.employeeContact.update).not.toHaveBeenCalled();
          expect(prisma.employeeContact.upsert).not.toHaveBeenCalled();
          expect(prisma.emergencyContact.create).not.toHaveBeenCalled();

          // Must create staged ProfileChangeRequest
          expect(prisma.profileChangeRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                organizationId: mockOrgId,
                employeeId: mockReqEmployee.id,
                status: ProfileChangeRequestStatus.PENDING,
                reason: 'Changed personal phone number',
              }),
            }),
          );

          // Audit log recorded
          expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'PROFILE_CHANGE_REQUESTED',
              entity: 'ProfileChangeRequest',
              entityId: 'pcr-101',
              userId: mockEmployeeUser.id,
            }),
          );
        });

        it('should throw BadRequestException if user already has an active pending request', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          prisma.profileChangeRequest.findFirst.mockResolvedValue({
            id: 'pcr-existing',
            status: ProfileChangeRequestStatus.PENDING,
          });

          await expect(
            service.createProfileChangeRequest(mockEmployeeUser, {
              phone: '+91 98888 77777',
            }),
          ).rejects.toThrow(BadRequestException);

          expect(prisma.profileChangeRequest.create).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if session user has no linked employee profile', async () => {
          prisma.employee.findFirst.mockResolvedValue(null);

          await expect(
            service.createProfileChangeRequest(mockEmployeeUser, {
              phone: '+91 98888 77777',
            }),
          ).rejects.toThrow(NotFoundException);
        });
      });

      describe('getMyProfileChangeRequests', () => {
        it('should return chronological requests for authenticated employee', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          const mockList = [
            { id: 'pcr-2', status: ProfileChangeRequestStatus.APPROVED },
            { id: 'pcr-1', status: ProfileChangeRequestStatus.PENDING },
          ];
          prisma.profileChangeRequest.findMany.mockResolvedValue(mockList);

          const result = await service.getMyProfileChangeRequests(mockEmployeeUser);

          expect(result).toHaveLength(2);
          expect(prisma.profileChangeRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: {
                employeeId: mockReqEmployee.id,
                organizationId: mockOrgId,
              },
              orderBy: { submittedAt: 'desc' },
            }),
          );
        });
      });

      describe('cancelProfileChangeRequest', () => {
        it('should cancel pending request owned by current employee', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          prisma.profileChangeRequest.findUnique.mockResolvedValue({
            id: 'pcr-101',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.PENDING,
          });
          prisma.profileChangeRequest.update.mockResolvedValue({
            id: 'pcr-101',
            status: ProfileChangeRequestStatus.CANCELLED,
          });

          const result = await service.cancelProfileChangeRequest(mockEmployeeUser, 'pcr-101');

          expect(result.status).toBe(ProfileChangeRequestStatus.CANCELLED);
          expect(prisma.profileChangeRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: 'pcr-101' },
              data: { status: ProfileChangeRequestStatus.CANCELLED },
            }),
          );

          expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'PROFILE_CHANGE_CANCELLED',
              entityId: 'pcr-101',
            }),
          );
        });

        it('should prevent IDOR: throw ForbiddenException if request belongs to different employee', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          prisma.profileChangeRequest.findUnique.mockResolvedValue({
            id: 'pcr-102',
            organizationId: mockOrgId,
            employeeId: 'emp-other-user', // Different employee
            status: ProfileChangeRequestStatus.PENDING,
          });

          await expect(
            service.cancelProfileChangeRequest(mockEmployeeUser, 'pcr-102'),
          ).rejects.toThrow(ForbiddenException);

          expect(prisma.profileChangeRequest.update).not.toHaveBeenCalled();
        });

        it('should throw BadRequestException if request is not PENDING', async () => {
          prisma.employee.findFirst.mockResolvedValue(mockReqEmployee);
          prisma.profileChangeRequest.findUnique.mockResolvedValue({
            id: 'pcr-103',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.APPROVED, // Already approved
          });

          await expect(
            service.cancelProfileChangeRequest(mockEmployeeUser, 'pcr-103'),
          ).rejects.toThrow(BadRequestException);
        });
      });

      describe('getProfileChangeRequests', () => {
        it('should query requests scoped to organization with pagination and status filter', async () => {
          prisma.profileChangeRequest.count.mockResolvedValue(1);
          prisma.profileChangeRequest.findMany.mockResolvedValue([
            { id: 'pcr-1', status: ProfileChangeRequestStatus.PENDING },
          ]);

          const result = await service.getProfileChangeRequests(mockHrUser, {
            status: 'PENDING',
            page: 1,
            limit: 10,
          });

          expect(result.items).toHaveLength(1);
          expect(result.meta.total).toBe(1);
          expect(prisma.profileChangeRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: {
                organizationId: mockOrgId,
                status: ProfileChangeRequestStatus.PENDING,
              },
              skip: 0,
              take: 10,
            }),
          );
        });
      });

      describe('reviewProfileChangeRequest', () => {
        it('should approve change request and transactionally update authoritative contact and emergency contacts', async () => {
          const stagedRequest = {
            id: 'pcr-review-1',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.PENDING,
            data: {
              personalEmail: 'approved.email@example.com',
              phone: '+91 99999 88888',
              emergencyContacts: [
                {
                  name: 'Priya Verma',
                  relationship: 'Spouse',
                  phone: '+91 88888 99999',
                  isPrimary: true,
                },
              ],
            },
            employee: {
              id: mockReqEmployee.id,
              displayName: 'Rahul Verma',
              employeeCode: 'EMP003',
              userId: mockEmployeeUser.id,
            },
          };

          prisma.profileChangeRequest.findUnique.mockResolvedValue(stagedRequest);
          prisma.employeeContact.upsert.mockResolvedValue({});
          prisma.emergencyContact.deleteMany.mockResolvedValue({});
          prisma.emergencyContact.createMany.mockResolvedValue({});
          prisma.employeeHistory.create.mockResolvedValue({});
          prisma.profileChangeRequest.update.mockResolvedValue({
            ...stagedRequest,
            status: ProfileChangeRequestStatus.APPROVED,
            reviewerId: mockHrUser.id,
            reviewedAt: new Date(),
          });

          const result = await service.reviewProfileChangeRequest(mockHrUser, 'pcr-review-1', {
            decision: ProfileChangeReviewDecision.APPROVED,
            reviewNotes: 'Verified documents and approved',
          });

          expect(result.status).toBe(ProfileChangeRequestStatus.APPROVED);

          // Authoritative records transactionally updated
          expect(prisma.employeeContact.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { employeeId: mockReqEmployee.id },
              update: expect.objectContaining({
                personalEmail: 'approved.email@example.com',
                phone: '+91 99999 88888',
              }),
            }),
          );

          expect(prisma.emergencyContact.deleteMany).toHaveBeenCalledWith({
            where: { employeeId: mockReqEmployee.id },
          });

          expect(prisma.emergencyContact.createMany).toHaveBeenCalledWith({
            data: [
              expect.objectContaining({
                employeeId: mockReqEmployee.id,
                name: 'Priya Verma',
                relationship: 'Spouse',
                phone: '+91 88888 99999',
                isPrimary: true,
              }),
            ],
          });

          // History audit event created
          expect(prisma.employeeHistory.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                employeeId: mockReqEmployee.id,
                eventType: EmployeeHistoryEventType.STATUS_CHANGED,
                performedById: mockHrUser.id,
              }),
            }),
          );

          // Audit log recorded
          expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'PROFILE_CHANGE_APPROVED',
              entityId: 'pcr-review-1',
              userId: mockHrUser.id,
            }),
          );
        });

        it('should reject change request without modifying authoritative contact or emergency contact records', async () => {
          const stagedRequest = {
            id: 'pcr-review-2',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.PENDING,
            data: { personalEmail: 'rejected@example.com' },
            employee: {
              id: mockReqEmployee.id,
              displayName: 'Rahul Verma',
              employeeCode: 'EMP003',
              userId: mockEmployeeUser.id,
            },
          };

          prisma.profileChangeRequest.findUnique.mockResolvedValue(stagedRequest);
          prisma.profileChangeRequest.update.mockResolvedValue({
            ...stagedRequest,
            status: ProfileChangeRequestStatus.REJECTED,
            reviewerId: mockHrUser.id,
          });

          const result = await service.reviewProfileChangeRequest(mockHrUser, 'pcr-review-2', {
            decision: ProfileChangeReviewDecision.REJECTED,
            reviewNotes: 'Invalid phone format provided',
          });

          expect(result.status).toBe(ProfileChangeRequestStatus.REJECTED);

          // Must NOT touch authoritative contacts
          expect(prisma.employeeContact.upsert).not.toHaveBeenCalled();
          expect(prisma.emergencyContact.createMany).not.toHaveBeenCalled();
          expect(prisma.emergencyContact.deleteMany).not.toHaveBeenCalled();

          // Audit log recorded as rejected
          expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'PROFILE_CHANGE_REJECTED',
              entityId: 'pcr-review-2',
              userId: mockHrUser.id,
            }),
          );
        });

        it('should prevent stale/duplicate decisions: throw ConflictException if request already decided', async () => {
          prisma.profileChangeRequest.findUnique.mockResolvedValue({
            id: 'pcr-already-approved',
            organizationId: mockOrgId,
            employeeId: mockReqEmployee.id,
            status: ProfileChangeRequestStatus.APPROVED,
          });

          await expect(
            service.reviewProfileChangeRequest(mockHrUser, 'pcr-already-approved', {
              decision: ProfileChangeReviewDecision.APPROVED,
            }),
          ).rejects.toThrow(ConflictException);

          expect(prisma.employeeContact.upsert).not.toHaveBeenCalled();
        });

        it('should throw NotFoundException if request not found in organization', async () => {
          prisma.profileChangeRequest.findUnique.mockResolvedValue(null);

          await expect(
            service.reviewProfileChangeRequest(mockHrUser, 'pcr-non-existent', {
              decision: ProfileChangeReviewDecision.APPROVED,
            }),
          ).rejects.toThrow(NotFoundException);
        });
      });
    });

    describe('getMyRequests (Unified Employee Requests)', () => {
      const mockLeave = {
        id: 'leave-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeUser.id,
        leaveType: { name: 'Casual Leave' },
        startDate: new Date('2026-10-15T00:00:00Z'),
        endDate: new Date('2026-10-16T00:00:00Z'),
        days: 2,
        reason: 'Family function',
        status: 'PENDING',
        createdAt: new Date('2026-10-10T10:00:00Z'),
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
      };

      const mockWfh = {
        id: 'wfh-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeUser.id,
        startDate: new Date('2026-10-12T00:00:00Z'),
        endDate: new Date('2026-10-12T00:00:00Z'),
        durationType: 'FULL_DAY',
        reason: 'Broadband technician visit',
        status: 'APPROVED',
        createdAt: new Date('2026-10-09T08:00:00Z'),
        reviewer: { firstName: 'Rajesh', lastName: 'Kumar' },
        decidedAt: new Date('2026-10-09T12:00:00Z'),
        decisionNotes: 'Approved for 1 day',
      };

      const mockVisit = {
        id: 'visit-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeUser.id,
        title: 'Client site audit',
        startDate: new Date('2026-10-20T00:00:00Z'),
        endDate: new Date('2026-10-21T00:00:00Z'),
        purpose: 'Security assessment on premise',
        status: 'PENDING',
        createdAt: new Date('2026-10-08T09:00:00Z'),
        decidedBy: null,
        decidedAt: null,
        decisionComments: null,
      };

      const mockCorrection = {
        id: 'corr-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeUser.id,
        targetDate: new Date('2026-10-05T00:00:00Z'),
        reasonCategory: 'MISSING_CHECKOUT',
        reason: 'Biometric reader timeout',
        status: 'APPROVED',
        submittedAt: new Date('2026-10-06T10:00:00Z'),
        decisions: [
          {
            reviewer: { firstName: 'Rajesh', lastName: 'Kumar' },
            decidedAt: new Date('2026-10-06T15:00:00Z'),
            reason: 'Logs verified',
          },
        ],
      };

      const mockPcr = {
        id: 'pcr-1',
        organizationId: mockOrgId,
        employeeId: mockEmployeeUser.id,
        status: ProfileChangeRequestStatus.PENDING,
        createdAt: new Date('2026-10-07T11:00:00Z'),
        reason: 'Moved to new apartment',
        data: { phone: '+91 9999999999' },
        reviewer: null,
        reviewedAt: null,
        reviewNotes: null,
      };

      it('should successfully aggregate all request types with counts and own-record isolation', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: mockEmployeeUser.id,
          organizationId: mockOrgId,
        });
        prisma.leaveRequest.findMany.mockResolvedValue([mockLeave]);
        prisma.wfhRequest.findMany.mockResolvedValue([mockWfh]);
        prisma.officialVisit.findMany.mockResolvedValue([mockVisit]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([mockCorrection]);
        prisma.profileChangeRequest.findMany.mockResolvedValue([mockPcr]);

        const result = await service.getMyRequests(mockEmployeeUser, { page: 1, limit: 10 });

        expect(result.meta.total).toBe(5);
        expect(result.items.length).toBe(5);
        expect(result.counts.pending).toBe(3);
        expect(result.counts.leave).toBe(1);
        expect(result.counts.wfh).toBe(1);
        expect(result.counts.visit).toBe(1);

        expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              employeeId: mockEmployeeUser.id,
              organizationId: mockOrgId,
            }),
          }),
        );
      });

      it('should filter requests by specific type (e.g. LEAVE)', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: mockEmployeeUser.id,
          organizationId: mockOrgId,
        });
        prisma.leaveRequest.findMany.mockResolvedValue([mockLeave]);
        prisma.wfhRequest.findMany.mockResolvedValue([mockWfh]);
        prisma.officialVisit.findMany.mockResolvedValue([mockVisit]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([mockCorrection]);
        prisma.profileChangeRequest.findMany.mockResolvedValue([mockPcr]);

        const result = await service.getMyRequests(mockEmployeeUser, { type: 'LEAVE' });

        expect(result.meta.total).toBe(1);
        expect(result.items[0].type).toBe('LEAVE');
        expect(result.items[0].id).toBe(mockLeave.id);
      });

      it('should filter requests by status (e.g. APPROVED)', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: mockEmployeeUser.id,
          organizationId: mockOrgId,
        });
        prisma.leaveRequest.findMany.mockResolvedValue([mockLeave]);
        prisma.wfhRequest.findMany.mockResolvedValue([mockWfh]);
        prisma.officialVisit.findMany.mockResolvedValue([mockVisit]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([mockCorrection]);
        prisma.profileChangeRequest.findMany.mockResolvedValue([mockPcr]);

        const result = await service.getMyRequests(mockEmployeeUser, { status: 'APPROVED' });

        expect(result.meta.total).toBe(2);
        expect(result.items.every((it) => it.status === 'APPROVED')).toBe(true);
      });

      it('should filter requests by search query keyword', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: mockEmployeeUser.id,
          organizationId: mockOrgId,
        });
        prisma.leaveRequest.findMany.mockResolvedValue([mockLeave]);
        prisma.wfhRequest.findMany.mockResolvedValue([mockWfh]);
        prisma.officialVisit.findMany.mockResolvedValue([mockVisit]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([mockCorrection]);
        prisma.profileChangeRequest.findMany.mockResolvedValue([mockPcr]);

        const result = await service.getMyRequests(mockEmployeeUser, { search: 'Biometric' });

        expect(result.meta.total).toBe(1);
        expect(result.items[0].type).toBe('ATTENDANCE_CORRECTION');
      });

      it('should aggregate employee DOCUMENT verification requests into unified requests list', async () => {
        prisma.employee.findFirst.mockResolvedValue({
          id: mockEmployeeUser.id,
          organizationId: mockOrgId,
        });
        prisma.leaveRequest.findMany.mockResolvedValue([]);
        prisma.wfhRequest.findMany.mockResolvedValue([]);
        prisma.officialVisit.findMany.mockResolvedValue([]);
        prisma.attendanceCorrectionRequest.findMany.mockResolvedValue([]);
        prisma.profileChangeRequest.findMany.mockResolvedValue([]);
        prisma.employeeDocumentMetadata.findMany.mockResolvedValue([
          {
            id: 'doc-meta-1',
            employeeId: mockEmployeeUser.id,
            documentType: 'GOVT_ID',
            documentName: 'Aadhaar Card Copy',
            documentNumber: 'XXXX-1234',
            mimeType: 'application/pdf',
            fileSize: 1048576,
            isVerified: false,
            createdAt: new Date('2026-10-10T10:00:00Z'),
          },
        ]);

        const result = await service.getMyRequests(mockEmployeeUser, { type: 'DOCUMENT' });

        expect(result.meta.total).toBe(1);
        expect(result.items[0].type).toBe('DOCUMENT');
        expect(result.items[0].title).toBe('Document: Aadhaar Card Copy');
        expect(result.items[0].status).toBe('PENDING');
        expect(result.items[0].href).toBe('/documents');
        expect(result.items[0].canCancel).toBe(true);
      });

      it('should enforce own-record security and throw NotFoundException if employee profile does not exist', async () => {
        prisma.employee.findFirst.mockResolvedValue(null);

        await expect(service.getMyRequests(mockEmployeeUser, {})).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});
