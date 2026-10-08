import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

const recipientId = '00000000-0000-0000-0000-000000000001';
const otherUserId = '00000000-0000-0000-0000-000000000002';
const notificationId = '00000000-0000-0000-0000-000000000003';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: notificationId,
    taskId: '00000000-0000-0000-0000-000000000004',
    recipientId,
    notificationType: NotificationType.TASK_APPROVED,
    title: 'Payment validation approved',
    message: 'Review User approved your code review task.',
    isRead: false,
    readAt: null,
    emailSent: false,
    emailSentAt: null,
    createdAt: new Date('2026-09-30T08:00:00.000Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  it('lists only the authenticated recipient, newest first', async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const service = new NotificationsService({ notification: { findMany } } as never);

    await expect(service.findAll(recipientId)).resolves.toEqual([
      expect.objectContaining({
        kind: 'TaskApproved',
        title: 'Payment validation approved',
        href: '/crp/developer/tasks/00000000-0000-0000-0000-000000000004',
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { recipientId },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('identifies a newly submitted task notification', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({
        notificationType: NotificationType.TASK_SUBMITTED,
        title: 'Payment validation submitted for review',
      }),
    ]);
    const service = new NotificationsService({ notification: { findMany } } as never);

    await expect(service.findAll(recipientId)).resolves.toEqual([
      expect.objectContaining({
        kind: 'TaskSubmitted',
        title: 'Payment validation submitted for review',
      }),
    ]);
  });

  it('does not reveal or mutate another user notification', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const service = new NotificationsService({ notification: { findFirst, update } } as never);

    await expect(service.markRead(notificationId, otherUserId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: notificationId, recipientId: otherUserId },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('marks only the current user unread notifications as read', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new NotificationsService({ notification: { updateMany } } as never);

    await service.markAllRead(recipientId);
    expect(updateMany).toHaveBeenCalledWith({
      where: { recipientId, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
});
