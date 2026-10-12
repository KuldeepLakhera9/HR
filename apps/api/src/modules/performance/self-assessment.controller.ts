import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { SelfAssessmentService } from './self-assessment.service';
import {
  SaveSelfAssessmentDraftDto,
  SubmitSelfAssessmentDto,
  ReopenSelfAssessmentDto,
} from './dto/self-assessment.dto';

@Controller('performance/self-assessment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SelfAssessmentController {
  constructor(private readonly selfAssessmentService: SelfAssessmentService) {}

  /**
   * 1. Get employee active cycle context, goals, and existing review status
   */
  @Get('context')
  async getActiveContext(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cycleId') cycleId?: string,
  ) {
    return this.selfAssessmentService.getEmployeeActiveContext(user, cycleId);
  }

  /**
   * 2. Save self-assessment draft (autosave or manual save)
   */
  @Post('draft')
  async saveDraft(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveSelfAssessmentDraftDto) {
    return this.selfAssessmentService.saveDraft(user, dto);
  }

  /**
   * 3. Submit self-assessment (formal completion)
   */
  @Post('submit')
  async submitSelfAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitSelfAssessmentDto,
  ) {
    return this.selfAssessmentService.submitSelfAssessment(user, dto);
  }

  /**
   * 4. Get specific performance review details (strict owner/evaluator/HR check)
   */
  @Get('review/:id')
  async getReviewById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.selfAssessmentService.getReviewById(user, id);
  }

  /**
   * 5. Reopen submitted self-assessment (HR / ADMIN only)
   */
  @Post('review/:id/reopen')
  @Roles('ADMIN', 'HR')
  async reopenSelfAssessment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenSelfAssessmentDto,
  ) {
    return this.selfAssessmentService.reopenSelfAssessment(user, id, dto);
  }

  /**
   * 6. Upload supporting evidence file
   */
  @Post('evidence')
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: any) {
    return this.selfAssessmentService.uploadEvidence(user, file);
  }

  /**
   * 7. Stream evidence file safely
   */
  @Get('evidence/:fileName')
  async streamEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const fileResult = await this.selfAssessmentService.streamEvidence(user, fileName);
    res.setHeader('Content-Type', fileResult.mimeType);
    res.setHeader('Content-Length', fileResult.fileSize);
    res.setHeader('Content-Disposition', `inline; filename="${fileResult.fileName}"`);
    fileResult.stream.pipe(res);
  }
}
