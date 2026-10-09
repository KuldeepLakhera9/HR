import { Test, TestingModule } from '@nestjs/testing';
import { HierarchyService } from './hierarchy.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('HierarchyService', () => {
  let service: HierarchyService;
  let prisma: any;

  const mockOrgId = 'org-corp-1';

  beforeEach(async () => {
    prisma = {
      employee: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      employeeEmployment: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HierarchyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<HierarchyService>(HierarchyService);
  });

  describe('getManager', () => {
    it('should return direct manager when employee has an assigned manager', async () => {
      const mockManager = {
        id: 'mgr-1',
        employeeCode: 'EMP001',
        displayName: 'Aarav Patel',
        isActive: true,
      };

      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-10',
        organizationId: mockOrgId,
        managerId: 'mgr-1',
        manager: mockManager,
      });

      const result = await service.getManager('emp-10', mockOrgId);
      expect(result).toEqual(mockManager);
      expect(prisma.employee.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-10' },
        }),
      );
    });

    it('should return null when employee has no manager (top level)', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'ceo-1',
        organizationId: mockOrgId,
        managerId: null,
        manager: null,
        employment: null,
      });

      const result = await service.getManager('ceo-1', mockOrgId);
      expect(result).toBeNull();
    });

    it('should throw NotFoundException if employee does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.getManager('non-existent', mockOrgId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if employee belongs to a different organization', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-diff',
        organizationId: 'other-org',
        managerId: null,
      });

      await expect(service.getManager('emp-diff', mockOrgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDirectReports', () => {
    it('should return all active direct reports for a manager', async () => {
      const mockReports = [
        { id: 'sub-1', displayName: 'Bhavna Sharma', managerId: 'mgr-1' },
        { id: 'sub-2', displayName: 'Chirag Sen', managerId: 'mgr-1' },
      ];

      prisma.employee.findMany.mockResolvedValue(mockReports);

      const result = await service.getDirectReports('mgr-1', mockOrgId);
      expect(result).toEqual(mockReports);
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: expect.arrayContaining([{ isActive: true }, { organizationId: mockOrgId }]),
          },
        }),
      );
    });

    it('should return empty array if manager has no direct subordinates', async () => {
      prisma.employee.findMany.mockResolvedValue([]);

      const result = await service.getDirectReports('mgr-empty', mockOrgId);
      expect(result).toEqual([]);
    });
  });

  describe('getTeam (Controlled Breadth-First Batch Lookup)', () => {
    it('should traverse multi-level hierarchy using controlled batch queries without N+1 recursion', async () => {
      // Manager record
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-lead',
        organizationId: mockOrgId,
        employeeCode: 'EMP-LEAD',
        displayName: 'Leadership Manager',
        isActive: true,
      });

      // Level 1: Direct reports (B and C)
      const level1Reports = [
        { id: 'emp-b', managerId: 'mgr-lead', displayName: 'Direct Report B', isActive: true },
        { id: 'emp-c', managerId: 'mgr-lead', displayName: 'Direct Report C', isActive: true },
      ];

      // Level 2: Indirect reports (D reports to B)
      const level2Reports = [
        { id: 'emp-d', managerId: 'emp-b', displayName: 'Indirect Report D', isActive: true },
      ];

      // Level 3: Empty
      prisma.employee.findMany
        .mockResolvedValueOnce(level1Reports)
        .mockResolvedValueOnce(level2Reports)
        .mockResolvedValueOnce([]);

      const result = await service.getTeam('mgr-lead', mockOrgId);

      expect(result.manager.id).toBe('mgr-lead');
      expect(result.directReports).toHaveLength(2);
      expect(result.directReports[0].id).toBe('emp-b');
      expect(result.directReports[0].hierarchyDepth).toBe(1);

      expect(result.indirectReports).toHaveLength(1);
      expect(result.indirectReports[0].id).toBe('emp-d');
      expect(result.indirectReports[0].hierarchyDepth).toBe(2);

      expect(result.allMemberIds).toEqual(['emp-b', 'emp-c', 'emp-d']);
      expect(result.totalTeamSize).toBe(3);

      // Verify batch queries: only 3 database queries were executed (depth 1, depth 2, depth 3), NOT individual N+1 calls
      expect(prisma.employee.findMany).toHaveBeenCalledTimes(3);
    });

    it('should prevent circular loops and terminate cleanly if cycle exists in database data', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-cycle',
        organizationId: mockOrgId,
        displayName: 'Cycle Manager',
        isActive: true,
      });

      // Report pointing back to manager
      const cycleReports = [
        { id: 'emp-cycle-1', managerId: 'mgr-cycle', displayName: 'Cycle Sub 1', isActive: true },
      ];

      prisma.employee.findMany
        .mockResolvedValueOnce(cycleReports)
        .mockResolvedValueOnce([
          { id: 'mgr-cycle', managerId: 'emp-cycle-1', displayName: 'Cycle Back', isActive: true },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getTeam('mgr-cycle', mockOrgId);
      expect(result.directReports).toHaveLength(1);
      expect(result.allMemberIds).toContain('emp-cycle-1');
      // Should not blow up or hang in infinite loop
    });

    it('should throw NotFoundException if manager does not exist', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.getTeam('non-existent', mockOrgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTeamMemberIds', () => {
    it('should return all member IDs under manager', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-x',
        organizationId: mockOrgId,
      });

      prisma.employee.findMany
        .mockResolvedValueOnce([
          { id: 'sub-x1', managerId: 'mgr-x' },
          { id: 'sub-x2', managerId: 'mgr-x' },
        ])
        .mockResolvedValueOnce([]);

      const ids = await service.getTeamMemberIds('mgr-x', mockOrgId);
      expect(ids).toEqual(['sub-x1', 'sub-x2']);
    });
  });

  describe('isManagerOf', () => {
    it('should return true if employee is self (manager of self)', async () => {
      const isMgr = await service.isManagerOf('emp-same', 'emp-same', mockOrgId);
      expect(isMgr).toBe(true);
    });

    it('should return true for a direct subordinate', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-child',
        organizationId: mockOrgId,
        managerId: 'mgr-parent',
      });

      const isMgr = await service.isManagerOf('mgr-parent', 'emp-child', mockOrgId);
      expect(isMgr).toBe(true);
    });

    it('should return true for an indirect subordinate (grandchild node)', async () => {
      // emp-sub reports to emp-mid
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-sub',
        organizationId: mockOrgId,
        managerId: 'emp-mid',
      });

      // emp-mid reports to mgr-top
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-mid',
        organizationId: mockOrgId,
        managerId: 'mgr-top',
      });

      const isMgr = await service.isManagerOf('mgr-top', 'emp-sub', mockOrgId);
      expect(isMgr).toBe(true);
    });

    it('should return false if manager is not in the reporting line of employee', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-other',
        organizationId: mockOrgId,
        managerId: 'mgr-different',
      });

      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-different',
        organizationId: mockOrgId,
        managerId: null, // Reached top
      });

      const isMgr = await service.isManagerOf('mgr-unrelated', 'emp-other', mockOrgId);
      expect(isMgr).toBe(false);
    });
  });

  describe('getApprovalChain', () => {
    it('should build hierarchical approval chain (Level 1, Level 2, Level 3)', async () => {
      // Employee has Manager 1
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-applicant',
        managerId: 'mgr-1',
        manager: {
          id: 'mgr-1',
          employeeCode: 'M1',
          displayName: 'Direct Manager',
          isActive: true,
          employment: { designation: { title: 'Lead' }, department: { name: 'Eng' } },
        },
      });

      // Manager 1 has Manager 2 (Skip level)
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-1',
        managerId: 'mgr-2',
        manager: {
          id: 'mgr-2',
          employeeCode: 'M2',
          displayName: 'Department Head',
          isActive: true,
          employment: { designation: { title: 'Director' }, department: { name: 'Eng' } },
        },
      });

      // Manager 2 has no manager (Executive / CEO)
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'mgr-2',
        managerId: null,
        manager: null,
      });

      const chain = await service.getApprovalChain('emp-applicant', mockOrgId, 3);
      expect(chain).toHaveLength(2);
      expect(chain[0].role).toBe('DIRECT_MANAGER');
      expect(chain[0].displayName).toBe('Direct Manager');
      expect(chain[1].role).toBe('SKIP_LEVEL_MANAGER');
      expect(chain[1].displayName).toBe('Department Head');
    });
  });

  describe('validateManagerHierarchy & Circular Prevention', () => {
    it('should reject employee as their own manager', async () => {
      await expect(
        service.validateManagerHierarchy('emp-self', 'emp-self', mockOrgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject manager from a different organization', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'mgr-foreign',
        organizationId: 'other-org',
        isActive: true,
      });

      await expect(
        service.validateManagerHierarchy('emp-1', 'mgr-foreign', mockOrgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive manager', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'mgr-inactive',
        organizationId: mockOrgId,
        isActive: false,
      });

      await expect(
        service.validateManagerHierarchy('emp-1', 'mgr-inactive', mockOrgId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should detect and reject 2-tier circular manager (A -> B -> A)', async () => {
      // Choosing B as manager of A
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-b',
        organizationId: mockOrgId,
        isActive: true,
      });

      // B currently reports to A!
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-b',
        managerId: 'emp-a',
      });

      await expect(service.validateManagerHierarchy('emp-a', 'emp-b', mockOrgId)).rejects.toThrow(
        'Circular manager relationship detected',
      );
    });

    it('should detect and reject multi-tier circular manager (A -> B -> C -> A)', async () => {
      // Choosing C as manager of A
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-c',
        organizationId: mockOrgId,
        isActive: true,
      });

      // C reports to B
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-c',
        managerId: 'emp-b',
      });

      // B reports to A
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-b',
        managerId: 'emp-a',
      });

      await expect(service.validateManagerHierarchy('emp-a', 'emp-c', mockOrgId)).rejects.toThrow(
        'Circular manager relationship detected',
      );
    });

    it('should permit valid hierarchical manager assignment', async () => {
      // Manager B is valid
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-b',
        organizationId: mockOrgId,
        isActive: true,
      });

      // B reports to CEO (not A)
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-b',
        managerId: 'ceo',
      });

      // CEO reports to nobody
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'ceo',
        managerId: null,
      });

      await expect(
        service.validateManagerHierarchy('emp-a', 'emp-b', mockOrgId),
      ).resolves.toBeUndefined();
    });
  });

  describe('Future Architecture Preparation Hooks', () => {
    it('should verify canManageAttendance delegates to hierarchy evaluation', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-sub',
        organizationId: mockOrgId,
        managerId: 'mgr-1',
      });

      const allowed = await service.canManageAttendance('mgr-1', 'emp-sub', mockOrgId);
      expect(allowed).toBe(true);
    });

    it('should verify canApproveLeave delegates to hierarchy evaluation', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-sub',
        organizationId: mockOrgId,
        managerId: 'mgr-1',
      });

      const allowed = await service.canApproveLeave('mgr-1', 'emp-sub', mockOrgId);
      expect(allowed).toBe(true);
    });

    it('should verify canApproveVisit delegates to hierarchy evaluation', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-sub',
        organizationId: mockOrgId,
        managerId: 'mgr-1',
      });

      const allowed = await service.canApproveVisit('mgr-1', 'emp-sub', mockOrgId);
      expect(allowed).toBe(true);
    });

    it('should verify canManageProgress delegates to hierarchy evaluation', async () => {
      prisma.employee.findUnique.mockResolvedValueOnce({
        id: 'emp-sub',
        organizationId: mockOrgId,
        managerId: 'mgr-1',
      });

      const allowed = await service.canManageProgress('mgr-1', 'emp-sub', mockOrgId);
      expect(allowed).toBe(true);
    });
  });
});
