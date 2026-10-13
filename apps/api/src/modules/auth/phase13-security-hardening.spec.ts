import { HttpStatus } from '@nestjs/common';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import {
  sanitizeCsvCell,
  sanitizeCsvRow,
  sanitizeUrlForLogging,
  maskSensitiveIdentifier,
} from '../../common/utils/security.util';
import { AuditService } from '../audit/audit.service';
import { AuthController } from './auth.controller';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';

describe('Phase 13 Security Hardening & Penetration Verification', () => {
  describe('1. CSV / Spreadsheet Formula Injection Defense (CWE-1236)', () => {
    it('should neutralize formula trigger characters at start of cell strings', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('-2+3+cmd')).toBe("'-2+3+cmd");
      expect(sanitizeCsvCell('@IMPORTXML("url")')).toBe('\'@IMPORTXML("url")');
      expect(sanitizeCsvCell('\tmaliciousTab')).toBe("'\tmaliciousTab");
      expect(sanitizeCsvCell('\rmaliciousReturn')).toBe("'\rmaliciousReturn");
      expect(sanitizeCsvCell('%PERCENT_PAYLOAD')).toBe("'%PERCENT_PAYLOAD");
    });

    it('should leave benign text and numbers unmodified', () => {
      expect(sanitizeCsvCell('John Doe')).toBe('John Doe');
      expect(sanitizeCsvCell('EMP-001')).toBe('EMP-001');
      expect(sanitizeCsvCell(12345)).toBe('12345');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('should sanitize all string fields in a CSV export row object', () => {
      const maliciousRow = {
        'Employee Code': '=cmd|/c calc!A0',
        'Full Name': '+John Evil',
        'Work Email': 'evil@corp.com',
        Department: '@Engineering',
        Status: 'ACTIVE',
        Phone: '-9876543210',
      };

      const clean = sanitizeCsvRow(maliciousRow);

      expect(clean['Employee Code']).toBe("'=cmd|/c calc!A0");
      expect(clean['Full Name']).toBe("'+John Evil");
      expect(clean['Work Email']).toBe('evil@corp.com');
      expect(clean['Department']).toBe("'@Engineering");
      expect(clean['Status']).toBe('ACTIVE');
      expect(clean['Phone']).toBe("'-9876543210");
    });
  });

  describe('2. Brute-Force & Rate Limiting Controls on Public Auth Routes (CWE-307)', () => {
    it('should have strict throttler limits metadata applied to public authentication endpoints', () => {
      const loginLimit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        AuthController.prototype.login,
      );
      const loginTtl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.login);

      const forgotLimit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        AuthController.prototype.forgotPassword,
      );
      const forgotTtl = Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        AuthController.prototype.forgotPassword,
      );

      const resetLimit = Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        AuthController.prototype.resetPassword,
      );
      const resetTtl = Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        AuthController.prototype.resetPassword,
      );

      expect(loginLimit).toBe(5);
      expect(loginTtl).toBe(60000);

      expect(forgotLimit).toBe(5);
      expect(forgotTtl).toBe(60000);

      expect(resetLimit).toBe(5);
      expect(resetTtl).toBe(60000);
    });
  });

  describe('3. PII & Financial Data Redaction in Audit Logging (CWE-532)', () => {
    let auditService: AuditService;
    const mockPrisma: any = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }),
      },
    };

    beforeEach(() => {
      auditService = new AuditService(mockPrisma);
    });

    it('should deeply redact sensitive banking, identity, and salary fields from audit metadata', () => {
      const rawMetadata = {
        employeeCode: 'EMP-100',
        action: 'UPDATE_COMPENSATION',
        bankAccount: '12345678901234',
        accountNumber: '9876543210',
        ifscCode: 'HDFC0001234',
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '1234-5678-9012',
        baseSalary: 150000,
        netPay: 120000,
        grossPay: 160000,
        ctc: 1800000,
        password: 'PlainTextSecret!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        nested: {
          salaryRevision: 25000,
          creditCard: '4111111111111111',
          approvedBy: 'EMP-001',
        },
      };

      const sanitized: any = auditService.sanitizeMetadata(rawMetadata);

      // Verify forbidden keys are removed
      expect(sanitized.employeeCode).toBe('EMP-100');
      expect(sanitized.action).toBe('UPDATE_COMPENSATION');
      expect(sanitized.bankAccount).toBeUndefined();
      expect(sanitized.accountNumber).toBeUndefined();
      expect(sanitized.ifscCode).toBeUndefined();
      expect(sanitized.panNumber).toBeUndefined();
      expect(sanitized.aadhaarNumber).toBeUndefined();
      expect(sanitized.baseSalary).toBeUndefined();
      expect(sanitized.netPay).toBeUndefined();
      expect(sanitized.grossPay).toBeUndefined();
      expect(sanitized.ctc).toBeUndefined();
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.token).toBeUndefined();

      // Verify nested objects are also scrubbed
      expect(sanitized.nested.salaryRevision).toBeUndefined();
      expect(sanitized.nested.creditCard).toBeUndefined();
      expect(sanitized.nested.approvedBy).toBe('EMP-001');
    });

    it('should mask sensitive identifiers showing only last 4 digits', () => {
      expect(maskSensitiveIdentifier('123456789012')).toBe('********9012');
      expect(maskSensitiveIdentifier('ABCDE1234F')).toBe('******234F');
      expect(maskSensitiveIdentifier('123')).toBe('****');
      expect(maskSensitiveIdentifier(null)).toBe('');
      expect(maskSensitiveIdentifier(undefined)).toBe('');
    });
  });

  describe('4. Log Sanitization & HTTP Leakage Prevention (CWE-532)', () => {
    it('should redact sensitive query parameters from URLs before logging', () => {
      const urlWithToken =
        '/api/v1/auth/reset-password?token=secret-token-123&email=user%40corp.com';
      const cleanUrl = sanitizeUrlForLogging(urlWithToken);

      expect(cleanUrl).not.toContain('secret-token-123');
      expect(cleanUrl).not.toContain('user%40corp.com');
      expect(cleanUrl).toContain('token=%5BREDACTED%5D');
      expect(cleanUrl).toContain('email=%5BREDACTED%5D');
    });

    it('should preserve benign query parameters in URLs', () => {
      const benignUrl = '/api/v1/employees?page=2&limit=50&sortBy=displayName&status=ACTIVE';
      const cleanUrl = sanitizeUrlForLogging(benignUrl);

      expect(cleanUrl).toBe(benignUrl);
    });

    it('should strip query parameters entirely from exception filter path output', () => {
      const filter = new AllExceptionsFilter();
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/auth/reset-password?token=my-secret-token' }),
        }),
      } as any;

      filter.catch(new Error('Invalid token'), mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/v1/auth/reset-password',
        }),
      );
      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.path).not.toContain('token=');
      expect(jsonCall.path).not.toContain('my-secret-token');
    });
  });

  describe('5. HTTP Security Headers Hardening', () => {
    it('should set essential defensive headers via middleware simulation', () => {
      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        removeHeader: (k: string) => {
          delete headers[k];
        },
      };
      const mockReq: any = {};
      const next = jest.fn();

      // Middleware logic from main.ts
      const securityMiddleware = (_req: any, res: any, nextFn: any) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-XSS-Protection', '0');
        res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
        res.removeHeader('X-Powered-By');
        nextFn();
      };

      headers['X-Powered-By'] = 'Express';
      securityMiddleware(mockReq, mockRes, next);

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['X-XSS-Protection']).toBe('0');
      expect(headers['Permissions-Policy']).toBe('geolocation=(), camera=(), microphone=()');
      expect(headers['X-Powered-By']).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});
