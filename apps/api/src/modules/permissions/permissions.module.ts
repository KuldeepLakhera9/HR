import { Controller, Get, Param, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve all defined system permissions in RESOURCE_ACTION format
   */
  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Retrieve permissions by functional module
   */
  async findByModule(module: string) {
    return this.prisma.permission.findMany({
      where: { module: module.toUpperCase() },
      orderBy: { code: 'asc' },
    });
  }
}

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('ROLE_VIEW')
  @ApiOperation({ summary: 'List granular permission catalog' })
  async findAll() {
    const data = await this.permissionsService.findAll();
    return {
      message: 'Permissions catalog retrieved',
      data,
    };
  }

  @Get('module/:module')
  @RequirePermissions('ROLE_VIEW')
  @ApiOperation({ summary: 'List permissions for a specific module' })
  async findByModule(@Param('module') module: string) {
    const data = await this.permissionsService.findByModule(module);
    return {
      message: `Permissions for module '${module}' retrieved`,
      data,
    };
  }
}

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, RolesGuard, PermissionsGuard],
  exports: [PermissionsService],
})
export class PermissionsModule {}
