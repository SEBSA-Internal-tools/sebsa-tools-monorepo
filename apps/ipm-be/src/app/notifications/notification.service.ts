import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { EntityType, NotificationType, Prisma } from '@prisma/client';
import { FilterNotificationDto } from './dto/filter-notification.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserNotifications(userId: string, filter: FilterNotificationDto) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(filter.isRead !== undefined && { isRead: filter.isRead }),
      ...(filter.type && { type: filter.type }),
    };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      data,
      total,
      unreadCount,
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found.`);
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return { count: result.count };
  }

  async deleteNotification(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found.`);
    }

    await this.prisma.notification.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Safe single notification dispatcher.
   * Catches any errors so background notification dispatch never breaks main business actions.
   */
  async createNotification(dto: CreateNotificationDto) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          message: dto.message,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${dto.userId}: ${(error as Error).message}`, (error as Error).stack);
      return null;
    }
  }

  /**
   * Safe bulk notification dispatcher with batch insertion.
   */
  async createBulkNotifications(notifications: CreateNotificationDto[]) {
    if (!notifications || notifications.length === 0) {
      return;
    }

    try {
      await this.prisma.notification.createMany({
        data: notifications.map((n) => ({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          relatedEntityType: n.relatedEntityType,
          relatedEntityId: n.relatedEntityId,
        })),
      });
    } catch (error) {
      this.logger.error(`Failed to create bulk notifications: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  /**
   * Helper to dispatch assignment notifications to one or more assignees (excluding self-assignment).
   */
  async notifyAssignees(params: {
    assigneeUserIds: string[];
    actorId?: string;
    actorName?: string;
    entityType: EntityType;
    entityId: string;
    entityTitle: string;
  }) {
    const targetUserIds = params.assigneeUserIds.filter((id) => id && id !== params.actorId);
    if (targetUserIds.length === 0) return;

    const actorLabel = params.actorName || 'A team member';
    const entityLabel = params.entityType === 'CASE' ? 'case' : params.entityType === 'SUBTASK' ? 'subtask' : 'task';

    const notifications: CreateNotificationDto[] = targetUserIds.map((userId) => ({
      userId,
      type: NotificationType.TASK_ASSIGNED,
      title: `New ${entityLabel} assigned to you`,
      message: `"${params.entityTitle}" was assigned by ${actorLabel}`,
      relatedEntityType: params.entityType,
      relatedEntityId: params.entityId,
    }));

    await this.createBulkNotifications(notifications);
  }

  /**
   * Helper to dispatch status change notifications.
   */
  async notifyStatusChange(params: {
    recipientUserIds: string[];
    actorId?: string;
    actorName?: string;
    entityType: EntityType;
    entityId: string;
    entityTitle: string;
    newStatus: string;
  }) {
    const targetUserIds = params.recipientUserIds.filter((id) => id && id !== params.actorId);
    if (targetUserIds.length === 0) return;

    const formattedStatus = params.newStatus.replace(/_/g, ' ');
    const entityLabel = params.entityType === 'CASE' ? 'Case' : params.entityType === 'PROJECT' ? 'Project' : 'Task';

    const notifications: CreateNotificationDto[] = targetUserIds.map((userId) => ({
      userId,
      type: NotificationType.STATUS_CHANGE,
      title: `${entityLabel} status updated`,
      message: `"${params.entityTitle}" moved to ${formattedStatus}`,
      relatedEntityType: params.entityType,
      relatedEntityId: params.entityId,
    }));

    await this.createBulkNotifications(notifications);
  }
}
