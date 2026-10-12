import { Controller, Post, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { RatingCalculationService, ScoreCalculationInput } from './rating-calculation.service';
import { RecalculateReviewScoreDto } from './dto/rating-calculation.dto';

@ApiTags('Performance - Rating & Calculation Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('performance/rating-engine')
export class RatingCalculationController {
  constructor(private readonly service: RatingCalculationService) {}

  @Post('recalculate/:reviewId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Officially recalculate review scores with policy enforcement and audit history',
  })
  async recalculateReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: RecalculateReviewScoreDto,
  ) {
    return this.service.recalculateReview(user, reviewId, dto);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview deterministic score calculation breakdown without persisting',
  })
  async previewCalculation(@Body() input: ScoreCalculationInput) {
    return this.service.calculateScores(input);
  }
}
