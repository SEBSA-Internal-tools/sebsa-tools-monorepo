import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ReviewerAssignmentType, TaskStatus } from '@prisma/client';
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

describe('ReviewTasksService draft checklist', () => {
  it('returns partial saved answers so an owned draft can be restored', async () => {
    const user = actor(['DEVELOPER']);
    const updatedAt = new Date('2026-02-01T10:00:00.000Z');
    const findUnique = vi.fn().mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000010',
      developerId: user.id,
      currentReviewerId: null,
      status: TaskStatus.DRAFT,
      checklistCompleted: false,
      taskTypes: [{ taskTypeId: 4 }],
      codeReviewForms: [],
      developerChecklist: {
        id: '00000000-0000-0000-0000-000000000020',
        developerId: user.id,
        additionalRemarks: 'One answer so far',
        checkedDate: null,
        updatedAt,
        answers: [
          {
            questionId: '00000000-0000-0000-0000-000000000030',
            answer: 'NO',
            question: {
              questionText: 'Has the report been checked?',
              section: { name: 'Quick Reports' },
            },
          },
        ],
      },
    });
    const service = new ReviewTasksService({ task: { findUnique } } as never);

    await expect(
      service.findChecklist('00000000-0000-0000-0000-000000000010', user),
    ).resolves.toEqual({
      id: '00000000-0000-0000-0000-000000000020',
      taskId: '00000000-0000-0000-0000-000000000010',
      taskTypeIds: ['4'],
      answers: [
        {
          questionId: '00000000-0000-0000-0000-000000000030',
          answer: 'No',
          questionText: 'Has the report been checked?',
          categoryName: 'Quick Reports',
          order: 0,
        },
      ],
      remarks: 'One answer so far',
      isComplete: false,
      checkedDate: updatedAt.toISOString(),
      developerId: user.id,
    });
  });
});

describe('ReviewTasksService task picking', () => {
  it('atomically claims an available task and records assignment and status history', async () => {
    const user = actor(['REVIEWER']);
    const candidate = {
      developerId: '00000000-0000-0000-0000-000000000099',
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
    };
    const picked = {
      id: '00000000-0000-0000-0000-000000000010',
      taskCode: 'TEST-01',
      title: 'Test task',
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId: candidate.developerId,
      currentReviewerId: user.id,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: { fullName: user.name },
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new ReviewTasksService({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    } as never);

    const result = await service.pick(picked.id, user);

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: picked.id,
        developerId: { not: user.id },
        currentReviewerId: null,
        status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
      },
      data: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
    });
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: {
        taskId: picked.id,
        reviewerId: user.id,
        assignedBy: user.id,
        assignmentType: ReviewerAssignmentType.SELF_PICKED,
      },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: {
        taskId: picked.id,
        oldStatus: TaskStatus.SUBMITTED,
        newStatus: TaskStatus.IN_REVIEW,
        changedBy: user.id,
        remarks: 'Task picked up for review',
      },
    });
    expect(result).toMatchObject({
      id: picked.id,
      status: 'InReview',
      reviewerId: user.id,
      reviewerName: user.name,
    });
  });

  it('rejects a concurrent pick that lost the claim race', async () => {
    const user = actor(['REVIEWER']);
    const tx = {
      task: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            developerId: 'another-developer',
            currentReviewerId: null,
            currentReviewer: null,
            status: TaskStatus.SUBMITTED,
          })
          .mockResolvedValueOnce({ currentReviewer: { fullName: 'Winning Reviewer' } }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new ReviewTasksService({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    } as never);

    await expect(service.pick('task-id', user)).rejects.toThrow(
      new ConflictException('Winning Reviewer has already picked up this task'),
    );
  });

  it('prevents a Developer and Reviewer user from picking their own submission', async () => {
    const user = actor(['DEVELOPER', 'REVIEWER']);
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValue({
          developerId: user.id,
          currentReviewerId: null,
          currentReviewer: null,
          status: TaskStatus.SUBMITTED,
        }),
      },
    };
    const service = new ReviewTasksService({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    } as never);

    await expect(service.pick('task-id', user)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
