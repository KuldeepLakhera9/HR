import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtPayload, AuthenticatedUser } from '../interfaces/auth.interface';
import { RoleType } from '@hrms/types';
import { UserStatus } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'super-secret-hrms-jwt-token-change-in-production-min32chars',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    // 1. Verify user existence, active status, and not locked
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
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

    if (user.status !== UserStatus.ACTIVE || !user.isActive) {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    // 2. Verify session is still active and not revoked in database
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session expired or revoked. Please log in again.');
    }

    // 3. Extract roles and deduplicate permissions across all assigned roles
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
      organizationId: user.organizationId,
      branchId: user.branchId,
      departmentId: user.departmentId,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeCode: user.employeeCode,
      status: user.status as UserStatus,
      roles,
      permissions: Array.from(permissionsSet),
      sessionId: session.id,
    };
  }
}
