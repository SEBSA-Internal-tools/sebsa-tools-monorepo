import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@sebsa-pm-tool/core';
import { EntityType, NotificationType } from '@prisma/client';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Runs every hour to check for upcoming deadlines and overdue tasks/cases.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleDeadlineChecks() {
    this.logger.log('Starting automated deadline checks for tasks and cases...');
    try {
      await Promise.all([
        this.checkDueSoonTasks(),
        this.checkOverdueTasks(),
        this.checkDueSoonCases(),
        this.checkOverdueCases(),
      ]);
      this.logger.log('Completed automated deadline checks.');
    } catch (error) {
      this.logger.error(`Error executing deadline checks: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  /**
   * Checks tasks due within the next 24 hours.
   */
  async checkDueSoonTasks() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const since20HoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: {
          gte: now,
          lte: in24Hours,
        },
        assignees: { some: {} },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
    });

    const notifications: CreateNotificationDto[] = [];

    for (const task of tasks) {
      if (!task.dueDate) continue;

      for (const assignee of task.assignees) {
        // Prevent duplicate alerts sent in the last 20 hours
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: assignee.userId,
            type: NotificationType.DUE_DATE_REMINDER,
            relatedEntityType: EntityType.TASK,
            relatedEntityId: task.id,
            createdAt: { gte: since20HoursAgo },
          },
          select: { id: true },
        });

        if (!alreadySent) {
          const dueDateStr = task.dueDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          notifications.push({
            userId: assignee.userId,
            type: NotificationType.DUE_DATE_REMINDER,
            title: 'Task due soon',
            message: `"${task.title}" is due soon (${dueDateStr}).`,
            relatedEntityType: EntityType.TASK,
            relatedEntityId: task.id,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await this.notificationService.createBulkNotifications(notifications);
      this.logger.log(`Dispatched ${notifications.length} upcoming task due date reminder(s).`);
    }
  }

  /**
   * Checks tasks that are past their due date.
   */
  async checkOverdueTasks() {
    const now = new Date();
    const since24HoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: {
          lt: now,
        },
        assignees: { some: {} },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
    });

    const notifications: CreateNotificationDto[] = [];

    for (const task of tasks) {
      if (!task.dueDate) continue;

      for (const assignee of task.assignees) {
        // Prevent duplicate alerts sent within the last 24 hours
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: assignee.userId,
            type: NotificationType.OVERDUE_ALERT,
            relatedEntityType: EntityType.TASK,
            relatedEntityId: task.id,
            createdAt: { gte: since24HoursAgo },
          },
          select: { id: true },
        });

        if (!alreadySent) {
          const dueDateStr = task.dueDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          notifications.push({
            userId: assignee.userId,
            type: NotificationType.OVERDUE_ALERT,
            title: 'Task is overdue',
            message: `"${task.title}" was due on ${dueDateStr} and is currently overdue.`,
            relatedEntityType: EntityType.TASK,
            relatedEntityId: task.id,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await this.notificationService.createBulkNotifications(notifications);
      this.logger.log(`Dispatched ${notifications.length} overdue task alert(s).`);
    }
  }

  /**
   * Checks cases due within the next 24 hours.
   */
  async checkDueSoonCases() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const since20HoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

    const cases = await this.prisma.case.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: {
          gte: now,
          lte: in24Hours,
        },
        assignees: { some: {} },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
    });

    const notifications: CreateNotificationDto[] = [];

    for (const kase of cases) {
      if (!kase.dueDate) continue;

      for (const assignee of kase.assignees) {
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: assignee.userId,
            type: NotificationType.DUE_DATE_REMINDER,
            relatedEntityType: EntityType.CASE,
            relatedEntityId: kase.id,
            createdAt: { gte: since20HoursAgo },
          },
          select: { id: true },
        });

        if (!alreadySent) {
          const dueDateStr = kase.dueDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          notifications.push({
            userId: assignee.userId,
            type: NotificationType.DUE_DATE_REMINDER,
            title: 'Case due soon',
            message: `Case "${kase.title}" is due soon (${dueDateStr}).`,
            relatedEntityType: EntityType.CASE,
            relatedEntityId: kase.id,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await this.notificationService.createBulkNotifications(notifications);
      this.logger.log(`Dispatched ${notifications.length} upcoming case reminder(s).`);
    }
  }

  /**
   * Checks cases that are past their due date.
   */
  async checkOverdueCases() {
    const now = new Date();
    const since24HoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const cases = await this.prisma.case.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: {
          lt: now,
        },
        assignees: { some: {} },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
    });

    const notifications: CreateNotificationDto[] = [];

    for (const kase of cases) {
      if (!kase.dueDate) continue;

      for (const assignee of kase.assignees) {
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: assignee.userId,
            type: NotificationType.OVERDUE_ALERT,
            relatedEntityType: EntityType.CASE,
            relatedEntityId: kase.id,
            createdAt: { gte: since24HoursAgo },
          },
          select: { id: true },
        });

        if (!alreadySent) {
          const dueDateStr = kase.dueDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          notifications.push({
            userId: assignee.userId,
            type: NotificationType.OVERDUE_ALERT,
            title: 'Case is overdue',
            message: `Case "${kase.title}" was due on ${dueDateStr} and is currently overdue.`,
            relatedEntityType: EntityType.CASE,
            relatedEntityId: kase.id,
          });
        }
      }
    }

    if (notifications.length > 0) {
      await this.notificationService.createBulkNotifications(notifications);
      this.logger.log(`Dispatched ${notifications.length} overdue case alert(s).`);
    }
  }
}
