import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';
import { DocumentsService } from './documents.service';
import { UploadEmployeeDocumentDto } from './dto/upload-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

function extractUserAgent(req: AuthenticatedRequest): string | undefined {
  const ua = req.headers['user-agent'];
  return Array.isArray(ua) ? ua[0] : ua;
}

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ===========================================================================
  // EMPLOYEE SELF-SERVICE ENDPOINTS (Derived from session, Own-Record Scoped)
  // ===========================================================================

  @Get('me')
  @ApiOperation({ summary: 'List personal employee documents with verification statuses' })
  @ApiResponse({ status: 200, description: 'Personal documents retrieved successfully' })
  async getMyDocuments(@Req() req: AuthenticatedRequest) {
    const data = await this.documentsService.getMyDocuments(req.user);
    return {
      success: true,
      message: 'Personal documents retrieved successfully',
      data,
    };
  }

  @Post('me/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a personal employee document to secure private storage' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentType', 'documentName'],
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', example: 'GOVT_ID' },
        documentName: { type: 'string', example: 'Passport Front & Back' },
        documentNumber: { type: 'string', example: 'A12345678' },
        issueDate: { type: 'string', example: '2024-01-01' },
        expiryDate: { type: 'string', example: '2034-01-01' },
      },
    },
  })
  async uploadMyDocument(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: any,
    @Body() dto: UploadEmployeeDocumentDto,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A valid document file is required for upload');
    }

    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const data = await this.documentsService.uploadMyDocument(
      req.user,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      dto,
      clientIp,
      userAgent,
    );

    return {
      success: true,
      message: 'Document uploaded successfully and queued for verification',
      data,
    };
  }

  @Get('me/:id/download')
  @ApiOperation({ summary: 'Download personal document file (attachment stream)' })
  async downloadMyDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Res() res: Response,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const result = await this.documentsService.streamDocumentForEmployee(
      req.user,
      documentId,
      'DOWNLOAD',
      clientIp,
      userAgent,
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    result.stream.pipe(res);
  }

  @Get('me/:id/preview')
  @ApiOperation({ summary: 'Preview personal document in-browser (inline stream)' })
  async previewMyDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Res() res: Response,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const result = await this.documentsService.streamDocumentForEmployee(
      req.user,
      documentId,
      'PREVIEW',
      clientIp,
      userAgent,
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `inline; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });

    result.stream.pipe(res);
  }

  @Delete('me/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete unverified personal document' })
  async deleteMyDocument(@Req() req: AuthenticatedRequest, @Param('id') documentId: string) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const result = await this.documentsService.deleteMyDocument(
      req.user,
      documentId,
      clientIp,
      userAgent,
    );

    return {
      success: true,
      message: result.message,
    };
  }

  // ===========================================================================
  // COMPANY POLICIES & HANDBOOKS (Preserved publication route)
  // ===========================================================================

  @Get('policies')
  @ApiOperation({ summary: 'List organization company policies and statutory handbooks' })
  async getCompanyPolicies() {
    const data = await this.documentsService.getCompanyPolicies();
    return {
      success: true,
      message: 'Company policies retrieved successfully',
      data,
    };
  }

  // Backwards-compatible alias for existing /documents endpoint
  @Get()
  @ApiOperation({ summary: 'Default documents endpoint (Company Policies)' })
  async getDocumentsDefault() {
    const data = await this.documentsService.getCompanyPolicies();
    return {
      success: true,
      message: 'Documents list retrieved',
      data,
    };
  }

  // ===========================================================================
  // HR / ADMIN MANAGEMENT ENDPOINTS
  // ===========================================================================

  @Get('employee/:employeeId')
  @RequirePermissions('DOCUMENT_VIEW')
  @ApiOperation({ summary: 'List documents for a target employee (HR/Admin)' })
  async getEmployeeDocuments(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') employeeId: string,
  ) {
    const data = await this.documentsService.getEmployeeDocumentsForHR(req.user, employeeId);
    return {
      success: true,
      message: 'Employee documents retrieved successfully',
      data,
    };
  }

  @Get('employee/:employeeId/:id/download')
  @RequirePermissions('DOCUMENT_VIEW')
  @ApiOperation({ summary: 'Download an employee document as HR reviewer' })
  async downloadEmployeeDocument(
    @Req() req: AuthenticatedRequest,
    @Param('employeeId') employeeId: string,
    @Param('id') documentId: string,
    @Res() res: Response,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const result = await this.documentsService.streamDocumentForHR(
      req.user,
      employeeId,
      documentId,
      clientIp,
      userAgent,
    );

    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Content-Length': result.fileSize,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });

    result.stream.pipe(res);
  }

  @Post(':id/verify')
  @Roles('HR', 'ADMIN')
  @ApiOperation({ summary: 'Verify or reject an employee document with reviewer feedback' })
  async verifyDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id') documentId: string,
    @Body() dto: VerifyDocumentDto,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const data = await this.documentsService.verifyDocument(
      req.user,
      documentId,
      dto,
      clientIp,
      userAgent,
    );

    return {
      success: true,
      message: `Document successfully ${dto.decision.toLowerCase()}`,
      data,
    };
  }
}
