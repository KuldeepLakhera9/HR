import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AccessControlService } from './access-control.service';
import { PolicyRegistry } from './policies/policy-registry';
import { DefaultScopePolicy } from './policies/default-scope.policy';
import { LeavePolicy } from './policies/leave.policy';
import { AttendancePolicy } from './policies/attendance.policy';
import { EmployeePolicy } from './policies/employee.policy';
import { DefaultHierarchyResolver } from './hierarchy/default-hierarchy-resolver';
import { HIERARCHY_RESOLVER_TOKEN } from './hierarchy/hierarchy-resolver.interface';
import { AuthenticatedUser } from '../../modules/auth/interfaces/auth.interface';
import { ResourceTarget } from '@hrms/types';

describe('AccessControlService & Data Access Scopes', () => {
  let service: AccessControlService;

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@peopleos.local',
    organizationId: 'org-1',
    firstName: 'System',
    lastName: 'Admin',
    employeeCode: 'ADM-001',
    status: UserStatus.ACTIVE,
    roles: ['ADMIN'],
    permissions: ['*'],
    sessionId: 'session-admin',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'user-hr-1',
    email: 'hr@peopleos.local',
    organizationId: 'org-1',
    departmentId: 'dept-hr',
    firstName: 'HR',
    lastName: 'Director',
    employeeCode: 'HR-001',
    status: UserStatus.ACTIVE,
    roles: ['HR'],
    permissions: [
      'USER_VIEW',
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_UPDATE',
      'ATTENDANCE_APPROVE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'REPORT_VIEW',
    ],
    sessionId: 'session-hr',
  };

  const mockManagerUser: AuthenticatedUser = {
    id: 'user-manager-1',
    email: 'manager@peopleos.local',
    organizationId: 'org-1',
    departmentId: 'dept-eng',
    firstName: 'Engineering',
    lastName: 'Manager',
    employeeCode: 'MGR-001',
    status: UserStatus.ACTIVE,
    roles: ['MANAGER'],
    permissions: [
      'EMPLOYEE_VIEW',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_APPROVE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'REPORT_VIEW',
    ],
    sessionId: 'session-manager',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-employee-1',
    email: 'employee@peopleos.local',
    organizationId: 'org-1',
    departmentId: 'dept-eng',
    firstName: 'Dev',
    lastName: 'Engineer',
    employeeCode: 'EMP-001',
    status: UserStatus.ACTIVE,
    roles: ['EMPLOYEE'],
    permissions: ['EMPLOYEE_VIEW', 'ATTENDANCE_VIEW', 'ATTENDANCE_MARK', 'LEAVE_APPLY'],
    sessionId: 'session-employee',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HIERARCHY_RESOLVER_TOKEN,
          useClass: DefaultHierarchyResolver,
        },
        DefaultScopePolicy,
        LeavePolicy,
        AttendancePolicy,
        EmployeePolicy,
        PolicyRegistry,
        AccessControlService,
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
    const registry = module.get<PolicyRegistry>(PolicyRegistry);
    registry.onModuleInit();
  });

  describe('Effective Scope Resolution', () => {
    it('should assign GLOBAL scope to ADMIN', () => {
      expect(service.getEffectiveScope(mockAdminUser)).toBe('GLOBAL');
    });

    it('should assign ORGANIZATION scope to HR', () => {
      expect(service.getEffectiveScope(mockHrUser)).toBe('ORGANIZATION');
    });

    it('should assign TEAM scope to MANAGER', () => {
      expect(service.getEffectiveScope(mockManagerUser)).toBe('TEAM');
    });

    it('should assign SELF scope to EMPLOYEE', () => {
      expect(service.getEffectiveScope(mockEmployeeUser)).toBe('SELF');
    });

    it('should resolve highest scope when user has multiple roles', () => {
      const dualRoleUser: AuthenticatedUser = {
        ...mockEmployeeUser,
        roles: ['MANAGER', 'EMPLOYEE'],
      };
      expect(service.getEffectiveScope(dualRoleUser)).toBe('TEAM');

      const adminHrUser: AuthenticatedUser = {
        ...mockHrUser,
        roles: ['ADMIN', 'HR'],
      };
      expect(service.getEffectiveScope(adminHrUser)).toBe('GLOBAL');
    });
  });

  describe('ADMIN — GLOBAL Scope', () => {
    it('should allow ADMIN to access resources across organizations', async () => {
      const targetInOtherOrg: ResourceTarget = {
        id: 'leave-foreign-1',
        userId: 'user-foreign-9',
        organizationId: 'org-foreign-999',
      };

      const allowed = await service.canAccessResource(
        mockAdminUser,
        'LEAVE',
        'LEAVE_VIEW',
        targetInOtherOrg,
      );
      expect(allowed).toBe(true);
    });

    it('should allow ADMIN to approve leave for any user', async () => {
      const target: ResourceTarget = {
        id: 'leave-1',
        userId: 'user-employee-1',
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockAdminUser,
        'LEAVE',
        'LEAVE_APPROVE',
        target,
      );
      expect(allowed).toBe(true);
    });
  });

  describe('HR — ORGANIZATION Scope', () => {
    it('should allow HR to access resources within same organization', async () => {
      const targetInSameOrg: ResourceTarget = {
        id: 'emp-target-1',
        userId: 'user-employee-1',
        organizationId: 'org-1',
        departmentId: 'dept-eng',
      };

      const allowed = await service.canAccessResource(
        mockHrUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        targetInSameOrg,
      );
      expect(allowed).toBe(true);
    });

    it('should DENY HR access to resources in a different organization', async () => {
      const targetInOtherOrg: ResourceTarget = {
        id: 'emp-target-2',
        userId: 'user-foreign-1',
        organizationId: 'org-other-2',
      };

      const allowed = await service.canAccessResource(
        mockHrUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        targetInOtherOrg,
      );
      expect(allowed).toBe(false);
    });

    it('should allow HR to approve leave for employees in same org', async () => {
      const employeeLeave: ResourceTarget = {
        id: 'leave-100',
        userId: 'user-employee-1',
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockHrUser,
        'LEAVE',
        'LEAVE_APPROVE',
        employeeLeave,
      );
      expect(allowed).toBe(true);
    });
  });

  describe('MANAGER — TEAM Scope', () => {
    it('should allow MANAGER to view team members in same department', async () => {
      const teamMemberTarget: ResourceTarget = {
        id: 'emp-dev-1',
        userId: 'user-employee-1',
        organizationId: 'org-1',
        departmentId: 'dept-eng',
      };

      const allowed = await service.canAccessResource(
        mockManagerUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        teamMemberTarget,
      );
      expect(allowed).toBe(true);
    });

    it('should allow MANAGER to approve leave for direct report', async () => {
      const directReportLeave: ResourceTarget = {
        id: 'leave-direct-1',
        userId: 'user-employee-1',
        organizationId: 'org-1',
        managerId: mockManagerUser.id,
      };

      const allowed = await service.canAccessResource(
        mockManagerUser,
        'LEAVE',
        'LEAVE_APPROVE',
        directReportLeave,
      );
      expect(allowed).toBe(true);
    });

    it('should DENY MANAGER access to employees in other departments/teams', async () => {
      const otherDeptTarget: ResourceTarget = {
        id: 'emp-sales-1',
        userId: 'user-sales-1',
        organizationId: 'org-1',
        departmentId: 'dept-sales',
        managerId: 'other-manager-id',
      };

      const allowed = await service.canAccessResource(
        mockManagerUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        otherDeptTarget,
      );
      expect(allowed).toBe(false);
    });

    it('should DENY MANAGER approving their own leave (Anti-Self-Approval Rule)', async () => {
      const managerOwnLeave: ResourceTarget = {
        id: 'leave-manager-self',
        userId: mockManagerUser.id,
        organizationId: 'org-1',
        departmentId: 'dept-eng',
      };

      const allowed = await service.canAccessResource(
        mockManagerUser,
        'LEAVE',
        'LEAVE_APPROVE',
        managerOwnLeave,
      );
      expect(allowed).toBe(false);
    });
  });

  describe('EMPLOYEE — SELF Scope', () => {
    it('should allow EMPLOYEE to view own records', async () => {
      const ownRecord: ResourceTarget = {
        id: mockEmployeeUser.id,
        userId: mockEmployeeUser.id,
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        ownRecord,
      );
      expect(allowed).toBe(true);
    });

    it('should DENY EMPLOYEE viewing other employees records', async () => {
      const otherEmployeeRecord: ResourceTarget = {
        id: 'user-employee-2',
        userId: 'user-employee-2',
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'EMPLOYEE',
        'EMPLOYEE_VIEW',
        otherEmployeeRecord,
      );
      expect(allowed).toBe(false);
    });

    it('should allow EMPLOYEE to mark own attendance', async () => {
      const ownAttendance: ResourceTarget = {
        id: 'att-1',
        userId: mockEmployeeUser.id,
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'ATTENDANCE',
        'ATTENDANCE_MARK',
        ownAttendance,
      );
      expect(allowed).toBe(true);
    });

    it('should DENY EMPLOYEE marking attendance for another employee', async () => {
      const peerAttendance: ResourceTarget = {
        id: 'att-2',
        userId: 'user-peer-1',
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'ATTENDANCE',
        'ATTENDANCE_MARK',
        peerAttendance,
      );
      expect(allowed).toBe(false);
    });

    it('should allow EMPLOYEE to apply for own leave', async () => {
      const ownLeaveApplication: ResourceTarget = {
        id: 'leave-app-1',
        userId: mockEmployeeUser.id,
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'LEAVE',
        'LEAVE_APPLY',
        ownLeaveApplication,
      );
      expect(allowed).toBe(true);
    });

    it('should DENY EMPLOYEE applying for leave on behalf of someone else', async () => {
      const peerLeaveApplication: ResourceTarget = {
        id: 'leave-app-2',
        userId: 'user-peer-1',
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'LEAVE',
        'LEAVE_APPLY',
        peerLeaveApplication,
      );
      expect(allowed).toBe(false);
    });

    it('should DENY EMPLOYEE approving leave requests', async () => {
      const leaveRequest: ResourceTarget = {
        id: 'leave-app-1',
        userId: mockEmployeeUser.id,
        organizationId: 'org-1',
      };

      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'LEAVE',
        'LEAVE_APPROVE',
        leaveRequest,
      );
      expect(allowed).toBe(false);
    });
  });

  describe('Security Boundaries & Error Handling', () => {
    it('should DENY access if user lacks required permission', async () => {
      const allowed = await service.canAccessResource(
        mockEmployeeUser,
        'SETTING',
        'SETTING_UPDATE',
      );
      expect(allowed).toBe(false);
    });

    it('should DENY access if user is undefined or missing', async () => {
      const allowed = await service.canAccessResource(undefined, 'EMPLOYEE', 'EMPLOYEE_VIEW');
      expect(allowed).toBe(false);
    });

    it('should DENY access if user account is not ACTIVE', async () => {
      const suspendedUser: AuthenticatedUser = {
        ...mockEmployeeUser,
        status: UserStatus.SUSPENDED,
      };

      const allowed = await service.canAccessResource(suspendedUser, 'EMPLOYEE', 'EMPLOYEE_VIEW', {
        userId: suspendedUser.id,
        organizationId: 'org-1',
      });
      expect(allowed).toBe(false);
    });

    it('should throw ForbiddenException in assertAccessResource when denied', async () => {
      await expect(
        service.assertAccessResource(mockEmployeeUser, 'EMPLOYEE', 'EMPLOYEE_DELETE', {
          id: 'emp-1',
          organizationId: 'org-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should pass silently in assertAccessResource when access is granted', async () => {
      await expect(
        service.assertAccessResource(mockAdminUser, 'EMPLOYEE', 'EMPLOYEE_VIEW', {
          id: 'emp-1',
          organizationId: 'org-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('Database Scope Where Clause Generation', () => {
    it('should generate empty where clause for GLOBAL scope', () => {
      const where = service.buildScopeWhereClause(mockAdminUser, 'EMPLOYEE', 'EMPLOYEE_VIEW');
      expect(where).toEqual({});
    });

    it('should generate organizationId filter for ORGANIZATION scope', () => {
      const where = service.buildScopeWhereClause(mockHrUser, 'EMPLOYEE', 'EMPLOYEE_VIEW');
      expect(where).toEqual({ organizationId: 'org-1' });
    });

    it('should generate organizationId + departmentId/userId filter for TEAM scope', () => {
      const where = service.buildScopeWhereClause(mockManagerUser, 'EMPLOYEE', 'EMPLOYEE_VIEW');
      expect(where).toEqual({
        organizationId: 'org-1',
        OR: [{ userId: 'user-manager-1' }, { departmentId: 'dept-eng' }],
      });
    });

    it('should generate organizationId + userId filter for SELF scope', () => {
      const where = service.buildScopeWhereClause(mockEmployeeUser, 'EMPLOYEE', 'EMPLOYEE_VIEW');
      expect(where).toEqual({
        organizationId: 'org-1',
        userId: 'user-employee-1',
      });
    });
  });
});
