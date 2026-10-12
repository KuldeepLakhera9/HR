import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { UploadEmployeeDocumentDto } from './dto/upload-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import {
  EmployeeDocumentItem,
  EmployeeDocumentStats,
  DocumentVerificationStatus,
} from '@hrms/types';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

interface FileUploadPayload {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size: number;
}

interface StreamFileResult {
  stream: fs.ReadStream;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly storageRoot: string;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Megabytes

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.storageRoot =
      process.env.SECURE_DOCUMENT_STORAGE_DIR || path.resolve(process.cwd(), 'storage/documents');
    this.ensureStorageDirectoryExists(this.storageRoot);
  }

  /**
   * Helper: Recursively ensure directory exists on disk
   */
  private ensureStorageDirectoryExists(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch (err: any) {
      this.logger.error(`Failed to initialize secure storage directory: ${err.message}`);
    }
  }

  /**
   * Canonical path resolution with strict path traversal prevention
   */
  private getCanonicalStoragePath(
    organizationId: string,
    employeeId: string,
    documentId: string,
  ): string {
    const root = path.resolve(this.storageRoot);
    const resolvedPath = path.resolve(root, organizationId, employeeId, `${documentId}.bin`);

    if (!resolvedPath.startsWith(root)) {
      throw new ForbiddenException('Path traversal attempt detected');
    }

    return resolvedPath;
  }

  /**
   * Deep magic-byte validation matching buffer content to safe document types
   */
  private validateAndDetectMimeType(
    buffer: Buffer,
    originalname: string,
  ): { mimeType: string; cleanExt: string } {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty');
    }

    if (buffer.length > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum permitted threshold of 10 MB (received ${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
      );
    }

    // 1. Disallow executable signatures (MZ for Windows EXE/DLL, ELF for Linux binaries)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestException('Executable files and scripts are strictly prohibited');
    }
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      throw new BadRequestException('Binary executable content is strictly prohibited');
    }

    // Disallow HTML/SVG scripts (XSS attack vectors)
    const headerSnippet = buffer.subarray(0, 512).toString('utf8').toLowerCase();
    if (
      headerSnippet.includes('<html') ||
      headerSnippet.includes('<svg') ||
      headerSnippet.includes('<script') ||
      headerSnippet.includes('<?php')
    ) {
      throw new BadRequestException('Scripts, HTML, or SVG files are not permitted');
    }

    const ext = path.extname(originalname).toLowerCase();

    // 2. Magic byte verification
    // PDF: %PDF- (0x25 0x50 0x44 0x46)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return { mimeType: 'application/pdf', cleanExt: '.pdf' };
    }

    // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47)
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { mimeType: 'image/png', cleanExt: '.png' };
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { mimeType: 'image/jpeg', cleanExt: '.jpg' };
    }

    // WebP: RIFF ... WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { mimeType: 'image/webp', cleanExt: '.webp' };
    }

    // DOCX (ZIP archive with PK\x03\x04: 0x50 0x4B 0x03 0x04)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04 &&
      (ext === '.docx' || ext === '.doc')
    ) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        cleanExt: '.docx',
      };
    }

    // Legacy DOC (Compound File Binary Format: 0xD0 0xCF 0x11 0xE0)
    if (
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      ext === '.doc'
    ) {
      return { mimeType: 'application/msword', cleanExt: '.doc' };
    }

    throw new BadRequestException(
      'Invalid file content or format. Allowed formats: PDF (.pdf), Images (.jpg, .jpeg, .png, .webp), Documents (.docx, .doc).',
    );
  }

  /**
   * Helper: Human readable file size
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Resolve employee record for authenticated session user
   */
  private async resolveEmployeeForUser(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No employee record linked to current user session.',
        code: 'EMPLOYEE_NOT_FOUND',
      });
    }

    return employee;
  }

  /**
   * Maps Prisma database record to secure client DTO
   */
  private mapDocumentRecord(doc: any, reviewerNotes?: string | null): EmployeeDocumentItem {
    const now = new Date();
    const expiry = doc.expiryDate ? new Date(doc.expiryDate) : null;
    const isExpired = expiry ? expiry < now : false;
    const isExpiringSoon = expiry
      ? !isExpired && expiry.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000
      : false;

    let status: DocumentVerificationStatus = 'PENDING';
    if (doc.isVerified) {
      status = 'VERIFIED';
    } else if (doc.verifiedAt && !doc.isVerified) {
      status = 'REJECTED';
    }

    return {
      id: doc.id,
      employeeId: doc.employeeId,
      documentType: doc.documentType,
      documentName: doc.documentName,
      documentNumber: doc.documentNumber,
      mimeType: doc.mimeType || 'application/octet-stream',
      fileSize: doc.fileSize || 0,
      fileSizeFormatted: this.formatFileSize(doc.fileSize || 0),
      issueDate: doc.issueDate ? doc.issueDate.toISOString().split('T')[0] : null,
      expiryDate: doc.expiryDate ? doc.expiryDate.toISOString().split('T')[0] : null,
      isExpired,
      isExpiringSoon,
      status,
      isVerified: doc.isVerified,
      verifiedAt: doc.verifiedAt ? doc.verifiedAt.toISOString() : null,
      verifiedByName: doc.verifiedById ? 'Authorized HR Reviewer' : null,
      reviewerNotes: reviewerNotes || null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      canDelete: !doc.isVerified, // Compliance & verified documents protected from arbitrary deletion
    };
  }

  // ===========================================================================
  // EMPLOYEE SELF-SERVICE METHODS
  // ===========================================================================

  /**
   * List authenticated employee's documents with permitted metadata
   */
  async getMyDocuments(user: AuthenticatedUser): Promise<{
    items: EmployeeDocumentItem[];
    stats: EmployeeDocumentStats;
  }> {
    const employee = await this.resolveEmployeeForUser(user);

    const docs = await this.prisma.employeeDocumentMetadata.findMany({
      where: {
        employeeId: employee.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Concurrently fetch recent audit decision notes for reviewed items
    const items = await Promise.all(
      docs.map(async (doc) => {
        let reviewerNotes: string | null = null;
        if (doc.verifiedAt) {
          const auditLog = await this.prisma.auditLog.findFirst({
            where: {
              organizationId: user.organizationId,
              entity: 'EmployeeDocumentMetadata',
              entityId: doc.id,
              action: {
                in: ['EMPLOYEE_DOCUMENT_VERIFIED', 'EMPLOYEE_DOCUMENT_REJECTED'],
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (auditLog?.newValues && typeof auditLog.newValues === 'object') {
            reviewerNotes = (auditLog.newValues as any).notes || null;
          }
        }
        return this.mapDocumentRecord(doc, reviewerNotes);
      }),
    );

    const stats: EmployeeDocumentStats = {
      total: items.length,
      verified: items.filter((d) => d.status === 'VERIFIED').length,
      pending: items.filter((d) => d.status === 'PENDING').length,
      rejected: items.filter((d) => d.status === 'REJECTED').length,
      expiringSoon: items.filter((d) => d.isExpiringSoon).length,
      expired: items.filter((d) => d.isExpired).length,
    };

    return { items, stats };
  }

  /**
   * Upload personal employee document into private storage vault
   */
  async uploadMyDocument(
    user: AuthenticatedUser,
    file: FileUploadPayload,
    dto: UploadEmployeeDocumentDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EmployeeDocumentItem> {
    const employee = await this.resolveEmployeeForUser(user);

    // 1. Strict File validation & Magic Bytes detection
    const { mimeType } = this.validateAndDetectMimeType(file.buffer, file.originalname);

    const documentId = crypto.randomUUID();
    const filePath = this.getCanonicalStoragePath(user.organizationId, employee.id, documentId);

    // 2. Ensure target directory exists
    const dir = path.dirname(filePath);
    this.ensureStorageDirectoryExists(dir);

    // 3. Atomically write buffer to private disk vault
    try {
      await fs.promises.writeFile(filePath, file.buffer, { mode: 0o600 });
    } catch (err: any) {
      this.logger.error(`Disk write failed for document ${documentId}: ${err.message}`);
      throw new InternalServerErrorException('Failed to securely store document on filesystem');
    }

    // 4. Create authoritative metadata record in database
    try {
      const created = await this.prisma.employeeDocumentMetadata.create({
        data: {
          id: documentId,
          employeeId: employee.id,
          documentType: dto.documentType,
          documentName: dto.documentName.trim(),
          documentNumber: dto.documentNumber?.trim() || null,
          fileUrl: `${user.organizationId}/${employee.id}/${documentId}.bin`,
          mimeType,
          fileSize: file.buffer.length,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          isVerified: false,
          verifiedAt: null,
          verifiedById: null,
        },
      });

      // 5. Audit Logging
      await this.audit.record({
        action: 'EMPLOYEE_DOCUMENT_UPLOAD',
        entity: 'EmployeeDocumentMetadata',
        entityId: created.id,
        userId: user.id,
        organizationId: user.organizationId,
        ipAddress,
        userAgent,
        metadata: {
          documentId: created.id,
          documentType: created.documentType,
          documentName: created.documentName,
          mimeType,
          fileSize: created.fileSize,
        },
      });

      return this.mapDocumentRecord(created);
    } catch (err: any) {
      // Clean up orphaned file on disk if DB transaction fails
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
      this.logger.error(`Metadata persistence failed for document ${documentId}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Stream authorized employee document for download or preview
   */
  async streamDocumentForEmployee(
    user: AuthenticatedUser,
    documentId: string,
    action: 'DOWNLOAD' | 'PREVIEW' = 'DOWNLOAD',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<StreamFileResult> {
    const employee = await this.resolveEmployeeForUser(user);

    // Enforce own-record ownership
    const doc = await this.prisma.employeeDocumentMetadata.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found or access denied');
    }

    const filePath = this.getCanonicalStoragePath(user.organizationId, employee.id, doc.id);

    if (!fs.existsSync(filePath)) {
      this.logger.error(`Storage asset missing on disk: ${filePath}`);
      throw new NotFoundException('Requested document file is missing from secure storage');
    }

    // Audit Logging
    await this.audit.record({
      action: action === 'DOWNLOAD' ? 'EMPLOYEE_DOCUMENT_DOWNLOAD' : 'EMPLOYEE_DOCUMENT_PREVIEW',
      entity: 'EmployeeDocumentMetadata',
      entityId: doc.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        documentId: doc.id,
        documentName: doc.documentName,
        action,
      },
    });

    const stream = fs.createReadStream(filePath);
    return {
      stream,
      mimeType: doc.mimeType || 'application/octet-stream',
      fileName: `${doc.documentName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      fileSize: doc.fileSize || 0,
    };
  }

  /**
   * Delete an unverified personal document
   */
  async deleteMyDocument(
    user: AuthenticatedUser,
    documentId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const employee = await this.resolveEmployeeForUser(user);

    const doc = await this.prisma.employeeDocumentMetadata.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found or access denied');
    }

    // Retention policy: Verified statutory/company documents cannot be unilaterally removed
    if (doc.isVerified) {
      throw new BadRequestException(
        'Verified compliance, identity, or official documents cannot be deleted directly. Please contact HR to request archiving or updates.',
      );
    }

    const filePath = this.getCanonicalStoragePath(user.organizationId, employee.id, doc.id);

    // Remove from database
    await this.prisma.employeeDocumentMetadata.delete({
      where: { id: doc.id },
    });

    // Remove from physical disk vault
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath).catch((err) => {
        this.logger.warn(`Could not unlink file ${filePath}: ${err.message}`);
      });
    }

    // Audit log
    await this.audit.record({
      action: 'EMPLOYEE_DOCUMENT_DELETE',
      entity: 'EmployeeDocumentMetadata',
      entityId: doc.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        documentId: doc.id,
        documentName: doc.documentName,
        documentType: doc.documentType,
      },
    });

    return { message: 'Document deleted successfully from secure repository.' };
  }

  // ===========================================================================
  // HR / ADMIN MANAGEMENT METHODS
  // ===========================================================================

  /**
   * List employee documents for HR review (enforces tenant scope)
   */
  async getEmployeeDocumentsForHR(
    user: AuthenticatedUser,
    targetEmployeeId: string,
  ): Promise<{ items: EmployeeDocumentItem[]; stats: EmployeeDocumentStats }> {
    // Verify target employee belongs to HR user's organization
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: targetEmployeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('Target employee record not found in your organization');
    }

    const docs = await this.prisma.employeeDocumentMetadata.findMany({
      where: {
        employeeId: employee.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const items = await Promise.all(
      docs.map(async (doc) => {
        let reviewerNotes: string | null = null;
        if (doc.verifiedAt) {
          const auditLog = await this.prisma.auditLog.findFirst({
            where: {
              organizationId: user.organizationId,
              entity: 'EmployeeDocumentMetadata',
              entityId: doc.id,
              action: {
                in: ['EMPLOYEE_DOCUMENT_VERIFIED', 'EMPLOYEE_DOCUMENT_REJECTED'],
              },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (auditLog?.newValues && typeof auditLog.newValues === 'object') {
            reviewerNotes = (auditLog.newValues as any).notes || null;
          }
        }
        return this.mapDocumentRecord(doc, reviewerNotes);
      }),
    );

    const stats: EmployeeDocumentStats = {
      total: items.length,
      verified: items.filter((d) => d.status === 'VERIFIED').length,
      pending: items.filter((d) => d.status === 'PENDING').length,
      rejected: items.filter((d) => d.status === 'REJECTED').length,
      expiringSoon: items.filter((d) => d.isExpiringSoon).length,
      expired: items.filter((d) => d.isExpired).length,
    };

    return { items, stats };
  }

  /**
   * Download employee document as HR reviewer
   */
  async streamDocumentForHR(
    user: AuthenticatedUser,
    targetEmployeeId: string,
    documentId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<StreamFileResult> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: targetEmployeeId,
        organizationId: user.organizationId,
        deletedAt: null,
      },
    });

    if (!employee) {
      throw new NotFoundException('Target employee not found in your organization');
    }

    const doc = await this.prisma.employeeDocumentMetadata.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found for target employee');
    }

    const filePath = this.getCanonicalStoragePath(user.organizationId, employee.id, doc.id);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Document binary is missing from secure storage');
    }

    await this.audit.record({
      action: 'HR_DOCUMENT_DOWNLOAD',
      entity: 'EmployeeDocumentMetadata',
      entityId: doc.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        documentId: doc.id,
        targetEmployeeId: employee.id,
        documentName: doc.documentName,
      },
    });

    const stream = fs.createReadStream(filePath);
    return {
      stream,
      mimeType: doc.mimeType || 'application/octet-stream',
      fileName: `${doc.documentName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      fileSize: doc.fileSize || 0,
    };
  }

  /**
   * Verify or reject an employee document
   */
  async verifyDocument(
    user: AuthenticatedUser,
    documentId: string,
    dto: VerifyDocumentDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<EmployeeDocumentItem> {
    // Find document and verify tenant scoping through employee
    const doc = await this.prisma.employeeDocumentMetadata.findUnique({
      where: { id: documentId },
      include: { employee: true },
    });

    if (!doc || doc.employee.organizationId !== user.organizationId) {
      throw new NotFoundException('Document not found in your organization');
    }

    const isVerified = dto.decision === 'VERIFIED';

    const updated = await this.prisma.employeeDocumentMetadata.update({
      where: { id: documentId },
      data: {
        isVerified,
        verifiedAt: new Date(),
        verifiedById: user.id,
      },
    });

    // Record review action in Audit Log with feedback notes
    const auditAction = isVerified ? 'EMPLOYEE_DOCUMENT_VERIFIED' : 'EMPLOYEE_DOCUMENT_REJECTED';
    await this.audit.record({
      action: auditAction,
      entity: 'EmployeeDocumentMetadata',
      entityId: doc.id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress,
      userAgent,
      metadata: {
        documentId: doc.id,
        documentName: doc.documentName,
        decision: dto.decision,
        notes: dto.notes || null,
        reviewedBy: `${user.firstName} ${user.lastName}`,
      },
    });

    return this.mapDocumentRecord(updated, dto.notes || null);
  }

  /**
   * Organization / Policy Handbooks (preserving existing publications)
   */
  async getCompanyPolicies() {
    return [
      {
        id: 'policy-1',
        title: 'Employee Handbook & Code of Conduct 2026',
        category: 'POLICY',
        fileSizeFormatted: '2.4 MB',
        updatedAt: '2026-09-15',
        description: 'Comprehensive guidelines on company policies, ethics, and conduct.',
      },
      {
        id: 'policy-2',
        title: 'Attendance, Shifts & Remote Work Policy',
        category: 'POLICY',
        fileSizeFormatted: '1.1 MB',
        updatedAt: '2026-10-01',
        description: 'Rules governing office shifts, geofencing, breaks, and WFH allowances.',
      },
      {
        id: 'policy-3',
        title: 'Official Travel & Outdoor Duty Guidelines',
        category: 'COMPLIANCE',
        fileSizeFormatted: '840 KB',
        updatedAt: '2026-09-20',
        description:
          'Protocols for official visit approvals, GPS verifications, and travel expenses.',
      },
      {
        id: 'policy-4',
        title: 'Data Protection & Information Security Standard',
        category: 'COMPLIANCE',
        fileSizeFormatted: '1.8 MB',
        updatedAt: '2026-08-10',
        description: 'Security policies for handling employee and company data.',
      },
    ];
  }
}
