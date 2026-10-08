import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async mockLogin(email: string, role: string) {
    return {
      token: `mock_jwt_token_for_${role.toLowerCase()}`,
      user: {
        id: 'usr_mock_123',
        email,
        role,
        firstName: 'System',
        lastName: 'User',
      },
      expiresIn: '8h',
    };
  }

  async getProfile() {
    return {
      id: 'usr_mock_123',
      email: 'admin@peopleos.local',
      role: 'ADMIN',
      firstName: 'Vikram',
      lastName: 'Aditya',
      organization: 'PeopleOS Technologies Inc.',
    };
  }
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate user and obtain session token (Phase 1 Mock/Foundation)' })
  async login(@Body() body: { email: string; role?: string }) {
    const data = await this.authService.mockLogin(
      body.email || 'user@hrms.local',
      body.role || 'ADMIN',
    );
    return {
      message: 'Authentication successful',
      data,
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async getProfile() {
    const data = await this.authService.getProfile();
    return {
      message: 'Profile retrieved successfully',
      data,
    };
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
