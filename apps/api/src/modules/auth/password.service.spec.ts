import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { PasswordService } from './password.service';

describe('PasswordService (Argon2id)', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                PASSWORD_MIN_LENGTH: 8,
                PASSWORD_MAX_LENGTH: 128,
                PASSWORD_REQUIRE_UPPERCASE: true,
                PASSWORD_REQUIRE_LOWERCASE: true,
                PASSWORD_REQUIRE_NUMBERS: true,
                PASSWORD_REQUIRE_SPECIAL: true,
                ARGON2_MEMORY_COST: 4096, // Lower memory cost for fast test execution
                ARGON2_TIME_COST: 2,
                ARGON2_PARALLELISM: 1,
              };
              return config[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  describe('Password Strength Validation', () => {
    it('should validate strong passwords successfully', () => {
      const result = service.validatePasswordStrength('Admin@PeopleOS2026!');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject passwords shorter than minLength (8 characters)', () => {
      const result = service.validatePasswordStrength('Ab1@xyz');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject passwords exceeding maxLength', () => {
      const longPassword = 'A1!' + 'a'.repeat(130);
      const result = service.validatePasswordStrength(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must not exceed 128 characters');
    });

    it('should reject passwords missing uppercase letters', () => {
      const result = service.validatePasswordStrength('secure@pass123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter (A-Z)');
    });

    it('should reject passwords missing lowercase letters', () => {
      const result = service.validatePasswordStrength('SECURE@PASS123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter (a-z)');
    });

    it('should reject passwords missing numerical digits', () => {
      const result = service.validatePasswordStrength('Secure@Password');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one numerical digit (0-9)');
    });

    it('should reject passwords missing special characters', () => {
      const result = service.validatePasswordStrength('SecurePassword123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?`~)',
      );
    });

    it('should reject empty or invalid inputs', () => {
      const resultEmpty = service.validatePasswordStrength('');
      expect(resultEmpty.isValid).toBe(false);
      expect(resultEmpty.errors).toContain('Password cannot be empty');

      // @ts-expect-error testing invalid type
      const resultNull = service.validatePasswordStrength(null);
      expect(resultNull.isValid).toBe(false);
    });

    it('should respect custom configurable rules', () => {
      const result = service.validatePasswordStrength('simple123', {
        minLength: 6,
        requireUppercase: false,
        requireSpecialChars: false,
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Password Hashing', () => {
    it('should generate a valid Argon2id hash for a strong password', async () => {
      const password = 'PeopleOS#Secure2026';
      const hash = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });

      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      expect(hash.length).toBeGreaterThan(30);
    });

    it('should produce distinct hashes for identical passwords (unique salting)', async () => {
      const password = 'PeopleOS#Secure2026';
      const hash1 = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });
      const hash2 = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });

      expect(hash1).not.toBe(hash2);
      expect(hash1.startsWith('$argon2id$')).toBe(true);
      expect(hash2.startsWith('$argon2id$')).toBe(true);
    });

    it('should reject hashing weak passwords with BadRequestException', async () => {
      await expect(service.hashPassword('weak')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Password Verification', () => {
    it('should return true for correct password against valid hash', async () => {
      const password = 'StrongPassword@987';
      const hash = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });

      const isValid = await service.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password against valid hash', async () => {
      const password = 'StrongPassword@987';
      const hash = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });

      const isValid = await service.verifyPassword('WrongPassword@987', hash);
      expect(isValid).toBe(false);
    });

    it('should return false when verifying with empty or invalid credentials', async () => {
      const password = 'StrongPassword@987';
      const hash = await service.hashPassword(password, { memoryCost: 4096, timeCost: 2 });

      expect(await service.verifyPassword('', hash)).toBe(false);
      // @ts-expect-error testing invalid type
      expect(await service.verifyPassword(null, hash)).toBe(false);
      expect(await service.verifyPassword(password, '')).toBe(false);
    });

    it('should return false cleanly when hash is tampered or malformed', async () => {
      const password = 'StrongPassword@987';
      const corruptedHash = '$argon2id$v=19$m=4096,t=2,p=1$invalidcorruptedhashstring';

      const isValid = await service.verifyPassword(password, corruptedHash);
      expect(isValid).toBe(false);
    });
  });
});
