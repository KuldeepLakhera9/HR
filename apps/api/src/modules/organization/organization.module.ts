import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OrganizationService } from './organization.service';
import {
  OrganizationsController,
  OrganizationLegacyController,
  BranchesController,
  DepartmentsController,
  DesignationsController,
} from './organization.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    OrganizationsController,
    OrganizationLegacyController,
    BranchesController,
    DepartmentsController,
    DesignationsController,
  ],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
