import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { AnnouncementItem, CreateAnnouncementDto, UpdateAnnouncementDto } from '@hrms/types';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  private readonly storageRoot = path.resolve(process.cwd(), 'storage', 'announcements');
  private memoryCache: Map<string, AnnouncementItem[]> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.ensureStorageDirectory();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  private getStorageFilePath(organizationId: string): string {
    const safeOrgId = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageRoot, `${safeOrgId}.json`);
  }

  private loadAnnouncements(organizationId: string): AnnouncementItem[] {
    if (this.memoryCache.has(organizationId)) {
      return this.memoryCache.get(organizationId)!;
    }

    const filePath = this.getStorageFilePath(organizationId);
    if (!fs.existsSync(filePath)) {
      // Seed initial default official organization announcement if file is empty
      const defaultAnnouncements: AnnouncementItem[] = [
        {
          id: `announcement-seed-1`,
          organizationId,
          title: 'Welcome to the New Employee Self-Service Portal',
          content:
            'We are pleased to introduce the updated HRMS Employee Self-Service (ESS) platform. You can now access your real-time attendance, leave balances, work-from-home requests, and secure document vault directly from your dashboard.',
          priority: 'NORMAL',
          category: 'GENERAL',
          targetAudience: 'ALL',
          targetValue: null,
          publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          expiresAt: null,
          status: 'PUBLISHED',
          authorId: 'system',
          authorName: 'HR Administration',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
      ];
      this.saveAnnouncements(organizationId, defaultAnnouncements);
      this.memoryCache.set(organizationId, defaultAnnouncements);
      return defaultAnnouncements;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const items: AnnouncementItem[] = JSON.parse(raw);
      this.memoryCache.set(organizationId, items);
      return items;
    } catch (err: any) {
      this.logger.error(`Error reading announcements for org ${organizationId}: ${err.message}`);
      return [];
    }
  }

  private saveAnnouncements(organizationId: string, items: AnnouncementItem[]): void {
    this.ensureStorageDirectory();
    const filePath = this.getStorageFilePath(organizationId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
      this.memoryCache.set(organizationId, items);
    } catch (err: any) {
      this.logger.error(`Error writing announcements for org ${organizationId}: ${err.message}`);
    }
  }

  private assertHRorAdmin(user: AuthenticatedUser): void {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAuthorized = roles.some((r) => r === 'ADMIN' || r === 'HR');
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Only HR and Admin personnel can manage organization announcements',
      );
    }
  }

  // ===========================================================================
  // HR / ADMIN MANAGEMENT
  // ===========================================================================

  async createAnnouncement(
    user: AuthenticatedUser,
    dto: CreateAnnouncementDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AnnouncementItem> {
    this.assertHRorAdmin(user);

    if (dto.targetAudience !== 'ALL' && !dto.targetValue) {
      throw new BadRequestException(
        `targetValue must be specified when targetAudience is '${dto.targetAudience}'`,
      );
    }

    if (dto.publishedAt && dto.expiresAt) {
      if (new Date(dto.expiresAt) <= new Date(dto.publishedAt)) {
        throw new BadRequestException('Expiry date must be after publication date');
      }
    }

    const items = this.loadAnnouncements(user.organizationId);
    const now = new Date();
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt).toISOString()
      : now.toISOString();

    const id = `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const authorName = `${user.firstName || 'HR'} ${user.lastName || 'Admin'}`.trim();

    const newAnnouncement: AnnouncementItem = {
      id,
      organizationId: user.organizationId,
      title: dto.title.trim(),
      content: dto.content.trim(),
      priority: dto.priority || 'NORMAL',
      category: dto.category || 'GENERAL',
      targetAudience: dto.targetAudience,
      targetValue: dto.targetValue ? dto.targetValue.trim() : null,
      publishedAt,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt).toISOString() : null,
      status: dto.status || 'PUBLISHED',
      authorId: user.id,
      authorName,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    items.unshift(newAnnouncement);
    this.saveAnnouncements(user.organizationId, items);

    // Audit Logging
    await this.auditService.record({
      action: 'ANNOUNCEMENT_CREATED',
      entity: 'Announcement',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        title: newAnnouncement.title,
        priority: newAnnouncement.priority,
        category: newAnnouncement.category,
        targetAudience: newAnnouncement.targetAudience,
        targetValue: newAnnouncement.targetValue,
        status: newAnnouncement.status,
      },
    });

    // In-app notification broadcast for PUBLISHED announcements
    if (newAnnouncement.status === 'PUBLISHED') {
      await this.notificationsService.createNotification({
        organizationId: user.organizationId,
        title: `Announcement: ${newAnnouncement.title}`,
        message:
          newAnnouncement.content.length > 120
            ? `${newAnnouncement.content.substring(0, 117)}...`
            : newAnnouncement.content,
        type: newAnnouncement.priority === 'URGENT' ? 'WARNING' : 'INFO',
        link: '/requests?tab=announcements',
        idempotencyKey: `announcement-notify-${id}-${user.organizationId}`,
        metadata: {
          announcementId: id,
          priority: newAnnouncement.priority,
          category: newAnnouncement.category,
          targetAudience: newAnnouncement.targetAudience,
        },
      });
    }

    return newAnnouncement;
  }

  async updateAnnouncement(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateAnnouncementDto,
    clientIp?: string,
    userAgent?: string,
  ): Promise<AnnouncementItem> {
    this.assertHRorAdmin(user);

    const items = this.loadAnnouncements(user.organizationId);
    const index = items.findIndex((a) => a.id === id);

    if (index === -1) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }

    const existing = items[index];

    if (
      dto.targetAudience &&
      dto.targetAudience !== 'ALL' &&
      !dto.targetValue &&
      !existing.targetValue
    ) {
      throw new BadRequestException(
        `targetValue must be specified when targetAudience is '${dto.targetAudience}'`,
      );
    }

    const updated: AnnouncementItem = {
      ...existing,
      title: dto.title ? dto.title.trim() : existing.title,
      content: dto.content ? dto.content.trim() : existing.content,
      priority: dto.priority || existing.priority,
      category: dto.category || existing.category,
      targetAudience: dto.targetAudience || existing.targetAudience,
      targetValue:
        dto.targetValue !== undefined ? dto.targetValue?.trim() || null : existing.targetValue,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt).toISOString() : existing.publishedAt,
      expiresAt:
        dto.expiresAt !== undefined
          ? dto.expiresAt
            ? new Date(dto.expiresAt).toISOString()
            : null
          : existing.expiresAt,
      status: dto.status || existing.status,
      updatedAt: new Date().toISOString(),
    };

    items[index] = updated;
    this.saveAnnouncements(user.organizationId, items);

    // Audit Logging
    await this.auditService.record({
      action: 'ANNOUNCEMENT_UPDATED',
      entity: 'Announcement',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress: clientIp,
      userAgent,
      metadata: {
        title: updated.title,
        status: updated.status,
      },
    });

    return updated;
  }

  async archiveAnnouncement(
    user: AuthenticatedUser,
    id: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.assertHRorAdmin(user);

    const items = this.loadAnnouncements(user.organizationId);
    const item = items.find((a) => a.id === id);

    if (!item) {
      throw new NotFoundException(`Announcement ${id} not found`);
    }

    item.status = 'ARCHIVED';
    item.updatedAt = new Date().toISOString();
    this.saveAnnouncements(user.organizationId, items);

    await this.auditService.record({
      action: 'ANNOUNCEMENT_ARCHIVED',
      entity: 'Announcement',
      entityId: id,
      userId: user.id,
      organizationId: user.organizationId,
      ipAddress: clientIp,
      userAgent,
      metadata: { title: item.title },
    });

    return { success: true, message: `Announcement ${id} archived successfully` };
  }

  async getAllAnnouncementsForHR(
    user: AuthenticatedUser,
    query?: { status?: string; search?: string },
  ): Promise<AnnouncementItem[]> {
    this.assertHRorAdmin(user);

    let items = this.loadAnnouncements(user.organizationId);

    if (query?.status && query.status !== 'ALL') {
      items = items.filter((a) => a.status === query.status);
    }

    if (query?.search) {
      const term = query.search.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(term) ||
          a.content.toLowerCase().includes(term) ||
          (a.targetValue && a.targetValue.toLowerCase().includes(term)),
      );
    }

    return items;
  }

  // ===========================================================================
  // EMPLOYEE AUDIENCE-SCOPED RETRIEVAL
  // ===========================================================================

  async getActiveAnnouncementsForEmployee(user: AuthenticatedUser): Promise<AnnouncementItem[]> {
    const items = this.loadAnnouncements(user.organizationId);
    const now = new Date();

    // Retrieve employee record to determine department for audience matching
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        employment: {
          include: {
            department: true,
          },
        },
      },
    });

    const employeeDeptName = employee?.employment?.department?.name?.trim().toLowerCase() || null;
    const employeeDeptCode = employee?.employment?.department?.code?.trim().toLowerCase() || null;
    const employeeDeptId = employee?.employment?.departmentId || user.departmentId || null;
    const userRoles = (Array.isArray(user.roles) ? user.roles : []).map((r) => r.toUpperCase());

    const eligible = items.filter((a) => {
      // 1. Must be published
      if (a.status !== 'PUBLISHED') return false;

      // 2. Publication date check
      const pubDate = new Date(a.publishedAt);
      if (pubDate > now) return false;

      // 3. Expiration date check
      if (a.expiresAt) {
        const expDate = new Date(a.expiresAt);
        if (expDate <= now) return false;
      }

      // 4. Strict Audience Scope Enforcement (Zero cross-audience leaks)
      if (a.targetAudience === 'ALL') {
        return true;
      }

      if (a.targetAudience === 'DEPARTMENT') {
        if (!a.targetValue) return false;
        const target = a.targetValue.trim().toLowerCase();
        return (
          (employeeDeptName && employeeDeptName === target) ||
          (employeeDeptCode && employeeDeptCode === target) ||
          (employeeDeptId && employeeDeptId.toLowerCase() === target)
        );
      }

      if (a.targetAudience === 'ROLE') {
        if (!a.targetValue) return false;
        const target = a.targetValue.trim().toUpperCase();
        return userRoles.includes(target);
      }

      return false;
    });

    // Priority rank: URGENT (4) > HIGH (3) > NORMAL (2) > LOW (1)
    const priorityWeights: Record<string, number> = {
      URGENT: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    eligible.sort((a, b) => {
      const weightA = priorityWeights[a.priority] || 2;
      const weightB = priorityWeights[b.priority] || 2;
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return eligible;
  }
}
