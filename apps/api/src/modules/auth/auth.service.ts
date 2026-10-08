import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { AuditService, AuthAuditEvent } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload, LoginResult, RefreshResult, SafeUser } from './interfaces/auth.interface';
import { RoleType } from '@hrms/types';
import { UserStatus } from '@prisma/client';

// Pre-computed dummy Argon2id hash for constant-time comparison when email is not found
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$RtLrf7yRIv58OUiRnn+C9Q$boeWAvt1AnaJGPdlZC7HXYBli7iUUUpX+uR22uWVeFI';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenTtlMs: number;
  private readonly maxFailedAttempts = 5;
  private readonly lockoutDurationMs = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {
    // 7 days default refresh token TTL
    this.refreshTokenTtlMs = 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Cryptographically hashes a raw token with SHA-256
   * Never stores raw tokens in persistent storage
   */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a cryptographically random raw refresh token
   */
  generateRawRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Extracts human-readable device identifier from User-Agent string
   */
  parseDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device';
    if (/mobile/i.test(userAgent)) return 'Mobile Device';
    if (/iPad|Tablet/i.test(userAgent)) return 'Tablet Device';
    if (/Macintosh|Mac OS/i.test(userAgent)) return 'macOS Workstation';
    if (/Windows/i.test(userAgent)) return 'Windows PC';
    if (/Linux/i.test(userAgent)) return 'Linux Workstation';
    return 'Web Browser';
  }

  /**
   * Authenticate user, evaluate lockouts, issue session and access/refresh tokens
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
    // 1. Normalize email
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 2. Find active user
    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Timing-attack mitigation: if user does not exist, run dummy verification
    if (!user) {
      await this.passwordService.verifyPassword('dummyPassword123', DUMMY_ARGON2_HASH);
      await this.auditService.record({
        action: AuthAuditEvent.LOGIN_FAILED,
        entity: 'Authentication',
        userId: null,
        ipAddress,
        userAgent,
        metadata: {
          email: normalizedEmail,
          reason: 'User not found or invalid credentials',
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Check temporary lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      await this.auditService.record({
        action: AuthAuditEvent.LOGIN_FAILED,
        entity: 'Authentication',
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          email: user.email,
          reason: 'Account is temporarily locked',
          remainingMinutes,
        },
      });
      throw new UnauthorizedException(
        `Account is temporarily locked due to multiple failed attempts. Please try again in ${remainingMinutes} minute(s).`,
      );
    }

    // 4. Check account status
    if (user.status !== UserStatus.ACTIVE || !user.isActive) {
      await this.auditService.record({
        action: AuthAuditEvent.LOGIN_FAILED,
        entity: 'Authentication',
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          email: user.email,
          status: user.status,
          reason: 'Account is inactive or suspended',
        },
      });
      throw new UnauthorizedException(
        'Account is inactive or suspended. Please contact HR administrator.',
      );
    }

    // 5. Verify password using Argon2id
    const isPasswordValid = await this.passwordService.verifyPassword(
      dto.password,
      user.passwordHash,
    );

    // 6. Handle failed attempts
    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const isLocked = newAttempts >= this.maxFailedAttempts;
      const lockedUntil = isLocked ? new Date(Date.now() + this.lockoutDurationMs) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil,
        },
      });

      if (isLocked) {
        await this.auditService.record({
          action: AuthAuditEvent.ACCOUNT_LOCKED,
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          organizationId: user.organizationId,
          ipAddress,
          userAgent,
          metadata: {
            email: user.email,
            failedAttempts: newAttempts,
            lockedUntil: lockedUntil?.toISOString(),
            durationMinutes: 15,
          },
        });

        await this.auditService.record({
          action: AuthAuditEvent.LOGIN_FAILED,
          entity: 'Authentication',
          entityId: user.id,
          userId: user.id,
          organizationId: user.organizationId,
          ipAddress,
          userAgent,
          metadata: {
            email: user.email,
            reason: 'Account locked due to consecutive failed attempts',
          },
        });

        throw new UnauthorizedException(
          'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.',
        );
      }

      await this.auditService.record({
        action: AuthAuditEvent.LOGIN_FAILED,
        entity: 'Authentication',
        entityId: user.id,
        userId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          email: user.email,
          reason: 'Incorrect password',
          failedAttempts: newAttempts,
        },
      });

      throw new UnauthorizedException('Invalid email or password');
    }

    // 7. Reset failed attempts after successful login & 8. Update lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress ?? null,
      },
    });

    // 9. Load roles & 10. Load permissions
    const roles = user.userRoles.map((ur) => ur.role.code as RoleType);
    const permissionsSet = new Set<string>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission?.code) {
          permissionsSet.add(rp.permission.code);
        }
      }
    }
    const permissions = Array.from(permissionsSet);

    // Audit Event: LOGIN_SUCCESS
    await this.auditService.record({
      action: AuthAuditEvent.LOGIN_SUCCESS,
      entity: 'Authentication',
      entityId: user.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        email: user.email,
        employeeCode: user.employeeCode,
        roles,
      },
    });

    // 11. Create a session with hashed refresh token
    const rawRefreshToken = this.generateRawRefreshToken();
    const refreshTokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);
    const deviceName = this.parseDeviceName(userAgent);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        deviceName,
      },
    });

    // Audit Event: SESSION_CREATED
    await this.auditService.record({
      action: AuthAuditEvent.SESSION_CREATED,
      entity: 'Session',
      entityId: session.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        sessionId: session.id,
        deviceName,
        expiresAt: session.expiresAt?.toISOString
          ? session.expiresAt.toISOString()
          : expiresAt.toISOString(),
      },
    });

    // 12. Generate short-lived access token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      roles,
      sessionId: session.id,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '15m'),
    });

    // 16. Return safe user/session information
    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeCode: user.employeeCode,
      organizationId: user.organizationId,
      branchId: user.branchId,
      departmentId: user.departmentId,
      status: user.status as UserStatus,
      roles,
      permissions,
    };

    return {
      accessToken,
      rawRefreshToken,
      user: safeUser,
    };
  }

  /**
   * Rotate refresh token and issue new access token
   * Detects and defends against token reuse attacks
   */
  async refresh(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    // 2. Hash supplied refresh token
    const refreshTokenHash = this.hashToken(rawRefreshToken);

    // 3. Find matching session in database
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Token reuse or non-existent session
    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh session. Please log in again.');
    }

    // Reuse detection: If session is already revoked, compromise detected!
    if (session.revokedAt !== null) {
      // Revoke all active sessions for this user for security defense
      await this.prisma.session.updateMany({
        where: {
          userId: session.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await this.auditService.record({
        action: AuthAuditEvent.SESSION_REVOKED,
        entity: 'Session',
        entityId: session.id,
        userId: session.userId,
        organizationId: session.user?.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          sessionId: session.id,
          reason: 'Token reuse compromise alert - all active sessions terminated',
        },
      });

      throw new UnauthorizedException(
        'Security alert: Session token reuse detected. All sessions terminated. Please re-authenticate.',
      );
    }

    // 4. Verify expiry
    if (session.expiresAt <= new Date()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      await this.auditService.record({
        action: AuthAuditEvent.SESSION_REVOKED,
        entity: 'Session',
        entityId: session.id,
        userId: session.userId,
        organizationId: session.user?.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          sessionId: session.id,
          reason: 'Session expired',
        },
      });

      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    // Verify user is active
    const user = session.user;
    if (user.deletedAt !== null || user.status !== UserStatus.ACTIVE || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or disabled.');
    }

    // 5. Rotate refresh token & 6. Update session
    const newRawRefreshToken = this.generateRawRefreshToken();
    const newRefreshTokenHash = this.hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + this.refreshTokenTtlMs);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
        expiresAt: newExpiresAt,
        ipAddress: ipAddress ?? session.ipAddress,
        userAgent: userAgent ?? session.userAgent,
      },
    });

    // Audit Event: SESSION_CREATED (Rotated Token)
    await this.auditService.record({
      action: AuthAuditEvent.SESSION_CREATED,
      entity: 'Session',
      entityId: session.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        sessionId: session.id,
        action: 'Rotated refresh token',
      },
    });

    // 7. Issue new access token
    const roles = user.userRoles.map((ur) => ur.role.code as RoleType);
    const permissionsSet = new Set<string>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission?.code) {
          permissionsSet.add(rp.permission.code);
        }
      }
    }
    const permissions = Array.from(permissionsSet);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      roles,
      sessionId: session.id,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '15m'),
    });

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeCode: user.employeeCode,
      organizationId: user.organizationId,
      branchId: user.branchId,
      departmentId: user.departmentId,
      status: user.status as UserStatus,
      roles,
      permissions,
    };

    return {
      accessToken,
      rawRefreshToken: newRawRefreshToken,
      user: safeUser,
    };
  }

  /**
   * Revoke current active session
   */
  async logout(
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
    userId?: string,
  ): Promise<void> {
    if (!sessionId) return;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        user: { select: { organizationId: true } },
      },
    });

    const effectiveUserId = userId || session?.userId;
    const organizationId = session?.user?.organizationId;

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (effectiveUserId) {
      // Audit Event: LOGOUT
      await this.auditService.record({
        action: AuthAuditEvent.LOGOUT,
        entity: 'Authentication',
        entityId: sessionId,
        userId: effectiveUserId,
        organizationId,
        ipAddress,
        userAgent,
        metadata: {
          sessionId,
        },
      });

      // Audit Event: SESSION_REVOKED
      await this.auditService.record({
        action: AuthAuditEvent.SESSION_REVOKED,
        entity: 'Session',
        entityId: sessionId,
        userId: effectiveUserId,
        organizationId,
        ipAddress,
        userAgent,
        metadata: {
          sessionId,
          reason: 'User logged out',
        },
      });
    }
  }

  /**
   * Retrieve current authenticated user profile
   */
  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    const roles = user.userRoles.map((ur) => ur.role.code as RoleType);
    const permissionsSet = new Set<string>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        if (rp.permission?.code) {
          permissionsSet.add(rp.permission.code);
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeCode: user.employeeCode,
      organizationId: user.organizationId,
      branchId: user.branchId,
      departmentId: user.departmentId,
      status: user.status as UserStatus,
      roles,
      permissions: Array.from(permissionsSet),
    };
  }

  /**
   * Change user password, verify current password, and revoke other sessions
   */
  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User account not found');
    }

    // 1. Verify current password
    const isCurrentValid = await this.passwordService.verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentValid) {
      throw new BadRequestException('Current password does not match');
    }

    // 2. Validate and hash new password
    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    // 3. Update password in database
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // 4. Revoke all other active sessions for this user except current session
    await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // Audit Event: PASSWORD_CHANGED
    await this.auditService.record({
      action: AuthAuditEvent.PASSWORD_CHANGED,
      entity: 'User',
      entityId: userId,
      userId,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        changedAt: new Date().toISOString(),
      },
    });

    // Audit Event: SESSION_REVOKED (Other active sessions terminated)
    await this.auditService.record({
      action: AuthAuditEvent.SESSION_REVOKED,
      entity: 'Session',
      entityId: null,
      userId,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        reason: 'Password changed - other active sessions terminated',
        retainedSessionId: currentSessionId,
      },
    });
  }

  /**
   * Request password reset token.
   * Responds with a generic message to prevent email enumeration attacks.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const genericResponse = {
      message: 'If an account with that email exists, password reset instructions have been sent.',
    };

    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    // If user does not exist, return generic message without dispatching email
    if (!user) {
      return genericResponse;
    }

    // Generate cryptographically secure reset token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    // Invalidate/remove previous unused reset tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    });

    // Store only the SHA-256 token hash in persistent database
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Dispatch email (dev console or corporate SMTP)
    try {
      await this.mailService.sendPasswordResetEmail(user.email, rawToken, user.firstName);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${user.email}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }

    // Audit Event: PASSWORD_RESET_REQUESTED
    await this.auditService.record({
      action: AuthAuditEvent.PASSWORD_RESET_REQUESTED,
      entity: 'Authentication',
      entityId: user.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        email: user.email,
        expiresInMinutes: 60,
      },
    });

    return genericResponse;
  }

  /**
   * Reset user password using verified reset token.
   * Enforces single-use, expiration, Argon2id hashing, and revokes all active sessions.
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    // 1. Validate password strength requirements
    this.passwordService.validatePasswordStrength(dto.newPassword);

    // 2. Hash raw token using SHA-256 for database lookup
    const tokenHash = this.hashToken(dto.token.trim());

    // 3. Find token in database
    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 4. Verify one-time use
    if (resetRecord.usedAt !== null) {
      throw new BadRequestException('Password reset token has already been used');
    }

    // 5. Verify expiration
    if (resetRecord.expiresAt < new Date()) {
      throw new BadRequestException('Password reset token has expired');
    }

    // 6. Verify associated user account
    if (!resetRecord.user || resetRecord.user.deletedAt !== null) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    // 7. Hash new password with Argon2id
    const newPasswordHash = await this.passwordService.hashPassword(dto.newPassword);

    // 8. Atomically invalidate token, update password, and revoke all active sessions
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: {
          usedAt: now,
        },
      }),
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash: newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.session.updateMany({
        where: {
          userId: resetRecord.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    // Audit Event: PASSWORD_RESET_COMPLETED
    await this.auditService.record({
      action: AuthAuditEvent.PASSWORD_RESET_COMPLETED,
      entity: 'User',
      entityId: resetRecord.userId,
      userId: resetRecord.userId,
      organizationId: resetRecord.user?.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        resetAt: now.toISOString(),
      },
    });

    // Audit Event: SESSION_REVOKED (All sessions terminated after password reset)
    await this.auditService.record({
      action: AuthAuditEvent.SESSION_REVOKED,
      entity: 'Session',
      entityId: null,
      userId: resetRecord.userId,
      organizationId: resetRecord.user?.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        reason: 'Password reset completed - all active sessions terminated',
      },
    });

    return {
      message:
        'Password has been successfully reset. You may now sign in with your new credentials.',
    };
  }
}
