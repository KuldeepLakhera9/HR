import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/interfaces/auth.interface';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

function extractUserAgent(req: AuthenticatedRequest): string | undefined {
  const ua = req.headers['user-agent'];
  return Array.isArray(ua) ? ua[0] : ua;
}

@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  // ===========================================================================
  // EMPLOYEE AUDIENCE-SCOPED VIEW
  // ===========================================================================

  @Get()
  @ApiOperation({
    summary: 'Get active organization announcements scoped to the authenticated employee',
  })
  async getMyAnnouncements(@Req() req: AuthenticatedRequest) {
    const data = await this.announcementsService.getActiveAnnouncementsForEmployee(req.user);
    return {
      success: true,
      data,
    };
  }

  // ===========================================================================
  // HR / ADMIN MANAGEMENT ROUTES
  // ===========================================================================

  @Get('admin')
  @Roles('HR', 'ADMIN')
  @ApiOperation({ summary: 'List all announcements for HR administration' })
  async getAllForAdmin(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.announcementsService.getAllAnnouncementsForHR(req.user, {
      status,
      search,
    });
    return {
      success: true,
      data,
    };
  }

  @Post()
  @Roles('HR', 'ADMIN')
  @ApiOperation({ summary: 'Publish or schedule a new company announcement' })
  async createAnnouncement(@Req() req: AuthenticatedRequest, @Body() dto: CreateAnnouncementDto) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const data = await this.announcementsService.createAnnouncement(
      req.user,
      dto,
      clientIp,
      userAgent,
    );

    return {
      success: true,
      message: 'Announcement successfully created and published',
      data,
    };
  }

  @Put(':id')
  @Roles('HR', 'ADMIN')
  @ApiOperation({ summary: 'Update an existing announcement' })
  async updateAnnouncement(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const data = await this.announcementsService.updateAnnouncement(
      req.user,
      id,
      dto,
      clientIp,
      userAgent,
    );

    return {
      success: true,
      message: 'Announcement updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('HR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an announcement' })
  async archiveAnnouncement(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = extractUserAgent(req);

    const result = await this.announcementsService.archiveAnnouncement(
      req.user,
      id,
      clientIp,
      userAgent,
    );

    return result;
  }
}
