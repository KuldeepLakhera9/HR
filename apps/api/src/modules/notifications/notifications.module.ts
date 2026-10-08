import { Controller, Get, Patch, Param, Injectable, Module, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Injectable()
export class NotificationsService {
  async getNotifications() {
    return [
      {
        id: 'notif-1',
        title: 'Upcoming Holiday: Dussehra',
        message: 'Office remains closed on Monday for Dussehra festival.',
        time: '2 hours ago',
        isRead: false,
      },
      {
        id: 'notif-2',
        title: 'Leave Approved',
        message: 'Your casual leave request for Oct 14 has been approved by manager.',
        time: '1 day ago',
        isRead: false,
      },
      {
        id: 'notif-3',
        title: 'Official Visit Submitted',
        message: 'Official visit request submitted for Hyderabad client meet.',
        time: '2 days ago',
        isRead: true,
      },
    ];
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user notifications' })
  async getNotifications() {
    const data = await this.notificationsService.getNotifications();
    return {
      message: 'Notifications retrieved',
      data,
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  async markRead(@Param('id') id: string) {
    return {
      message: `Notification ${id} marked as read`,
      data: { id, isRead: true },
    };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
