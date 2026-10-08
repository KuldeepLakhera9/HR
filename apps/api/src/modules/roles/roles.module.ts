import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Injectable,
  Module,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the exactly four primary application roles with their active permissions
   */
  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.userRoles,
      permissions: role.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
      })),
      createdAt: role.createdAt,
    }));
  }

  /**
   * Find role by code
   */
  async findByCode(code: RoleCode) {
    const role = await this.prisma.role.findFirst({
      where: { code },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with code '${code}' not found`);
    }

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.userRoles,
      permissions: role.rolePermissions.map((rp) => rp.permission.code),
    };
  }

  /**
   * Assign permissions to a role (Admin only)
   */
  async assignPermissionsToRole(roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('Target role not found');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    // Remove existing mappings and insert new
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { roleId },
      }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.findByCode(role.code);
  }

  /**
   * Assign roles to a user (Admin only)
   */
  async assignRolesToUser(userId: string, roleCodes: RoleCode[], assignedBy?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
    });

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { userId },
      }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({
          userId,
          roleId: r.id,
          assignedBy: assignedBy ?? 'SYSTEM',
        })),
        skipDuplicates: true,
      }),
    ]);

    return {
      userId,
      roles: roleCodes,
    };
  }
}

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('ROLE_VIEW')
  @ApiOperation({ summary: 'List the four primary roles with permission sets' })
  async findAll() {
    const data = await this.rolesService.findAll();
    return {
      message: 'Roles retrieved successfully',
      data,
    };
  }

  @Get(':code')
  @RequirePermissions('ROLE_VIEW')
  @ApiOperation({ summary: 'Retrieve specific role details' })
  async findByCode(@Param('code') code: RoleCode) {
    const data = await this.rolesService.findByCode(code);
    return {
      message: 'Role details retrieved',
      data,
    };
  }

  @Put(':id/permissions')
  @Roles('ADMIN')
  @RequirePermissions('ROLE_UPDATE')
  @ApiOperation({ summary: 'Update permissions for a role (Admin only)' })
  async updatePermissions(
    @Param('id') id: string,
    @Body('permissionCodes') permissionCodes: string[],
  ) {
    const data = await this.rolesService.assignPermissionsToRole(id, permissionCodes || []);
    return {
      message: 'Role permissions updated successfully',
      data,
    };
  }

  @Post('users/:userId')
  @Roles('ADMIN')
  @RequirePermissions('USER_UPDATE')
  @ApiOperation({ summary: 'Assign roles to a user (Admin only)' })
  async assignUserRoles(
    @Param('userId') userId: string,
    @Body('roleCodes') roleCodes: RoleCode[],
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const data = await this.rolesService.assignRolesToUser(userId, roleCodes || [], admin.id);
    return {
      message: 'User roles updated successfully',
      data,
    };
  }
}

@Module({
  controllers: [RolesController],
  providers: [RolesService, RolesGuard, PermissionsGuard],
  exports: [RolesService],
})
export class RolesModule {}
