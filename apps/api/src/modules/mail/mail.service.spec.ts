import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let configService: {
    get: jest.Mock;
  };

  describe('Console / Dev Mode', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const map: Record<string, unknown> = {
            NODE_ENV: 'development',
            MAIL_DRIVER: 'console',
            APP_URL: 'http://localhost:3000',
            SMTP_FROM: '"PeopleOS Security" <no-reply@peopleos.local>',
          };
          return map[key] ?? defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService, { provide: ConfigService, useValue: configService }],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('should initialize in console mode', () => {
      expect(service.getDriver()).toBe('console');
    });

    it('should log email to console without throwing', async () => {
      await expect(
        service.sendPasswordResetEmail('user@peopleos.local', 'mock_secure_token_123', 'Vikram'),
      ).resolves.not.toThrow();
    });
  });

  describe('SMTP Mode', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const map: Record<string, unknown> = {
            NODE_ENV: 'production',
            MAIL_DRIVER: 'smtp',
            SMTP_HOST: 'smtp.internal-corp.net',
            SMTP_PORT: 587,
            SMTP_USER: 'corp-user',
            SMTP_PASS: 'corp-pass',
            APP_URL: 'https://hrms.corp.com',
          };
          return map[key] ?? defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService, { provide: ConfigService, useValue: configService }],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('should initialize in smtp mode when configured', () => {
      expect(service.getDriver()).toBe('smtp');
    });
  });
});
