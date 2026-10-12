import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('DocumentsService (Secure Employee Document Library)', () => {
  let service: DocumentsService;
  let prisma: any;
  let audit: any;

  const mockOrgId = 'org-vault-123';
  const mockEmployeeId1 = 'emp-user-1';
  const mockEmployeeId2 = 'emp-user-2';

  const mockEmployeeUser1: AuthenticatedUser = {
    id: 'usr-1',
    email: 'priya@company.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP001',
    firstName: 'Priya',
    lastName: 'Nair',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: ['DOCUMENT_VIEW'],
    sessionId: 'ses-1',
  };

  const mockEmployeeUser2: AuthenticatedUser = {
    id: 'usr-2',
    email: 'rahul@company.local',
    organizationId: mockOrgId,
    employeeCode: 'EMP002',
    firstName: 'Rahul',
    lastName: 'Verma',
    status: 'ACTIVE',
    roles: ['EMPLOYEE'],
    permissions: ['DOCUMENT_VIEW'],
    sessionId: 'ses-2',
  };

  const mockHrUser: AuthenticatedUser = {
    id: 'usr-hr',
    email: 'hr@company.local',
    organizationId: mockOrgId,
    employeeCode: 'HR001',
    firstName: 'Ananya',
    lastName: 'Sharma',
    status: 'ACTIVE',
    roles: ['HR'],
    permissions: ['DOCUMENT_VIEW', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE'],
    sessionId: 'ses-hr',
  };

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
  );
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const executableBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ Windows EXE header
  const scriptBuffer = Buffer.from('<script>alert("XSS")</script>');

  beforeEach(async () => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.userId === mockEmployeeUser1.id) {
            return Promise.resolve({
              id: mockEmployeeId1,
              userId: mockEmployeeUser1.id,
              organizationId: mockOrgId,
            });
          }
          if (args?.where?.userId === mockEmployeeUser2.id) {
            return Promise.resolve({
              id: mockEmployeeId2,
              userId: mockEmployeeUser2.id,
              organizationId: mockOrgId,
            });
          }
          if (args?.where?.id === mockEmployeeId1) {
            return Promise.resolve({
              id: mockEmployeeId1,
              userId: mockEmployeeUser1.id,
              organizationId: mockOrgId,
            });
          }
          if (args?.where?.id === mockEmployeeId2) {
            return Promise.resolve({
              id: mockEmployeeId2,
              userId: mockEmployeeUser2.id,
              organizationId: mockOrgId,
            });
          }
          return Promise.resolve(null);
        }),
      },
      employeeDocumentMetadata: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: data.id || 'doc-uuid-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            employeeId: mockEmployeeId1,
            documentType: 'GOVT_ID',
            documentName: 'Passport',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          }),
        ),
        delete: jest.fn().mockResolvedValue({ id: 'doc-uuid-1' }),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('File Validation & Magic Bytes Detection', () => {
    it('should successfully validate valid PDF files', async () => {
      const result = await service.uploadMyDocument(
        mockEmployeeUser1,
        {
          buffer: validPdfBuffer,
          originalname: 'National_ID.pdf',
          size: validPdfBuffer.length,
        },
        {
          documentType: 'GOVT_ID',
          documentName: 'National ID Card',
        },
      );

      expect(result.id).toBeDefined();
      expect(result.documentName).toBe('National ID Card');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.status).toBe('PENDING');
      expect(result.isVerified).toBe(false);
      expect(prisma.employeeDocumentMetadata.create).toHaveBeenCalled();
    });

    it('should successfully validate valid PNG image files', async () => {
      const result = await service.uploadMyDocument(
        mockEmployeeUser1,
        {
          buffer: validPngBuffer,
          originalname: 'Degree_Certificate.png',
          size: validPngBuffer.length,
        },
        {
          documentType: 'ACADEMIC',
          documentName: 'B.Tech Certificate',
        },
      );

      expect(result.mimeType).toBe('image/png');
    });

    it('should reject file exceeding 10 MB limit with BadRequestException', async () => {
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB

      await expect(
        service.uploadMyDocument(
          mockEmployeeUser1,
          {
            buffer: oversizedBuffer,
            originalname: 'big_scan.pdf',
            size: oversizedBuffer.length,
          },
          {
            documentType: 'GOVT_ID',
            documentName: 'Oversized Document',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject executable files disguised with .pdf extension', async () => {
      await expect(
        service.uploadMyDocument(
          mockEmployeeUser1,
          {
            buffer: executableBuffer, // Windows MZ header disguised as PDF
            originalname: 'trojan.pdf',
            size: executableBuffer.length,
          },
          {
            documentType: 'GOVT_ID',
            documentName: 'Innocent PDF',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject scripts and HTML disguised as document files', async () => {
      await expect(
        service.uploadMyDocument(
          mockEmployeeUser1,
          {
            buffer: scriptBuffer,
            originalname: 'xss_payload.pdf',
            size: scriptBuffer.length,
          },
          {
            documentType: 'OTHER',
            documentName: 'Script File',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Own-Record Access & Cross-Employee IDOR Prevention', () => {
    it('should prevent Employee 2 from downloading Employee 1 document (cross-employee access blocked)', async () => {
      // Document belongs to Employee 1
      prisma.employeeDocumentMetadata.findFirst.mockResolvedValue(null);

      await expect(
        service.streamDocumentForEmployee(mockEmployeeUser2, 'doc-belonging-to-emp-1'),
      ).rejects.toThrow(NotFoundException);

      // Verify the query strictly scoped by employeeId of current user
      expect(prisma.employeeDocumentMetadata.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'doc-belonging-to-emp-1',
            employeeId: mockEmployeeId2,
          }),
        }),
      );
    });

    it('should prevent Employee 2 from deleting Employee 1 document', async () => {
      prisma.employeeDocumentMetadata.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteMyDocument(mockEmployeeUser2, 'doc-belonging-to-emp-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Retention & Compliance Deletion Policy', () => {
    it('should block deletion of verified statutory/company documents by employees', async () => {
      prisma.employeeDocumentMetadata.findFirst.mockResolvedValue({
        id: 'doc-verified-1',
        employeeId: mockEmployeeId1,
        documentName: 'Passport Front Page',
        documentType: 'GOVT_ID',
        isVerified: true, // Already verified by HR
        verifiedAt: new Date(),
        verifiedById: mockHrUser.id,
      });

      await expect(service.deleteMyDocument(mockEmployeeUser1, 'doc-verified-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.employeeDocumentMetadata.delete).not.toHaveBeenCalled();
    });

    it('should permit deletion of unverified / pending personal documents', async () => {
      prisma.employeeDocumentMetadata.findFirst.mockResolvedValue({
        id: 'doc-pending-1',
        employeeId: mockEmployeeId1,
        documentName: 'Draft Electricity Bill',
        documentType: 'ADDRESS_PROOF',
        isVerified: false,
        verifiedAt: null,
      });

      const res = await service.deleteMyDocument(mockEmployeeUser1, 'doc-pending-1');

      expect(res.message).toContain('deleted successfully');
      expect(prisma.employeeDocumentMetadata.delete).toHaveBeenCalledWith({
        where: { id: 'doc-pending-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_DOCUMENT_DELETE',
          entity: 'EmployeeDocumentMetadata',
          entityId: 'doc-pending-1',
          userId: mockEmployeeUser1.id,
        }),
      );
    });
  });

  describe('HR Verification & Review Feedback', () => {
    it('should allow authorized HR reviewer to verify an employee document with audit logging', async () => {
      prisma.employeeDocumentMetadata.findUnique.mockResolvedValue({
        id: 'doc-to-verify',
        employeeId: mockEmployeeId1,
        documentName: 'Aadhaar Card',
        employee: {
          organizationId: mockOrgId,
        },
      });

      const result = await service.verifyDocument(mockHrUser, 'doc-to-verify', {
        decision: 'VERIFIED',
        notes: 'UIDAI barcode verified successfully',
      });

      expect(result.status).toBe('VERIFIED');
      expect(result.isVerified).toBe(true);
      expect(prisma.employeeDocumentMetadata.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-to-verify' },
          data: expect.objectContaining({
            isVerified: true,
            verifiedById: mockHrUser.id,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_DOCUMENT_VERIFIED',
          entity: 'EmployeeDocumentMetadata',
          entityId: 'doc-to-verify',
          userId: mockHrUser.id,
        }),
      );
    });

    it('should allow authorized HR reviewer to reject document and record reviewer feedback', async () => {
      prisma.employeeDocumentMetadata.findUnique.mockResolvedValue({
        id: 'doc-to-reject',
        employeeId: mockEmployeeId1,
        documentName: 'Blurry Driving License',
        employee: {
          organizationId: mockOrgId,
        },
      });

      const result = await service.verifyDocument(mockHrUser, 'doc-to-reject', {
        decision: 'REJECTED',
        notes: 'Image is too blurry; please re-upload clear color scan of both sides',
      });

      expect(result.status).toBe('REJECTED');
      expect(result.isVerified).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_DOCUMENT_REJECTED',
          metadata: expect.objectContaining({
            decision: 'REJECTED',
            notes: expect.stringContaining('too blurry'),
          }),
        }),
      );
    });

    it('should prevent HR reviewer from accessing documents in another organization', async () => {
      prisma.employeeDocumentMetadata.findUnique.mockResolvedValue({
        id: 'doc-foreign-org',
        employeeId: 'emp-other-org',
        documentName: 'Passport',
        employee: {
          organizationId: 'other-foreign-org-id', // Cross-tenant
        },
      });

      await expect(
        service.verifyDocument(mockHrUser, 'doc-foreign-org', {
          decision: 'VERIFIED',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Audit Logging Verification', () => {
    it('should record EMPLOYEE_DOCUMENT_UPLOAD audit log with safe metadata on upload', async () => {
      await service.uploadMyDocument(
        mockEmployeeUser1,
        {
          buffer: validJpegBuffer,
          originalname: 'photo_id.jpg',
          size: validJpegBuffer.length,
        },
        {
          documentType: 'GOVT_ID',
          documentName: 'Voter ID',
        },
        '192.168.1.50',
        'Mozilla/5.0 TestBrowser',
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMPLOYEE_DOCUMENT_UPLOAD',
          entity: 'EmployeeDocumentMetadata',
          userId: mockEmployeeUser1.id,
          organizationId: mockOrgId,
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0 TestBrowser',
          metadata: expect.objectContaining({
            documentType: 'GOVT_ID',
            documentName: 'Voter ID',
            mimeType: 'image/jpeg',
          }),
        }),
      );
    });
  });
});
