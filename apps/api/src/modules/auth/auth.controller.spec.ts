import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './interfaces/auth.interface';
import { UserStatus } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    getMe: jest.Mock;
    changePassword: jest.Mock;
  };

  const mockSafeUser = {
    id: 'usr_123',
    email: 'admin@peopleos.local',
    firstName: 'Vikram',
    lastName: 'Aditya',
    employeeCode: 'EMP001',
    organizationId: 'org_123',
    status: UserStatus.ACTIVE,
    roles: ['ADMIN' as const],
    permissions: ['org:read', 'org:write'],
  };

  const mockAuthenticatedUser: AuthenticatedUser = {
    ...mockSafeUser,
    sessionId: 'ses_123',
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      getMe: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /login', () => {
    it('should set HttpOnly refresh cookie and return access token and user', async () => {
      authService.login.mockResolvedValue({
        accessToken: 'access_jwt_token',
        rawRefreshToken: 'raw_refresh_token_hex',
        user: mockSafeUser,
      });

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.login(
        { email: 'admin@peopleos.local', password: 'Password@123' },
        '127.0.0.1',
        'Mozilla/5.0',
        mockRes,
      );

      expect(authService.login).toHaveBeenCalledWith(
        { email: 'admin@peopleos.local', password: 'Password@123' },
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'hrms_refresh_token',
        'raw_refresh_token_hex',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
        }),
      );
      expect(result.data.accessToken).toBe('access_jwt_token');
      expect(result.data.user.email).toBe('admin@peopleos.local');
    });
  });

  describe('POST /refresh', () => {
    it('should rotate refresh token and set new cookie', async () => {
      authService.refresh.mockResolvedValue({
        accessToken: 'new_access_jwt_token',
        rawRefreshToken: 'new_raw_refresh_hex',
        user: mockSafeUser,
      });

      const mockReq = {
        cookies: { hrms_refresh_token: 'existing_raw_token' },
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.refresh(
        mockReq,
        undefined,
        '127.0.0.1',
        'Mozilla/5.0',
        mockRes,
      );

      expect(authService.refresh).toHaveBeenCalledWith(
        'existing_raw_token',
        '127.0.0.1',
        'Mozilla/5.0',
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'hrms_refresh_token',
        'new_raw_refresh_hex',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
        }),
      );
      expect(result.data.accessToken).toBe('new_access_jwt_token');
    });

    it('should throw UnauthorizedException when no token is present', async () => {
      const mockReq = {
        cookies: {},
      } as unknown as Request;

      const mockRes = {
        cookie: jest.fn(),
      } as unknown as Response;

      await expect(
        controller.refresh(mockReq, undefined, '127.0.0.1', 'Mozilla/5.0', mockRes),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('POST /logout', () => {
    it('should revoke session and clear cookie', async () => {
      const mockRes = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(mockAuthenticatedUser, mockRes);

      expect(authService.logout).toHaveBeenCalledWith('ses_123');
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'hrms_refresh_token',
        expect.objectContaining({
          httpOnly: true,
          path: '/api/v1/auth',
        }),
      );
      expect(result.message).toBe('Logged out successfully');
    });
  });

  describe('GET /me', () => {
    it('should return user profile from service', async () => {
      authService.getMe.mockResolvedValue(mockSafeUser);

      const result = await controller.getMe(mockAuthenticatedUser);

      expect(authService.getMe).toHaveBeenCalledWith('usr_123');
      expect(result.data.email).toBe('admin@peopleos.local');
    });
  });

  describe('POST /change-password', () => {
    it('should invoke changePassword service method', async () => {
      authService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(mockAuthenticatedUser, {
        currentPassword: 'Password@123',
        newPassword: 'NewPassword@2026',
      });

      expect(authService.changePassword).toHaveBeenCalledWith('usr_123', 'ses_123', {
        currentPassword: 'Password@123',
        newPassword: 'NewPassword@2026',
      });
      expect(result.message).toContain('Password changed successfully');
    });
  });
});
