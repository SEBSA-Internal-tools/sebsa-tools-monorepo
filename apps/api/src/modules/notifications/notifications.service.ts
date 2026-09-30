import { Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type NotificationClient = Pick<Prisma.TransactionClient, 'notification'>;
// Kept as a typed constant so this compiles before `prisma generate` has been
// run for the accompanying enum migration in a fresh checkout.
export const TASK_REASSIGNED_NOTIFICATION = 'TASK_REASSIGNED' as NotificationType;

export interface CreateNotificationInput {
  taskId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(recipientId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async markRead(id: string, recipientId: string) {
    const owned = await this.prisma.notification.findFirst({ where: { id, recipientId } });
    if (!owned) throw new NotFoundException('Notification not found');

    const row = owned.isRead
      ? owned
      : await this.prisma.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
        });
    return this.toResponse(row);
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  create(client: NotificationClient, input: CreateNotificationInput) {
    return client.notification.create({
      data: {
        taskId: input.taskId,
        recipientId: input.recipientId,
        notificationType: input.type,
        title: input.title,
        message: input.message,
      },
    });
  }

  createMany(client: NotificationClient, inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return Promise.resolve({ count: 0 });
    return client.notification.createMany({
      data: inputs.map((input) => ({
        taskId: input.taskId,
        recipientId: input.recipientId,
        notificationType: input.type,
        title: input.title,
        message: input.message,
      })),
    });
  }

  private toResponse(row: Notification) {
    const kind = {
      TASK_APPROVED: 'TaskApproved',
      CHANGES_REQUESTED: 'ChangesRequested',
      TASK_RESUBMITTED: 'TaskResubmitted',
      TASK_ASSIGNED: 'TaskAssigned',
      TASK_REASSIGNED: 'TaskReassigned',
      TASK_HANDOVER: 'TaskHandedOver',
      TASK_CANCELLED: 'TaskCancelled',
      TASK_SUBMITTED: 'TaskAssigned',
      TASK_DELIVERED: 'TaskApproved',
    }[row.notificationType];

    const href =
      row.taskId === null
        ? '/crp'
        : row.notificationType === 'TASK_HANDOVER'
          ? '/crp/admin/handovers'
          : row.notificationType === 'TASK_APPROVED' ||
              row.notificationType === 'CHANGES_REQUESTED' ||
              row.notificationType === 'TASK_DELIVERED'
            ? `/crp/developer/tasks/${row.taskId}`
            : `/crp/reviewer/tasks/${row.taskId}`;

    return {
      id: row.id,
      kind,
      title: row.title,
      body: row.message,
      href,
      taskId: row.taskId,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
