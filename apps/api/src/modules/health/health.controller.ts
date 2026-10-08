import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { SystemHealth } from '@hrms/types';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'System Health Check & Database Connectivity' })
  @SwaggerResponse({
    status: 200,
    description: 'Reports application health and database connectivity status',
  })
  async getHealth(): Promise<{ message: string; data: SystemHealth }> {
    const health = await this.healthService.checkHealth();
    return {
      message: 'System health check completed',
      data: health,
    };
  }
}
