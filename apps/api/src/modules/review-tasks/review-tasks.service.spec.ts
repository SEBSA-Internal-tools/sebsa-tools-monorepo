import { ForbiddenException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTasksService } from './review-tasks.service.js';

function actor(roles: RoleCode[]): AuthenticatedUser {
  return {
    id: '122f5c16-7522-4b2e-b9b4-a6ac68fbf713',
    email: 'actor@example.com',
    name: 'Actor',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session-id',
  };
}

describe('ReviewTasksService list visibility', () => {
  it('limits the Developer list to tasks owned by that developer', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReviewTasksService({ task: { findMany } } as never);
    const user = actor(['DEVELOPER']);

    await service.findAll(user, 'mine');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { developerId: user.id } }),
    );
  });

  it('excludes a dual-role user own tasks and drafts from Reviewer queues', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReviewTasksService({ task: { findMany } } as never);
    const user = actor(['DEVELOPER', 'REVIEWER']);

    await service.findAll(user, 'available');
    await service.findAll(user, 'assigned');
    await service.findAll(user, 'history');

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          currentReviewerId: null,
          status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
        },
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          currentReviewerId: user.id,
          status: TaskStatus.IN_REVIEW,
        },
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          developerId: { not: user.id },
          status: { not: TaskStatus.DRAFT },
          codeReviewForms: { some: { reviewerId: user.id, decision: { not: null } } },
          NOT: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
        },
      }),
    );
  });

  it('does not let a caller widen their task scope', async () => {
    const service = new ReviewTasksService({ task: { findMany: vi.fn() } } as never);

    await expect(service.findAll(actor(['DEVELOPER']), 'all')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.findAll(actor(['DEVELOPER']), 'available')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks a Reviewer from opening another developer draft directly', async () => {
    const user = actor(['REVIEWER']);
    const service = new ReviewTasksService({
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-id',
          developerId: 'another-developer',
          currentReviewerId: user.id,
          status: TaskStatus.DRAFT,
          codeReviewForms: [],
        }),
      },
    } as never);

    await expect(service.findOne('task-id', user)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
