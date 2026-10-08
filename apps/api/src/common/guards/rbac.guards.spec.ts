import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { UserStatus } from '@hrms/types';
import { AuthenticatedUser } from '../../modules/auth/interfaces/auth.interface';

describe('RBAC & Permission Guards', () => {
  let reflector: Reflector;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;

  const createMockContext = (user?: Partial<AuthenticatedUser>): ExecutionContext => {
    const mockRequest = { user };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);
  });

  describe('RolesGuard', () => {
    it('should allow access when no roles are required on route', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext();

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException for unauthenticated request without user', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext(undefined);

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(context)).toThrow(/required application role/i);
    });

    it('should allow Admin access to Admin-protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext({
        id: 'usr_admin',
        roles: ['ADMIN'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow HR access to HR-protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['HR']);
      const context = createMockContext({
        id: 'usr_hr',
        roles: ['HR'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow Manager access to Manager-protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MANAGER']);
      const context = createMockContext({
        id: 'usr_mgr',
        roles: ['MANAGER'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow Employee access to Employee-protected routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['EMPLOYEE']);
      const context = createMockContext({
        id: 'usr_emp',
        roles: ['EMPLOYEE'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should reject invalid role with ForbiddenException', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
      const context = createMockContext({
        id: 'usr_emp',
        roles: ['EMPLOYEE'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(context)).toThrow(/requires one of the following roles/i);
    });

    it('should grant access if user has one of multiple permitted roles', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'HR']);
      const context = createMockContext({
        id: 'usr_hr',
        roles: ['HR'],
        status: 'ACTIVE' as UserStatus,
      });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });
  });

  describe('PermissionsGuard', () => {
    it('should allow access when no permissions are required on route', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext();

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('should throw ForbiddenException for unauthenticated request without user', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['USER_VIEW']);
      const context = createMockContext(undefined);

      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(context)).toThrow(/required privilege/i);
    });

    it('should allow Admin possessing all system permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['USER_DELETE', 'ROLE_UPDATE']);
      const context = createMockContext({
        id: 'usr_admin',
        roles: ['ADMIN'],
        permissions: ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'ROLE_UPDATE'],
      });

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('should allow HR possessing HR-related permissions', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['EMPLOYEE_CREATE', 'LEAVE_APPROVE']);
      const context = createMockContext({
        id: 'usr_hr',
        roles: ['HR'],
        permissions: ['EMPLOYEE_VIEW', 'EMPLOYEE_CREATE', 'LEAVE_APPROVE'],
      });

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('should allow Manager possessing team-management permissions', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['ATTENDANCE_APPROVE', 'LEAVE_APPROVE']);
      const context = createMockContext({
        id: 'usr_mgr',
        roles: ['MANAGER'],
        permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_APPROVE', 'LEAVE_APPROVE'],
      });

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('should allow Employee possessing self-service permissions', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['ATTENDANCE_MARK', 'LEAVE_APPLY']);
      const context = createMockContext({
        id: 'usr_emp',
        roles: ['EMPLOYEE'],
        permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_MARK', 'LEAVE_APPLY'],
      });

      expect(permissionsGuard.canActivate(context)).toBe(true);
    });

    it('should reject request when user is missing required permission', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['USER_DELETE']);
      const context = createMockContext({
        id: 'usr_emp',
        roles: ['EMPLOYEE'],
        permissions: ['ATTENDANCE_MARK', 'LEAVE_APPLY'],
      });

      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        /Missing required permission\(s\): \[USER_DELETE\]/i,
      );
    });

    it('should accurately list all missing permissions when multiple are required', () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['LEAVE_APPROVE', 'REPORT_EXPORT']);
      const context = createMockContext({
        id: 'usr_emp',
        roles: ['EMPLOYEE'],
        permissions: ['LEAVE_APPLY'],
      });

      expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(context)).toThrow(/LEAVE_APPROVE, REPORT_EXPORT/);
    });
  });
});
