import { Test, TestingModule } from '@nestjs/testing';
import { AuditService, AuthAuditEvent } from './audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    organization: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'aud_1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org_123' }),
      },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org_default' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('record()', () => {
    it('should create audit log with sanitized metadata and user organization', async () => {
      await service.record({
        action: AuthAuditEvent.LOGIN_SUCCESS,
        entity: 'Authentication',
        entityId: 'usr_1',
        userId: 'usr_1',
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome/120',
        metadata: {
          email: 'admin@peopleos.local',
          device: 'MacBook Pro',
        },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org_123',
          userId: 'usr_1',
          action: AuthAuditEvent.LOGIN_SUCCESS,
          entity: 'Authentication',
          entityId: 'usr_1',
          ipAddress: '192.168.1.1',
          userAgent: 'Chrome/120',
          newValues: {
            email: 'admin@peopleos.local',
            device: 'MacBook Pro',
          },
        },
      });
    });

    it('should never throw if audit log persistence fails', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB Connection Timeout'));

      await expect(
        service.record({
          action: AuthAuditEvent.LOGIN_FAILED,
          entity: 'Authentication',
          metadata: { email: 'unknown@example.com' },
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('sanitizeMetadata()', () => {
    it('should strip password, token, hash, secret, and credential keys', () => {
      const input = {
        email: 'user@example.com',
        password: 'RawPassword123!',
        passwordHash: '$argon2id$somehash',
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
        refreshToken: 'raw_refresh_123',
        resetToken: 'raw_reset_123',
        clientSecret: 'secret_value',
        nested: {
          allowedKey: 'safeValue',
          userPassword: 'AnotherPassword',
          salt: 'salt123',
        },
      };

      const sanitized = service.sanitizeMetadata(input) as Record<string, unknown>;

      expect(sanitized.email).toBe('user@example.com');
      expect(sanitized).not.toHaveProperty('password');
      expect(sanitized).not.toHaveProperty('passwordHash');
      expect(sanitized).not.toHaveProperty('token');
      expect(sanitized).not.toHaveProperty('refreshToken');
      expect(sanitized).not.toHaveProperty('resetToken');
      expect(sanitized).not.toHaveProperty('clientSecret');

      const nested = sanitized.nested as Record<string, unknown>;
      expect(nested.allowedKey).toBe('safeValue');
      expect(nested).not.toHaveProperty('userPassword');
      expect(nested).not.toHaveProperty('salt');
    });

    it('should redact string values matching JWT signatures or long hex hashes', () => {
      const input = {
        info: 'Normal description',
        sessionPayload:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHw',
        opaqueData: 'abcdef0123456789abcdef0123456789abcdef0123456789',
      };

      const sanitized = service.sanitizeMetadata(input) as Record<string, unknown>;

      expect(sanitized.info).toBe('Normal description');
      expect(sanitized.sessionPayload).toBe('[REDACTED_JWT]');
      expect(sanitized.opaqueData).toBe('[REDACTED_TOKEN_HASH]');
    });
  });

  describe('getRecentLogs()', () => {
    it('should query audit logs and map to safe presentation format', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'aud_100',
          organizationId: 'org_1',
          userId: 'usr_1',
          action: AuthAuditEvent.LOGIN_SUCCESS,
          entity: 'Authentication',
          entityId: 'usr_1',
          ipAddress: '127.0.0.1',
          userAgent: 'Firefox',
          newValues: { email: 'admin@peopleos.local' },
          createdAt: new Date(),
          user: {
            id: 'usr_1',
            firstName: 'Vikram',
            lastName: 'Aditya',
            email: 'admin@peopleos.local',
            employeeCode: 'EMP001',
          },
        },
      ]);

      const logs = await service.getRecentLogs('org_1', 10);

      expect(logs).toHaveLength(1);
      expect(logs[0].actorName).toBe('Vikram Aditya');
      expect(logs[0].action).toBe(AuthAuditEvent.LOGIN_SUCCESS);
      expect(logs[0].type).toBe('security');
      expect(logs[0].metadata).toEqual({ email: 'admin@peopleos.local' });
    });
  });
});
