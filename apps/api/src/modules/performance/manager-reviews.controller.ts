import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ManagerReviewsService } from './manager-reviews.service';
import {
  SaveManagerReviewDraftDto,
  SubmitManagerReviewDto,
  ReturnReviewForCorrectionDto,
  FinalizeReviewDto,
  QueryManagerReviewsDto,
} from './dto/manager-review.dto';

@Controller('performance/manager-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManagerReviewsController {
  constructor(private readonly managerReviewsService: ManagerReviewsService) {}

  /**
   * 1. Get Manager Review Inbox (scoped to manager's direct/indirect reports)
   */
  @Get('inbox')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async getManagerInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryManagerReviewsDto,
  ) {
    return this.managerReviewsService.getManagerInbox(user, query);
  }

  /**
   * 2. Get Performance Review Details for Manager
   */
  @Get(':id')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async getReviewDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.managerReviewsService.getReviewDetail(user, id);
  }

  /**
   * 3. Save Manager Review Draft
   */
  @Post(':id/draft')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveManagerReviewDraftDto,
  ) {
    return this.managerReviewsService.saveDraft(user, id, dto);
  }

  /**
   * 4. Submit Manager Review
   */
  @Post(':id/submit')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitManagerReviewDto,
  ) {
    return this.managerReviewsService.submitReview(user, id, dto);
  }

  /**
   * 5. Return Review for Correction (Send back to Employee)
   */
  @Post(':id/return')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async returnForCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnReviewForCorrectionDto,
  ) {
    return this.managerReviewsService.returnForCorrection(user, id, dto);
  }

  /**
   * 6. Finalize Review (Atomic finalization)
   */
  @Post(':id/finalize')
  @Roles('MANAGER', 'HR', 'ADMIN')
  async finalizeReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeReviewDto,
  ) {
    return this.managerReviewsService.finalizeReview(user, id, dto);
  }
}
