import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return [
      {
        id: '1',
        code: 'ADMIN',
        name: 'Admin',
        description: 'Full system administration & governance',
        isSystem: true,
      },
      {
        id: '2',
        code: 'HR',
        name: 'HR Operations',
        description: 'Employee master, leaves, attendance, documents',
        isSystem: true,
      },
      {
        id: '3',
        code: 'MANAGER',
        name: 'Team Manager',
        description: 'Team attendance, approvals, progress monitoring',
        isSystem: true,
      },
      {
        id: '4',
        code: 'EMPLOYEE',
        name: 'Employee',
        description: 'Personal workspace, attendance, leaves, visits',
        isSystem: true,
      },
    ];
  }
}

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: 'List all defined roles (Minimal 4 Roles for Phase 1)' })
  async findAll() {
    const data = await this.rolesService.findAll();
    return {
      message: 'Roles retrieved successfully',
      data,
    };
  }
}

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
