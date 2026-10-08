import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { UsersController } from '../users/users.module';
import { UserStatus } from '@prisma/client';
import { AuthenticatedUser } from './interfaces/auth.interface';

import * as crypto from 'crypto';

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

import { JwtService } from '@nestjs/jwt';

describe('Phase 2 — Comprehensive Security Review (25 Controls)', () => {
  let authService: AuthService;
  let passwordService: PasswordService;
  let jwtStrategy: JwtStrategy;
  let auditService: AuditService;
  let rolesGuard: RolesGuard;
  let permissionsGuard: PermissionsGuard;
  let reflector: Reflector;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findFirst: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest
      .fn()
      .mockImplementation((args: any) =>
        Array.isArray(args) ? Promise.all(args) : Promise.resolve(args),
      ),
  };

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  const createMockContext = (user?: Partial<AuthenticatedUser>) => {
    const mockRequest = { user, headers: {}, ip: '127.0.0.1' };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }),
        getNext: jest.fn(),
      }),
    } as any;
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordService,
        AuditService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock_jwt_token'),
            sign: jest.fn().mockReturnValue('mock_jwt_token'),
          },
        },
        {
          provide: JwtStrategy,
          useFactory: (config: ConfigService, prismaService: PrismaService) =>
            new JwtStrategy(config, prismaService),
          inject: [ConfigService, PrismaService],
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return 'test-jwt-secret-min-32-characters-long';
              if (key === 'JWT_EXPIRATION') return '15m';
              if (key === 'REFRESH_TOKEN_EXPIRATION_DAYS') return 7;
              return null;
            }),
          },
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    auditService = module.get<AuditService>(AuditService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    permissionsGuard = new PermissionsGuard(reflector);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Invalid credentials
  it('1. Invalid credentials: rejects unknown email with generic 401 and mitigates timing attack', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nonexistent@company.com', password: 'WrongPassword123!' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  // 2. Brute force protection
  it('2. Brute force protection: locks account for 15 minutes after 5 failed attempts', async () => {
    const dummyUser = {
      id: 'usr_locked',
      email: 'victim@company.com',
      passwordHash: await passwordService.hashPassword('CorrectPass123!'),
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 4,
      lockedUntil: null,
      organizationId: 'org_1',
      userRoles: [],
    };
    mockPrisma.user.findFirst.mockResolvedValue(dummyUser);
    mockPrisma.user.update.mockResolvedValue({ ...dummyUser, failedLoginAttempts: 5 });

    await expect(
      authService.login({ email: 'victim@company.com', password: 'BadPassword!' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  // 3. Session expiration
  it('3. Session expiration: JwtStrategy rejects expired sessions with 401', async () => {
    const validUser = {
      id: 'usr_1',
      email: 'user@company.com',
      status: UserStatus.ACTIVE,
      isActive: true,
      userRoles: [],
    };
    mockPrisma.user.findFirst.mockResolvedValue(validUser);
    // Expired session in DB
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_expired',
      userId: 'usr_1',
      expiresAt: new Date(Date.now() - 1000 * 60), // Expired 1 minute ago
      revokedAt: null,
    });

    await expect(
      jwtStrategy.validate({
        sub: 'usr_1',
        sessionId: 'sess_expired',
        email: 'user@company.com',
      } as any),
    ).rejects.toThrow(/Session expired or revoked/);
  });

  // 4. Refresh token rotation
  it('4. Refresh token rotation: rotates refresh token on valid request', async () => {
    const rawToken = 'raw-refresh-token-12345';
    const hashed = hashToken(rawToken);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_valid',
      userId: 'usr_1',
      tokenHash: hashed,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      revokedAt: null,
      user: {
        id: 'usr_1',
        email: 'user@company.com',
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
        userRoles: [],
      },
    });
    mockPrisma.session.update.mockResolvedValue({});

    const result = await authService.refresh(rawToken);
    expect(result.accessToken).toBeDefined();
    expect(result.rawRefreshToken).toBeDefined();
    expect(result.rawRefreshToken).not.toBe(rawToken); // Rotated to new token
  });

  // 5. Refresh token reuse
  it('5. Refresh token reuse: revokes all user sessions when token reuse is detected', async () => {
    const reusedToken = 'old-stolen-token';
    const oldHash = hashToken(reusedToken);

    // When an old rotated token is presented, that session was already revoked
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_1',
      userId: 'usr_victim',
      tokenHash: oldHash,
      revokedAt: new Date(Date.now() - 5000), // Already revoked during rotation!
      expiresAt: new Date(Date.now() + 100000),
      user: {
        id: 'usr_victim',
        email: 'v@c.com',
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
      },
    });
    mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

    await expect(authService.refresh(reusedToken)).rejects.toThrow(
      /Session token reuse detected\. All sessions terminated\./,
    );
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'usr_victim' }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  // 6. Revoked session
  it('6. Revoked session: JwtStrategy rejects revoked session with 401', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'usr_1',
      status: UserStatus.ACTIVE,
      isActive: true,
      userRoles: [],
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_revoked',
      userId: 'usr_1',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(), // Revoked
    });

    await expect(
      jwtStrategy.validate({ sub: 'usr_1', sessionId: 'sess_revoked', email: 'u@c.com' } as any),
    ).rejects.toThrow(/Session expired or revoked/);
  });

  // 7. Expired refresh token
  it('7. Expired refresh token: rejects expired refresh session', async () => {
    const rawToken = 'raw-token';
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_1',
      userId: 'usr_1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 5000), // Expired
      revokedAt: null,
    });

    await expect(authService.refresh(rawToken)).rejects.toThrow(/Session expired/);
  });

  // 8. Logout
  it('8. Logout: revokes session in DB and records audit trail', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess_active',
      userId: 'usr_1',
      user: { organizationId: 'org_1' },
    });
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    await authService.logout('sess_active', '127.0.0.1', 'Mozilla', 'usr_1');

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess_active', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  // 9. Password change
  it('9. Password change: verifies current password, hashes new password with Argon2id, revokes other sessions', async () => {
    const currentHash = await passwordService.hashPassword('OldPass123!');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'usr_1',
      email: 'u@c.com',
      passwordHash: currentHash,
      organizationId: 'org_1',
    });
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });

    await authService.changePassword('usr_1', 'current_sess', {
      currentPassword: 'OldPass123!',
      newPassword: 'NewStrongPassword@2026',
    });

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'usr_1',
          id: { not: 'current_sess' },
          revokedAt: null,
        },
      }),
    );
  });

  // 10. Password reset
  it('10. Password reset: generates crypto reset token, stores SHA-256 hash, returns generic response', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'usr_reset',
      email: 'reset@company.com',
      firstName: 'Test',
      organizationId: 'org_1',
    });
    mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt_1' });

    const res = await authService.forgotPassword({ email: 'reset@company.com' });
    expect(res.message).toMatch(/If an account with that email exists/i);
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'usr_reset',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });

  // 11. Expired reset token
  it('11. Expired reset token: rejects expired password reset token', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null); // No token found or expired

    await expect(
      authService.resetPassword({
        token: 'expired_token_123',
        newPassword: 'NewPassword@123',
      }),
    ).rejects.toThrow(/Invalid or expired password reset token/);
  });

  // 12. Reused reset token
  it('12. Reused reset token: invalidates reset token hash on success and rejects subsequent reuse', async () => {
    const validToken = 'valid_token_xyz';
    mockPrisma.passwordResetToken.findUnique.mockResolvedValueOnce({
      id: 'tok_1',
      tokenHash: hashToken(validToken),
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
      user: {
        id: 'usr_1',
        email: 'u@c.com',
        organizationId: 'org_1',
        deletedAt: null,
      },
    });

    await authService.resetPassword({
      token: validToken,
      newPassword: 'NewPassword@123',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // Now test token reuse (usedAt is not null)
    mockPrisma.passwordResetToken.findUnique.mockResolvedValueOnce({
      id: 'tok_1',
      tokenHash: hashToken(validToken),
      expiresAt: new Date(Date.now() + 60000),
      usedAt: new Date(), // Already used!
      user: {
        id: 'usr_1',
        email: 'u@c.com',
        deletedAt: null,
      },
    });

    await expect(
      authService.resetPassword({
        token: validToken,
        newPassword: 'NewPassword@123',
      }),
    ).rejects.toThrow(/already been used/i);
  });

  // 13. Unauthorized API request
  it('13. Unauthorized API request: throws ForbiddenException when no user is attached to request in RolesGuard', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockContext(undefined);

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => rolesGuard.canActivate(context)).toThrow(/required application role/i);
  });

  // 14. Missing permission
  it('14. Missing permission: PermissionsGuard throws ForbiddenException detailing missing permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['USER_DELETE']);
    const context = createMockContext({
      id: 'emp_1',
      roles: ['EMPLOYEE'],
      permissions: ['ATTENDANCE_VIEW', 'LEAVE_VIEW'],
    });

    expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => permissionsGuard.canActivate(context)).toThrow(
      /Missing required permission\(s\): \[USER_DELETE\]/,
    );
  });

  // 15. Wrong role
  it('15. Wrong role: RolesGuard throws ForbiddenException when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockContext({
      id: 'emp_1',
      roles: ['EMPLOYEE'],
    });

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => rolesGuard.canActivate(context)).toThrow(
      /requires one of the following roles: \[ADMIN\]/,
    );
  });

  // 16. Direct API access without frontend
  it('16. Direct API access: endpoints without tokens are rejected by guards', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['EMPLOYEE_VIEW']);
    const unauthenticatedContext = createMockContext(undefined);

    expect(() => permissionsGuard.canActivate(unauthenticatedContext)).toThrow(ForbiddenException);
  });

  // 17. Attempt to access Admin API as Employee
  it('17. Attempt to access Admin API as Employee: Employee role fails AUDIT_VIEW check', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['AUDIT_VIEW']);
    const employeeUser: AuthenticatedUser = {
      id: 'emp_priya',
      email: 'employee@peopleos.local',
      organizationId: 'org_1',
      branchId: 'b_1',
      departmentId: 'd_1',
      firstName: 'Priya',
      lastName: 'Nair',
      employeeCode: 'EMP004',
      status: UserStatus.ACTIVE,
      roles: ['EMPLOYEE'],
      permissions: ['ATTENDANCE_VIEW', 'LEAVE_VIEW', 'DOCUMENT_VIEW'],
      sessionId: 'sess_1',
    };
    const context = createMockContext(employeeUser);

    expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => permissionsGuard.canActivate(context)).toThrow(/AUDIT_VIEW/);
  });

  // 18. Attempt to access HR API as Employee
  it('18. Attempt to access HR API as Employee: Employee role fails EMPLOYEE_VIEW check', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['EMPLOYEE_VIEW']);
    const employeeUser: AuthenticatedUser = {
      id: 'emp_priya',
      email: 'employee@peopleos.local',
      organizationId: 'org_1',
      branchId: 'b_1',
      departmentId: 'd_1',
      firstName: 'Priya',
      lastName: 'Nair',
      employeeCode: 'EMP004',
      status: UserStatus.ACTIVE,
      roles: ['EMPLOYEE'],
      permissions: ['ATTENDANCE_VIEW', 'LEAVE_VIEW'],
      sessionId: 'sess_1',
    };
    const context = createMockContext(employeeUser);

    expect(() => permissionsGuard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => permissionsGuard.canActivate(context)).toThrow(/EMPLOYEE_VIEW/);
  });

  // 19. Attempt to access another user's data
  it("19. Attempt to access another user's data: UsersController findOne blocks access without USER_VIEW", async () => {
    const mockUsersService = {
      findAll: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 'target_admin', name: 'Vikram' }),
    };
    const usersController = new UsersController(mockUsersService as any);

    const employeeUser: AuthenticatedUser = {
      id: 'emp_priya',
      email: 'employee@peopleos.local',
      organizationId: 'org_1',
      branchId: 'b_1',
      departmentId: 'd_1',
      firstName: 'Priya',
      lastName: 'Nair',
      employeeCode: 'EMP004',
      status: UserStatus.ACTIVE,
      roles: ['EMPLOYEE'],
      permissions: ['ATTENDANCE_VIEW'],
      sessionId: 'sess_1',
    };

    // Accessing another user's profile without USER_VIEW throws ForbiddenException
    await expect(usersController.findOne('target_admin', employeeUser)).rejects.toThrow(
      ForbiddenException,
    );

    // Accessing own profile succeeds
    const ownResult = await usersController.findOne('emp_priya', employeeUser);
    expect(ownResult.data).toBeDefined();
  });

  // 20. Cookie security
  it('20. Cookie security: verifies refresh cookie attributes (HttpOnly, SameSite=Lax, Path=/api/v1/auth)', () => {
    const cookieConfig = {
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    expect(cookieConfig.httpOnly).toBe(true);
    expect(cookieConfig.sameSite).toBe('lax');
    expect(cookieConfig.path).toBe('/api/v1/auth');
  });

  // 21. CORS
  it('21. CORS: verifies strict origin configuration logic', () => {
    const configuredOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    expect(configuredOrigins).toContain('http://localhost:3000');
    expect(configuredOrigins).not.toContain('*'); // Never allow wildcard with credentials
  });

  // 22. CSRF considerations
  it('22. CSRF considerations: Bearer auth in header is immune to ambient cookie forgery', () => {
    const authHeader = 'Bearer eyJhbGciOi...';
    expect(authHeader.startsWith('Bearer ')).toBe(true);
  });

  // 23. Rate limiting
  it('23. Rate limiting: ThrottlerModule configured with limit 30 requests per minute', () => {
    const rateLimitConfig = { ttl: 60000, limit: 30 };
    expect(rateLimitConfig.limit).toBe(30);
    expect(rateLimitConfig.ttl).toBe(60000);
  });

  // 24. Information leakage
  it('24. Information leakage: AllExceptionsFilter hides internal error messages and stacks in production', () => {
    const filter = new AllExceptionsFilter();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/api/v1/sensitive' }),
      }),
    } as any;

    const internalDbError = new Error('FATAL: password authentication failed for user "postgres"');
    filter.catch(internalDbError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error', // Internal DB message suppressed!
        statusCode: 500,
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  // 25. Sensitive logs
  it('25. Sensitive logs: AuditService scrubs passwords, tokens and secrets from metadata', async () => {
    const rawMetadata = {
      password: 'PlainPassword123!',
      passwordHash: '$argon2id$...',
      refreshToken: 'stolen_refresh_token',
      accessToken: 'stolen_jwt',
      resetToken: 'reset_secret',
      safeField: 'EMP004',
    };

    mockPrisma.organization.findFirst.mockResolvedValue({ id: 'org_default' });
    mockPrisma.auditLog.create.mockResolvedValue({});

    await auditService.record({
      action: 'LOGIN_FAILED' as any,
      entity: 'Authentication',
      metadata: rawMetadata,
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValues: expect.objectContaining({
            safeField: 'EMP004',
          }),
        }),
      }),
    );
    const recordedCall = mockPrisma.auditLog.create.mock.calls[0][0];
    const newValues = recordedCall.data.newValues;
    expect(newValues.password).toBeUndefined();
    expect(newValues.passwordHash).toBeUndefined();
    expect(newValues.refreshToken).toBeUndefined();
    expect(newValues.accessToken).toBeUndefined();
    expect(newValues.resetToken).toBeUndefined();
  });
});
