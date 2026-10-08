import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type NotificationClient = Pick<Prisma.TransactionClient, 'notification'>;
// Kept as a typed constant so this compiles before `prisma generate` has been
// run for the accompanying enum migration in a fresh checkout.
export const TASK_REASSIGNED_NOTIFICATION = 'TASK_REASSIGNED' as NotificationType;

type NotificationWithTask = Notification & { task: { developerId: string } | null };

interface RecipientContext {
  id: string;
  isAdmin: boolean;
  isReviewer: boolean;
}

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
    const [rows, recipient] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId },
        include: { task: { select: { developerId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.recipientRoles(recipientId),
    ]);
    return rows.map((row) => this.toResponse(row, recipient));
  }

  async markRead(id: string, recipientId: string) {
    const owned = await this.prisma.notification.findUnique({
      where: { id },
      include: { task: { select: { developerId: true } } },
    });
    if (!owned) throw new NotFoundException('Notification not found');
    // Someone else's notification exists but is not yours to touch.
    if (owned.recipientId !== recipientId) {
      throw new ForbiddenException('This notification belongs to another user');
    }
    const recipient = await this.recipientRoles(recipientId);

    const row = owned.isRead
      ? owned
      : await this.prisma.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
          include: { task: { select: { developerId: true } } },
        });
    return this.toResponse(row, recipient);
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

  private async recipientRoles(recipientId: string): Promise<RecipientContext> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: recipientId, role: { deletedAt: null } },
      select: { role: { select: { code: true } } },
    });
    const codes = roles.map(({ role }) => role.code);
    return {
      id: recipientId,
      isAdmin: codes.includes('ADMIN') || codes.includes('SUPER_ADMIN'),
      isReviewer: codes.includes('REVIEWER'),
    };
  }

  /**
   * Where a notification takes this recipient: the screen for *their* part in
   * the task (frontend mocks/handlers.ts). The developer opens their task, a
   * reviewer the review, an admin the handover queue or the admin task view.
   */
  private hrefFor(row: NotificationWithTask, recipient: RecipientContext): string {
    if (row.taskId === null) return '/crp';
    const taskId = encodeURIComponent(row.taskId);
    if (row.task?.developerId === recipient.id) return `/crp/developer/tasks/${taskId}`;
    if (row.notificationType === 'TASK_HANDOVER' && recipient.isAdmin) return '/crp/admin/handovers';
    if (recipient.isReviewer) return `/crp/reviewer/tasks/${taskId}`;
    if (recipient.isAdmin) return `/crp/admin/tasks/${taskId}`;
    return '/crp';
  }

  private toResponse(row: NotificationWithTask, recipient: RecipientContext) {
    const kind = {
      TASK_APPROVED: 'TaskApproved',
      CHANGES_REQUESTED: 'ChangesRequested',
      TASK_RESUBMITTED: 'TaskResubmitted',
      TASK_ASSIGNED: 'TaskAssigned',
      TASK_REASSIGNED: 'TaskReassigned',
      TASK_HANDOVER: 'TaskHandedOver',
      TASK_CANCELLED: 'TaskCancelled',
      TASK_SUBMITTED: 'TaskSubmitted',
      TASK_DELIVERED: 'TaskApproved',
    }[row.notificationType];

    const href = this.hrefFor(row, recipient);

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
