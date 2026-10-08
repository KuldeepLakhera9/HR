import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let prisma: any;
  let audit: any;

  const mockOrgId = 'org-123';
  const mockOrg = {
    id: mockOrgId,
    code: 'PEOPLEOS',
    name: 'PeopleOS Technologies Inc.',
    legalName: 'PeopleOS Solutions Private Limited',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      department: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      designation: {
        count: jest.fn().mockResolvedValue(7),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employee: {
        count: jest.fn().mockResolvedValue(8),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
  });

  describe('Organization Overview & Details', () => {
    it('should return organization profile with counts', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);

      const result = await service.getOrganization(mockOrgId);

      expect(result.id).toBe(mockOrgId);
      expect(result.stats.branchesCount).toBe(3);
      expect(result.stats.departmentsCount).toBe(5);
      expect(result.stats.designationsCount).toBe(7);
      expect(result.stats.employeesCount).toBe(8);
    });

    it('should throw NotFoundException when organization is missing', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getOrganization('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should update organization details and record audit log', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.organization.update.mockResolvedValue({
        ...mockOrg,
        name: 'PeopleOS Global Corp',
      });

      const updated = await service.updateOrganization(
        mockOrgId,
        { name: 'PeopleOS Global Corp' },
        'usr-admin',
      );

      expect(updated.name).toBe('PeopleOS Global Corp');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_UPDATED',
          entity: 'Organization',
        }),
      );
    });
  });

  describe('Branch Management', () => {
    it('should create new branch with geofencing coordinates', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);
      prisma.branch.create.mockResolvedValue({
        id: 'br-1',
        code: 'HYD-01',
        name: 'Hyderabad Office',
        latitude: 17.385,
        longitude: 78.4867,
      });

      const result = await service.createBranch(
        {
          code: 'HYD-01',
          name: 'Hyderabad Office',
          latitude: 17.385,
          longitude: 78.4867,
        },
        mockOrgId,
        'usr-admin',
      );

      expect(result.code).toBe('HYD-01');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRANCH_CREATED',
          entity: 'Branch',
        }),
      );
    });

    it('should reject branch creation with duplicate code', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'existing-br' });

      await expect(
        service.createBranch({ code: 'BLR-HQ', name: 'Duplicate HQ' }, mockOrgId),
      ).rejects.toThrow(ConflictException);
    });

    it('should soft-deactivate branch and protect referenced employee data', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: 'br-1',
        organizationId: mockOrgId,
        name: 'Bengaluru HQ',
        _count: { employments: 5 },
      });
      prisma.branch.update.mockResolvedValue({ id: 'br-1', isActive: false });

      const result = await service.deactivateBranch('br-1', 'usr-admin');

      expect(result.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRANCH_DEACTIVATED',
          metadata: expect.objectContaining({ employeeCount: 5 }),
        }),
      );
    });
  });

  describe('Department Management', () => {
    it('should create department and log audit trail', async () => {
      prisma.department.findUnique.mockResolvedValue(null);
      prisma.department.create.mockResolvedValue({
        id: 'dept-1',
        code: 'QA',
        name: 'Quality Assurance',
      });

      const dept = await service.createDepartment(
        { code: 'QA', name: 'Quality Assurance' },
        mockOrgId,
        'usr-admin',
      );

      expect(dept.code).toBe('QA');
      expect(audit.record).toHaveBeenCalled();
    });

    it('should prevent department from setting itself as parent', async () => {
      prisma.department.findUnique.mockResolvedValue({
        id: 'dept-eng',
        organizationId: mockOrgId,
        code: 'ENG',
        _count: { employments: 0 },
      });

      await expect(
        service.updateDepartment('dept-eng', { parentDepartmentId: 'dept-eng' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Designation Management', () => {
    it('should create designation and track audit log', async () => {
      prisma.designation.findUnique.mockResolvedValue(null);
      prisma.designation.create.mockResolvedValue({
        id: 'desig-1',
        code: 'PRIN-ENG',
        title: 'Principal Engineer',
        level: 4,
      });

      const desig = await service.createDesignation(
        { code: 'PRIN-ENG', title: 'Principal Engineer', level: 4 },
        mockOrgId,
      );

      expect(desig.level).toBe(4);
      expect(audit.record).toHaveBeenCalled();
    });

    it('should reject duplicate designation code', async () => {
      prisma.designation.findUnique.mockResolvedValue({ id: 'existing-desig' });

      await expect(
        service.createDesignation({ code: 'CTO', title: 'Chief Technology Officer' }, mockOrgId),
      ).rejects.toThrow(ConflictException);
    });
  });
});
