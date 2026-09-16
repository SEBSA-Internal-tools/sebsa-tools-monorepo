import { Injectable, Logger, MessageEvent, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { EntityType, NotificationType, Prisma } from '@prisma/client';
import { filter, interval, map, merge, Observable, Subject } from 'rxjs';
import { FilterNotificationDto } from './dto/filter-notification.dto';
import { CreateNotificationDto } from './dto/create-notification.dto';

interface NotificationEventPayload {
  userId: string;
  event: 'notification' | 'unread_count';
  data: any;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly eventBus = new Subject<NotificationEventPayload>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal emitter to send real-time events to connected user sessions.
   */
  private emitToUser(userId: string, event: 'notification' | 'unread_count', data: any): void {
    this.eventBus.next({ userId, event, data });
  }

  /**
   * Returns a Server-Sent Events (SSE) stream for the given user, combined with a periodic ping heartbeat.
   */
  getUserStream(userId: string): Observable<MessageEvent> {
    const userEvents$ = this.eventBus.asObservable().pipe(
      filter((e) => e.userId === userId),
      map(
        (e) =>
          ({
            type: e.event,
            data: e.data,
          } as MessageEvent),
      ),
    );

    // Heartbeat ping every 25 seconds to keep proxies, load balancers, and browsers connected
    const heartbeat$ = interval(25000).pipe(
      map(
        () =>
          ({
            type: 'ping',
            data: { timestamp: Date.now() },
          } as MessageEvent),
      ),
    );

    return merge(userEvents$, heartbeat$);
  }

  async getUserNotifications(userId: string, filterDto: FilterNotificationDto) {
    const page = Math.max(1, filterDto.page ?? 1);
    const limit = Math.min(100, Math.max(1, filterDto.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(filterDto.isRead !== undefined && { isRead: filterDto.isRead }),
      ...(filterDto.type && { type: filterDto.type }),
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

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Notify connected sessions about unread count change
    const unread = await this.getUnreadCount(userId);
    this.emitToUser(userId, 'unread_count', unread);

    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Notify connected sessions about unread count change
    this.emitToUser(userId, 'unread_count', { count: 0 });

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

    // Notify connected sessions about unread count change
    const unread = await this.getUnreadCount(userId);
    this.emitToUser(userId, 'unread_count', unread);

    return { success: true };
  }

  /**
   * Safe single notification dispatcher.
   * Catches any errors so background notification dispatch never breaks main business actions.
   * Emits live SSE event to the recipient user.
   */
  async createNotification(dto: CreateNotificationDto) {
    try {
      const created = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          message: dto.message,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
        },
      });

      if (created) {
        this.emitToUser(created.userId, 'notification', created);
      }

      return created;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${dto.userId}: ${(error as Error).message}`, (error as Error).stack);
      return null;
    }
  }

  /**
   * Safe bulk notification dispatcher with batch insertion.
   * Emits live SSE event to each recipient user.
   */
  async createBulkNotifications(notifications: CreateNotificationDto[]) {
    if (!notifications || notifications.length === 0) {
      return;
    }

    try {
      const createdList = await this.prisma.notification.createManyAndReturn({
        data: notifications.map((n) => ({
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          relatedEntityType: n.relatedEntityType,
          relatedEntityId: n.relatedEntityId,
        })),
      });

      for (const item of createdList) {
        this.emitToUser(item.userId, 'notification', item);
      }
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

  /**
   * Helper to dispatch date change notifications (e.g. dueDate or startDate updated)
   * to currently assigned users (excluding the actor).
   */
  async notifyDateChange(params: {
    recipientUserIds: string[];
    actorId?: string;
    actorName?: string;
    entityType: EntityType;
    entityId: string;
    entityTitle: string;
    dateField: 'due date' | 'start date';
    oldDate?: Date | string | null;
    newDate?: Date | string | null;
  }) {
    const targetUserIds = params.recipientUserIds.filter((id) => id && id !== params.actorId);
    if (targetUserIds.length === 0) return;

    const actorLabel = params.actorName || 'A team member';
    const entityLabel =
      params.entityType === 'CASE' ? 'Case' : params.entityType === 'SUBTASK' ? 'Subtask' : 'Task';

    const formatDate = (d: Date | string | null | undefined): string => {
      if (!d) return '';
      const dateObj = typeof d === 'string' ? new Date(d) : d;
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

    const oldFormatted = formatDate(params.oldDate);
    const newFormatted = formatDate(params.newDate);

    let changeDescription: string;
    if (oldFormatted && newFormatted) {
      changeDescription = `${params.dateField} changed from ${oldFormatted} to ${newFormatted}`;
    } else if (newFormatted) {
      changeDescription = `${params.dateField} was set to ${newFormatted}`;
    } else {
      changeDescription = `${params.dateField} was removed`;
    }

    const notifications: CreateNotificationDto[] = targetUserIds.map((userId) => ({
      userId,
      type: NotificationType.DUE_DATE_REMINDER,
      title: `${entityLabel} ${params.dateField} updated`,
      message: `"${params.entityTitle}" ${changeDescription} by ${actorLabel}`,
      relatedEntityType: params.entityType,
      relatedEntityId: params.entityId,
    }));

    await this.createBulkNotifications(notifications);
  }
}
