import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

export interface PasswordConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  memoryCost: number; // in KiB (default: 65536 = 64MB)
  timeCost: number; // iterations (default: 3)
  parallelism: number; // threads (default: 4)
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly config: PasswordConfig;

  constructor(private readonly configService?: ConfigService) {
    this.config = {
      minLength: this.configService?.get<number>('PASSWORD_MIN_LENGTH') ?? 8,
      maxLength: this.configService?.get<number>('PASSWORD_MAX_LENGTH') ?? 128,
      requireUppercase: this.configService?.get<boolean>('PASSWORD_REQUIRE_UPPERCASE') ?? true,
      requireLowercase: this.configService?.get<boolean>('PASSWORD_REQUIRE_LOWERCASE') ?? true,
      requireNumbers: this.configService?.get<boolean>('PASSWORD_REQUIRE_NUMBERS') ?? true,
      requireSpecialChars: this.configService?.get<boolean>('PASSWORD_REQUIRE_SPECIAL') ?? true,
      // Argon2id parameters (RFC 9106 recommended)
      memoryCost: this.configService?.get<number>('ARGON2_MEMORY_COST') ?? 65536,
      timeCost: this.configService?.get<number>('ARGON2_TIME_COST') ?? 3,
      parallelism: this.configService?.get<number>('ARGON2_PARALLELISM') ?? 4,
    };
  }

  /**
   * Validate password complexity against configurable security requirements
   */
  validatePasswordStrength(
    password: string,
    customRules?: Partial<PasswordConfig>,
  ): PasswordValidationResult {
    const rules = { ...this.config, ...customRules };
    const errors: string[] = [];

    if (!password || typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['Password cannot be empty'],
      };
    }

    if (password.length < rules.minLength) {
      errors.push(`Password must be at least ${rules.minLength} characters long`);
    }

    if (password.length > rules.maxLength) {
      errors.push(`Password must not exceed ${rules.maxLength} characters`);
    }

    if (rules.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter (A-Z)');
    }

    if (rules.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter (a-z)');
    }

    if (rules.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one numerical digit (0-9)');
    }

    if (rules.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      errors.push(
        'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?`~)',
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Hashes a plaintext password using Argon2id with salt generation
   * Strictly avoids logging passwords or resulting hashes
   */
  async hashPassword(password: string, customRules?: Partial<PasswordConfig>): Promise<string> {
    const validation = this.validatePasswordStrength(password, customRules);
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join('; '));
    }

    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: customRules?.memoryCost ?? this.config.memoryCost,
      timeCost: customRules?.timeCost ?? this.config.timeCost,
      parallelism: customRules?.parallelism ?? this.config.parallelism,
    });
  }

  /**
   * Verifies a candidate password against an Argon2id hash in constant time
   * Strictly avoids logging passwords or hashes
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
      return false;
    }

    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
