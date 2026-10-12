import { Controller, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PerformanceNotificationsService } from './performance-notifications.service';
import { TriggerPerformanceRemindersDto } from './dto/performance-notifications.dto';

@ApiTags('Performance - Notifications & Reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('performance/reminders')
export class PerformanceNotificationsController {
  constructor(private readonly service: PerformanceNotificationsService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch scan and trigger goal & review deadline reminders (HR/Admin)',
  })
  async triggerBatchReminders(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerPerformanceRemindersDto,
  ) {
    return this.service.scanAndSendPerformanceReminders(user, dto);
  }

  @Post('goal/:goalId/nudge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send an on-demand progress check reminder for a specific goal',
  })
  async nudgeGoal(@CurrentUser() user: AuthenticatedUser, @Param('goalId') goalId: string) {
    return this.service.sendGoalNudge(user, goalId);
  }

  @Post('review/:reviewId/nudge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send an on-demand reminder for a specific self-assessment or manager review',
  })
  async nudgeReview(@CurrentUser() user: AuthenticatedUser, @Param('reviewId') reviewId: string) {
    return this.service.sendReviewNudge(user, reviewId);
  }
}
