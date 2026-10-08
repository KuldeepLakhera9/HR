import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { AuditService, AuthAuditEvent } from '../audit/audit.service';
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
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let passwordService: {
    verifyPassword: jest.Mock;
    hashPassword: jest.Mock;
    validatePasswordStrength: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let mailService: {
    sendPasswordResetEmail: jest.Mock;
    sendMail: jest.Mock;
  };
  let auditService: {
    record: jest.Mock;
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
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    passwordService = {
      verifyPassword: jest.fn(),
      hashPassword: jest.fn(),
      validatePasswordStrength: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock_jwt_access_token'),
    };

    mailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendMail: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        { provide: AuditService, useValue: auditService },
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

  describe('forgotPassword()', () => {
    it('should generate secure token, store hash, and send email for valid user', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({
        id: 'prt_123',
        userId: mockUser.id,
        tokenHash: 'some_hash',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const response = await service.forgotPassword({
        email: 'admin@peopleos.local',
      });

      expect(response).toEqual({
        message:
          'If an account with that email exists, password reset instructions have been sent.',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          email: 'admin@peopleos.local',
          deletedAt: null,
        },
      });

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          usedAt: null,
        },
      });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        expect.any(String),
        mockUser.firstName,
      );
    });

    it('should return generic response and not send email if user does not exist (enumeration mitigation)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const response = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(response).toEqual({
        message:
          'If an account with that email exists, password reset instructions have been sent.',
      });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword()', () => {
    const rawToken = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
    let rawTokenHash: string;

    beforeEach(() => {
      rawTokenHash = service.hashToken(rawToken);
    });

    it('should successfully reset password for valid token (valid reset)', async () => {
      const resetRecord = {
        id: 'prt_valid_1',
        userId: mockUser.id,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes in future
        usedAt: null,
        user: mockUser,
      };

      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord);
      passwordService.validatePasswordStrength.mockReturnValue(true);
      passwordService.hashPassword.mockResolvedValue('$argon2id$new_secure_hash');
      prisma.passwordResetToken.update.mockResolvedValue({ ...resetRecord, usedAt: new Date() });
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        passwordHash: '$argon2id$new_secure_hash',
      });
      prisma.session.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.resetPassword({
        token: rawToken,
        newPassword: 'NewSecurePassword@2026',
      });

      expect(result.message).toContain('Password has been successfully reset');
      expect(passwordService.validatePasswordStrength).toHaveBeenCalledWith(
        'NewSecurePassword@2026',
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith('NewSecurePassword@2026');
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject reset when token is invalid or does not exist (invalid reset)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid_raw_token',
          newPassword: 'NewSecurePassword@2026',
        }),
      ).rejects.toThrow(new BadRequestException('Invalid or expired password reset token'));
    });

    it('should reject reset when token has expired (expired reset)', async () => {
      const expiredRecord = {
        id: 'prt_expired_1',
        userId: mockUser.id,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        usedAt: null,
        user: mockUser,
      };

      prisma.passwordResetToken.findUnique.mockResolvedValue(expiredRecord);

      await expect(
        service.resetPassword({
          token: rawToken,
          newPassword: 'NewSecurePassword@2026',
        }),
      ).rejects.toThrow(new BadRequestException('Password reset token has expired'));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject reset when token has already been used (reused reset token)', async () => {
      const usedRecord = {
        id: 'prt_used_1',
        userId: mockUser.id,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: new Date(Date.now() - 5 * 60 * 1000), // Already consumed
        user: mockUser,
      };

      prisma.passwordResetToken.findUnique.mockResolvedValue(usedRecord);

      await expect(
        service.resetPassword({
          token: rawToken,
          newPassword: 'NewSecurePassword@2026',
        }),
      ).rejects.toThrow(new BadRequestException('Password reset token has already been used'));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should revoke all existing active sessions upon password reset (session revocation)', async () => {
      const resetRecord = {
        id: 'prt_session_test',
        userId: mockUser.id,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
        user: mockUser,
      };

      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord);
      passwordService.validatePasswordStrength.mockReturnValue(true);
      passwordService.hashPassword.mockResolvedValue('$argon2id$hashed');

      await service.resetPassword({
        token: rawToken,
        newPassword: 'NewSecurePassword@2026',
      });

      // Verify transaction was called
      expect(prisma.$transaction).toHaveBeenCalled();
      // Verify prisma.session.updateMany was constructed with userId and revokedAt: null
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });
  });

  describe('Authentication Audit Logging', () => {
    it('should record LOGIN_SUCCESS and SESSION_CREATED on successful authentication', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 0 });
      prisma.session.create.mockResolvedValue({
        id: 'ses_audit_1',
        userId: mockUser.id,
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 604800000),
        deviceName: 'Windows PC',
      });

      await service.login(
        { email: 'admin@peopleos.local', password: 'ValidPassword@123' },
        '192.168.1.100',
        'Mozilla/5.0 (Windows NT 10.0)',
      );

      // Verify LOGIN_SUCCESS was audited
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.LOGIN_SUCCESS,
          userId: mockUser.id,
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          metadata: expect.objectContaining({
            email: mockUser.email,
          }),
        }),
      );

      // Verify SESSION_CREATED was audited
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.SESSION_CREATED,
          userId: mockUser.id,
          entityId: 'ses_audit_1',
        }),
      );
    });

    it('should record LOGIN_FAILED on invalid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 1 });

      await expect(
        service.login(
          { email: 'admin@peopleos.local', password: 'WrongPassword' },
          '10.0.0.5',
          'Mozilla/5.0',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.LOGIN_FAILED,
          userId: mockUser.id,
          ipAddress: '10.0.0.5',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });

    it('should record ACCOUNT_LOCKED when failed attempts reach threshold', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, failedLoginAttempts: 4 });
      passwordService.verifyPassword.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 900000),
      });

      await expect(
        service.login(
          { email: 'admin@peopleos.local', password: 'WrongPassword' },
          '10.0.0.5',
          'Mozilla/5.0',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.ACCOUNT_LOCKED,
          userId: mockUser.id,
          metadata: expect.objectContaining({
            failedAttempts: 5,
          }),
        }),
      );
    });

    it('should record LOGOUT and SESSION_REVOKED on logout', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'ses_logout_test',
        userId: mockUser.id,
        user: { organizationId: mockUser.organizationId },
      });
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('ses_logout_test', '10.0.0.5', 'Mozilla/5.0', mockUser.id);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.LOGOUT,
          userId: mockUser.id,
          entityId: 'ses_logout_test',
        }),
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.SESSION_REVOKED,
          userId: mockUser.id,
          entityId: 'ses_logout_test',
        }),
      );
    });

    it('should record PASSWORD_CHANGED and SESSION_REVOKED on password change', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);
      passwordService.hashPassword.mockResolvedValue('$argon2id$newhash');
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.session.updateMany.mockResolvedValue({ count: 2 });

      await service.changePassword(
        mockUser.id,
        'ses_current',
        {
          currentPassword: 'Password@123',
          newPassword: 'NewSecurePassword@2026',
        },
        '10.0.0.5',
        'Mozilla/5.0',
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.PASSWORD_CHANGED,
          userId: mockUser.id,
        }),
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.SESSION_REVOKED,
          userId: mockUser.id,
        }),
      );
    });

    it('should record PASSWORD_RESET_REQUESTED when password reset requested', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: 'prt_1' });

      await service.forgotPassword({ email: 'admin@peopleos.local' }, '10.0.0.5', 'Mozilla/5.0');

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.PASSWORD_RESET_REQUESTED,
          userId: mockUser.id,
          metadata: expect.objectContaining({
            email: mockUser.email,
          }),
        }),
      );
    });

    it('should record PASSWORD_RESET_COMPLETED and SESSION_REVOKED on reset', async () => {
      const rawToken = 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
      const rawTokenHash = service.hashToken(rawToken);
      const resetRecord = {
        id: 'prt_valid_1',
        userId: mockUser.id,
        tokenHash: rawTokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        usedAt: null,
        user: mockUser,
      };

      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRecord);
      passwordService.validatePasswordStrength.mockReturnValue(true);
      passwordService.hashPassword.mockResolvedValue('$argon2id$new_hash');

      await service.resetPassword(
        {
          token: rawToken,
          newPassword: 'NewSecurePassword@2026',
        },
        '10.0.0.5',
        'Mozilla/5.0',
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.PASSWORD_RESET_COMPLETED,
          userId: mockUser.id,
        }),
      );

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuthAuditEvent.SESSION_REVOKED,
          userId: mockUser.id,
        }),
      );
    });

    it('should never pass password, hashes, or tokens into audit metadata', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      passwordService.verifyPassword.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({ ...mockUser, failedLoginAttempts: 0 });
      prisma.session.create.mockResolvedValue({
        id: 'ses_1',
        userId: mockUser.id,
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 604800000),
      });

      await service.login({ email: 'admin@peopleos.local', password: 'SecretPassword123!' });

      for (const call of auditService.record.mock.calls) {
        const params = call[0];
        const stringified = JSON.stringify(params);
        expect(stringified).not.toContain('SecretPassword123!');
        expect(stringified).not.toContain(mockUser.passwordHash);
      }
    });
  });
});
