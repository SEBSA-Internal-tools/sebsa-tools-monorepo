import { HandoverStatus, ReviewerAssignmentType, TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { HandoversService } from './handovers.service.js';

const actor: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  name: 'Admin User',
  roles: ['ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

describe('HandoversService.reassign', () => {
  it('can reassign a pending handover back to the previous active Reviewer', async () => {
    const handoverId = '00000000-0000-0000-0000-000000000010';
    const taskId = '00000000-0000-0000-0000-000000000020';
    const previousReviewer = {
      id: '00000000-0000-0000-0000-000000000030',
      fullName: 'Previous Reviewer',
    };
    const reviewer = {
      id: previousReviewer.id,
      fullName: previousReviewer.fullName,
    };
    const requestedAt = new Date('2026-09-29T08:00:00.000Z');
    const reassignedAt = new Date('2026-09-29T09:00:00.000Z');
    const existing = {
      id: handoverId,
      taskId,
      fromReviewerId: previousReviewer.id,
      reason: 'Unavailable this week',
      status: HandoverStatus.PENDING,
      task: {
        id: taskId,
        title: 'Task under review',
        developerId: '00000000-0000-0000-0000-000000000099',
        status: TaskStatus.SUBMITTED,
      },
      fromReviewer: previousReviewer,
    };
    const updated = {
      ...existing,
      status: HandoverStatus.REASSIGNED,
      toReviewerId: reviewer.id,
      reassignedBy: actor.id,
      requestedAt,
      reassignedAt,
      toReviewer: reviewer,
    };
    const tx = {
      handoverTask: {
        findUnique: vi.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findFirst: vi.fn().mockResolvedValue(reviewer) },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const notifications = { create: vi.fn().mockResolvedValue({}) };
    const service = new HandoversService(prisma as never, audit as never, notifications as never);

    await expect(service.reassign(handoverId, { reviewerId: reviewer.id }, actor)).resolves.toEqual(
      {
        id: handoverId,
        taskId,
        fromReviewerId: previousReviewer.id,
        fromReviewerName: previousReviewer.fullName,
        reason: existing.reason,
        status: 'Reassigned',
        reassignedToId: reviewer.id,
        reassignedToName: reviewer.fullName,
        reassignedById: actor.id,
        createdAt: requestedAt.toISOString(),
        resolvedAt: reassignedAt.toISOString(),
      },
    );
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId,
        reviewerId: reviewer.id,
        assignedBy: actor.id,
        assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({
        actionType: 'HANDOVER_REASSIGNED',
        targetUserId: reviewer.id,
        oldValue: expect.objectContaining({
          reviewerName: previousReviewer.fullName,
          reason: existing.reason,
        }),
        newValue: expect.objectContaining({ reviewerName: reviewer.fullName }),
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        taskId,
        recipientId: reviewer.id,
        title: 'Task under review reassigned to you',
      }),
    );
  });
});
