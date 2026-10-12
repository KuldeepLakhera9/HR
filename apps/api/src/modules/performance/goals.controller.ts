import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { CreateGoalProgressUpdateDto } from './dto/goal-progress.dto';
import { ApproveGoalDto } from './dto/approve-goal.dto';
import { QueryGoalsDto } from './dto/query-goals.dto';

@Controller('performance/goals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get('stats')
  async getGoalStats(@CurrentUser() user: AuthenticatedUser, @Query('cycleId') cycleId?: string) {
    return this.goalsService.getGoalStats(user, cycleId);
  }

  @Get()
  async getGoals(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryGoalsDto) {
    return this.goalsService.getGoals(user, query);
  }

  @Post()
  async createGoal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGoalDto) {
    return this.goalsService.createGoal(user, dto);
  }

  @Get(':id')
  async getGoalById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.goalsService.getGoalById(user, id);
  }

  @Patch(':id')
  async updateGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goalsService.updateGoal(user, id, dto);
  }

  @Post(':id/submit')
  async submitGoal(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goalsService.submitGoal(user, id);
  }

  @Post(':id/approve')
  async approveGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveGoalDto,
  ) {
    return this.goalsService.approveGoal(user, id, dto);
  }

  @Post(':id/progress')
  @UseInterceptors(FileInterceptor('evidence'))
  async updateProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGoalProgressUpdateDto,
    @UploadedFile() file?: any,
  ) {
    const payload = file
      ? {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        }
      : undefined;

    return this.goalsService.updateProgress(user, id, dto, payload);
  }

  @Get(':id/progress/:updateId/evidence')
  async streamEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('updateId', ParseUUIDPipe) updateId: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType, fileName, fileSize } = await this.goalsService.streamEvidence(
      user,
      id,
      updateId,
    );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': fileSize,
    });

    stream.pipe(res);
  }

  @Delete(':id')
  async deleteGoal(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goalsService.deleteGoal(user, id);
  }
}
