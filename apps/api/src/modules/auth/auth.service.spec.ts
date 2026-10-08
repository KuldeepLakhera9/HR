import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserStatus } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let passwordService: {
    verifyPassword: jest.Mock;
    hashPassword: jest.Mock;
    validatePasswordStrength: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
  };

  const mockUser = {
    id: 'usr_test_1',
    organizationId: 'org_test_1',
    employeeCode: 'EMP001',
    email: 'admin@peopleos.local',
    passwordHash: '$argon2id$mockhash',
    firstName: 'Vikram',
    lastName: 'Aditya',
    status: UserStatus.ACTIVE,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null as Date | null,
    deletedAt: null as Date | null,
    userRoles: [
      {
        role: {
          code: 'ADMIN',
          rolePermissions: [
            { permission: { code: 'org:read' } },
            { permission: { code: 'org:write' } },
          ],
        },
      },
    ],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    passwordService = {
      verifyPassword: jest.fn(),
      hashPassword: jest.fn(),
      validatePasswordStrength: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock_jwt_access_token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              const cfg: Record<string, unknown> = {
                JWT_SECRET: 'test_jwt_secret',
                JWT_EXPIRATION: '15m',
              };
              return cfg[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login()', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 0 });
      prisma.session.create.mockResolvedValue({
        id: 'ses_123',
        userId: mockUser.id,
      });

      const result = await service.login(
        { email: '   ADMIN@PeopleOS.Local  ', password: 'Password@123' },
        '127.0.0.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      );

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'admin@peopleos.local', deletedAt: null },
        }),
      );
      expect(result.accessToken).toBe('mock_jwt_access_token');
      expect(result.rawRefreshToken).toBeDefined();
      expect(result.user.email).toBe('admin@peopleos.local');
      expect(result.user.roles).toContain('ADMIN');
      expect(result.user.permissions).toContain('org:read');
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('should throw generic UnauthorizedException for non-existent email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'nonexistent@company.com', password: 'Password@123' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(passwordService.verifyPassword).toHaveBeenCalled();
    });

    it('should increment failedLoginAttempts on invalid password', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, failedLoginAttempts: 2 });
      passwordService.verifyPassword.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({});

      await expect(
        service.login({ email: 'admin@peopleos.local', password: 'WrongPassword' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({ failedLoginAttempts: 3, lockedUntil: null }),
        }),
      );
    });

    it('should trigger 15-minute account lockout upon 5th failed attempt', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, failedLoginAttempts: 4 });
      passwordService.verifyPassword.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({});

      await expect(
        service.login({ email: 'admin@peopleos.local', password: 'WrongPassword' }),
      ).rejects.toThrow(/Account has been temporarily locked/);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should prevent login while account is temporarily locked', async () => {
      const lockedDate = new Date(Date.now() + 10 * 60 * 1000); // locked for 10 more mins
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: lockedDate,
      });

      await expect(
        service.login({ email: 'admin@peopleos.local', password: 'Password@123' }),
      ).rejects.toThrow(/Account is temporarily locked/);

      expect(passwordService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should prevent login if user status is inactive or suspended', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
        isActive: false,
      });

      await expect(
        service.login({ email: 'admin@peopleos.local', password: 'Password@123' }),
      ).rejects.toThrow(/Account is inactive or suspended/);
    });
  });

  describe('refresh()', () => {
    it('should rotate refresh token and issue new access token on valid session', async () => {
      const mockSession = {
        id: 'ses_active',
        userId: mockUser.id,
        refreshTokenHash: service.hashToken('valid_refresh_token'),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: mockUser,
      };

      prisma.session.findUnique.mockResolvedValue(mockSession);
      prisma.session.update.mockResolvedValue({});

      const result = await service.refresh('valid_refresh_token');

      expect(result.accessToken).toBe('mock_jwt_access_token');
      expect(result.rawRefreshToken).toBeDefined();
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ses_active' },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
            lastUsedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should detect token reuse attack and revoke all sessions for the user', async () => {
      const revokedSession = {
        id: 'ses_compromised',
        userId: mockUser.id,
        refreshTokenHash: service.hashToken('reused_token'),
        revokedAt: new Date(), // Already revoked!
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: mockUser,
      };

      prisma.session.findUnique.mockResolvedValue(revokedSession);
      prisma.session.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh('reused_token')).rejects.toThrow(
        /Session token reuse detected/i,
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should reject expired session', async () => {
      const expiredSession = {
        id: 'ses_expired',
        userId: mockUser.id,
        refreshTokenHash: service.hashToken('expired_token'),
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // Expired!
        user: mockUser,
      };

      prisma.session.findUnique.mockResolvedValue(expiredSession);
      prisma.session.update.mockResolvedValue({});

      await expect(service.refresh('expired_token')).rejects.toThrow(/Session expired/i);
    });
  });

  describe('logout()', () => {
    it('should revoke active session', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('ses_to_logout');

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'ses_to_logout', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('getMe()', () => {
    it('should retrieve safe user profile with roles and permissions', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const me = await service.getMe(mockUser.id);

      expect(me.id).toBe(mockUser.id);
      expect(me.email).toBe(mockUser.email);
      expect(me.roles).toEqual(['ADMIN']);
      expect(me.permissions).toContain('org:read');
      expect((me as any).passwordHash).toBeUndefined();
    });
  });

  describe('changePassword()', () => {
    it('should update password and terminate other active sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);
      passwordService.hashPassword.mockResolvedValue('$argon2id$newhash');
      prisma.user.update.mockResolvedValue({});
      prisma.session.updateMany.mockResolvedValue({ count: 2 });

      await service.changePassword(mockUser.id, 'ses_current', {
        currentPassword: 'Password@123',
        newPassword: 'NewSecurePassword@2026',
      });

      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        'Password@123',
        mockUser.passwordHash,
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { passwordHash: '$argon2id$newhash' },
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          id: { not: 'ses_current' },
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it('should reject password change when current password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.changePassword(mockUser.id, 'ses_current', {
          currentPassword: 'WrongCurrentPassword',
          newPassword: 'NewSecurePassword@2026',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
