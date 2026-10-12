import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { ReviewCyclesService } from './review-cycles.service';
import { CreateReviewCycleDto } from './dto/create-review-cycle.dto';
import { UpdateReviewCycleDto } from './dto/update-review-cycle.dto';
import { TransitionCycleStageDto } from './dto/transition-cycle.dto';
import { ReopenCycleDto } from './dto/reopen-cycle.dto';
import { ReassignManagerDto, ExemptParticipantDto } from './dto/manage-participant.dto';

@Controller('performance/cycles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewCyclesController {
  constructor(private readonly reviewCyclesService: ReviewCyclesService) {}

  @Get()
  async getCycles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.reviewCyclesService.getCycles(user, { status, search });
  }

  @Post()
  async createCycle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewCycleDto) {
    return this.reviewCyclesService.createCycle(user, dto);
  }

  @Get(':id')
  async getCycleById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewCyclesService.getCycleById(user, id);
  }

  @Patch(':id')
  async updateCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewCycleDto,
  ) {
    return this.reviewCyclesService.updateCycle(user, id, dto);
  }

  @Get(':id/eligibility-preview')
  async previewEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewCyclesService.previewEligibility(user, id);
  }

  @Post(':id/enroll')
  async enrollParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewCyclesService.enrollParticipants(user, id);
  }

  @Post(':id/transition')
  async transitionStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCycleStageDto,
  ) {
    return this.reviewCyclesService.transitionStage(user, id, dto);
  }

  @Post(':id/reopen')
  async reopenCycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenCycleDto,
  ) {
    return this.reviewCyclesService.reopenCycle(user, id, dto);
  }

  @Get(':id/participants')
  async getCycleParticipants(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewCyclesService.getCycleParticipants(user, id, {
      status,
      search,
      page,
      limit,
    });
  }

  @Post(':id/participants/:participantId/reassign-manager')
  async reassignManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: ReassignManagerDto,
  ) {
    return this.reviewCyclesService.reassignManager(user, id, participantId, dto);
  }

  @Post(':id/participants/:participantId/exempt')
  async exemptParticipant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: ExemptParticipantDto,
  ) {
    return this.reviewCyclesService.exemptParticipant(user, id, participantId, dto);
  }
}
