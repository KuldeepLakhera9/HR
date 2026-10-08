import { Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Injectable()
export class DocumentsService {
  async getDocuments() {
    return [
      {
        id: 'doc-1',
        title: 'Employee Handbook 2026',
        category: 'Policy',
        size: '2.4 MB',
        updatedAt: '2026-09-15',
      },
      {
        id: 'doc-2',
        title: 'Attendance & Remote Work Policy',
        category: 'Policy',
        size: '1.1 MB',
        updatedAt: '2026-10-01',
      },
      {
        id: 'doc-3',
        title: 'Travel & Official Visit Guidelines',
        category: 'Compliance',
        size: '840 KB',
        updatedAt: '2026-09-20',
      },
    ];
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @RequirePermissions('DOCUMENT_VIEW')
  @ApiOperation({ summary: 'List organization and policy documents' })
  async getDocuments() {
    const data = await this.documentsService.getDocuments();
    return {
      message: 'Documents list retrieved',
      data,
    };
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
