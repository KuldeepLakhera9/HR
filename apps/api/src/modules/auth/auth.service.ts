import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Check temporary lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new UnauthorizedException(
        `Account is temporarily locked due to multiple failed attempts. Please try again in ${remainingMinutes} minute(s).`,
      );
    }

    // 4. Check account status
    if (user.status !== UserStatus.ACTIVE || !user.isActive) {
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
        throw new UnauthorizedException(
          'Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.',
        );
      }

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
  async logout(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
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
  }
}
