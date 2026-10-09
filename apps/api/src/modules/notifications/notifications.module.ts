import {
  Controller,
  Get,
  Patch,
  Param,
  Injectable,
  Module,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

export interface InternalNotification {
  id: string;
  userId?: string | null;
  organizationId: string;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  metadata?: any;
  createdAt: Date;
  isRead: boolean;
  idempotencyKey?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private notifications: InternalNotification[] = [];

  /**
   * Internal in-app notification dispatch without paid external services.
   * Includes duplicate notification prevention via optional idempotencyKey.
   */
  async createNotification(data: {
    userId?: string | null;
    organizationId: string;
    title: string;
    message: string;
    type?: string;
    link?: string | null;
    metadata?: any;
    idempotencyKey?: string | null;
  }): Promise<InternalNotification> {
    // 1. Duplicate Notification Prevention
    if (data.idempotencyKey) {
      const existing = this.notifications.find(
        (n) =>
          n.organizationId === data.organizationId &&
          n.idempotencyKey === data.idempotencyKey &&
          (data.userId ? n.userId === data.userId : true),
      );
      if (existing) {
        this.logger.debug(
          `[Duplicate Notification Prevented] IdempotencyKey="${data.idempotencyKey}" already processed.`,
        );
        return existing;
      }
    }

    const notif: InternalNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: data.userId ?? null,
      organizationId: data.organizationId,
      title: data.title,
      message: data.message,
      type: data.type || 'INFO',
      link: data.link ?? null,
      metadata: data.metadata ?? null,
      createdAt: new Date(),
      isRead: false,
      idempotencyKey: data.idempotencyKey ?? null,
    };

    this.notifications.unshift(notif);
    // Keep internal buffer bounded
    if (this.notifications.length > 500) {
      this.notifications.pop();
    }

    this.logger.log(
      `[In-App Notification] Org=${data.organizationId} Title="${data.title}" Type=${data.type}`,
    );

    return notif;
  }

  async getNotifications(userId?: string, organizationId?: string) {
    const filtered = this.notifications.filter((n) => {
      if (organizationId && n.organizationId !== organizationId) return false;
      if (n.userId && userId && n.userId !== userId) return false;
      return true;
    });

    const formattedDynamic = filtered.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      time: this.formatRelativeTime(n.createdAt),
      isRead: n.isRead,
      metadata: n.metadata,
      link: n.link,
    }));

    // Retain default seed notifications for demonstration
    const defaults = [
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

    return [...formattedDynamic, ...defaults];
  }

  async markRead(id: string, _userId?: string) {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) {
      notif.isRead = true;
    }
    return { id, isRead: true };
  }

  private formatRelativeTime(date: Date): string {
    const diffSecs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
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
  async getNotifications(@CurrentUser() user?: AuthenticatedUser) {
    const data = await this.notificationsService.getNotifications(user?.id, user?.organizationId);
    return {
      message: 'Notifications retrieved',
      data,
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  async markRead(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    const data = await this.notificationsService.markRead(id, user?.id);
    return {
      message: `Notification ${id} marked as read`,
      data,
    };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
