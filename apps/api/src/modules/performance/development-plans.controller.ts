import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { DevelopmentPlansService } from './development-plans.service';
import {
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  CreateFeedbackDto,
} from './dto/development-plan.dto';

@ApiTags('Performance - Development Plans & Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('performance/development-plans')
export class DevelopmentPlansController {
  constructor(private readonly service: DevelopmentPlansService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get development plans, progress tracking, and authorized feedback notes',
  })
  async getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.getOverview(user, employeeId);
  }

  @Post()
  @ApiOperation({
    summary: 'Assign a new employee development plan (Manager or HR/Admin)',
  })
  async createPlan(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDevelopmentPlanDto) {
    return this.service.createPlan(user, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update development plan (progress, notes, criteria, completion)',
  })
  async updatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDevelopmentPlanDto,
  ) {
    return this.service.updatePlan(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a development plan (Manager or HR/Admin only)',
  })
  async deletePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deletePlan(user, id);
  }

  @Post('feedback')
  @ApiOperation({
    summary: 'Add structured performance feedback (with visibility controls)',
  })
  async addFeedback(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFeedbackDto) {
    return this.service.addFeedback(user, dto);
  }

  @Delete('feedback/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a performance feedback note (Author or HR/Admin)',
  })
  async deleteFeedback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deleteFeedback(user, id);
  }

  @Post(':id/remind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send progress reminder for development objective',
  })
  async sendReminder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.sendReminder(user, id);
  }
}
