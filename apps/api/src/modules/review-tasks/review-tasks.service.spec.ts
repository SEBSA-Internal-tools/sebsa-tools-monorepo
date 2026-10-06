import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HandoverStatus, ReviewerAssignmentType, TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { deriveTaskReviewCycles, ReviewTasksService } from './review-tasks.service.js';

const audit = { record: vi.fn().mockResolvedValue(undefined) };
const notifications = {
  create: vi.fn().mockResolvedValue({}),
  createMany: vi.fn().mockResolvedValue({ count: 0 }),
};
const serviceWith = (prisma: unknown) =>
  new ReviewTasksService(prisma as never, audit as never, notifications as never);

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

describe('ReviewTasksService task versions', () => {
  it('increments versions within the matching Customer and CRIM ID only', async () => {
    const customerId = '00000000-0000-0000-0000-000000000020';
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ version: '1' }, { version: 'V5' }, { version: 'legacy' }])
      .mockResolvedValueOnce([]);
    const customer = { findUnique: vi.fn().mockResolvedValue({ code: 'CUST' }) };
    const service = serviceWith({ customer, task: { findMany } });

    await expect(service.nextVersion(customerId, ' CRIM-1001 ')).resolves.toEqual({
      version: 0,
      title: 'CUST-CRIM-1001-0',
    });
    await expect(service.nextVersion(customerId, 'CRIM-1001')).resolves.toEqual({
      version: 6,
      title: 'CUST-CRIM-1001-6',
    });
    await expect(service.nextVersion(customerId, ' Test 0 ')).resolves.toEqual({
      version: 0,
      title: 'CUST-Test-0-0',
    });
    expect(customer.findUnique).toHaveBeenCalledWith({
      where: { id: customerId },
      select: { code: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { customerId, crimId: { equals: 'CRIM-1001', mode: 'insensitive' } },
      select: { version: true },
    });
  });
});

describe('ReviewTasksService review round and counted-cycle projection', () => {
  it('keeps round and counted-cycle values independent', () => {
    const result = deriveTaskReviewCycles(3, [
      { roundNumber: 1, counted: true },
      { roundNumber: 2, counted: true },
    ]);

    expect(result).toEqual({ reviewCycle: 2, historicalCycle: 3, adjustedCycles: [] });
  });

  it('reports zero counted cycles without reducing or renumbering the round', () => {
    const result = deriveTaskReviewCycles(2, [
      { roundNumber: 1, counted: false },
    ]);

    expect(result).toEqual({ reviewCycle: 0, historicalCycle: 2, adjustedCycles: [1] });
  });

  it('starts at round zero with no counted cycles', () => {
    expect(deriveTaskReviewCycles(0, [])).toEqual({
      reviewCycle: 0,
      historicalCycle: 0,
      adjustedCycles: [],
    });
  });
});

describe('ReviewTasksService list visibility', () => {
  it('limits the Admin list to tasks that have been submitted', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });

    await service.findAll(actor(['ADMIN']), 'all');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: TaskStatus.DRAFT },
          submittedAt: { not: null },
        },
      }),
    );
  });

  it('limits the Developer list to tasks owned by that developer', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });
    const user = actor(['DEVELOPER']);

    await service.findAll(user, 'mine');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { developerId: user.id } }),
    );
  });

  it('excludes a dual-role user own tasks and drafts from Reviewer queues', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ task: { findMany } });
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
    const service = serviceWith({ task: { findMany: vi.fn() } });

    await expect(service.findAll(actor(['DEVELOPER']), 'all')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.findAll(actor(['DEVELOPER']), 'available')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('blocks a Reviewer from opening another developer draft directly', async () => {
    const user = actor(['REVIEWER']);
    const service = serviceWith({
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'task-id',
          developerId: 'another-developer',
          currentReviewerId: user.id,
          status: TaskStatus.DRAFT,
          codeReviewForms: [],
          handovers: [],
        }),
      },
    });

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
      handovers: [],
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
    const service = serviceWith({ task: { findUnique } });

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

describe('ReviewTasksService draft discard', () => {
  const taskId = '00000000-0000-4000-8000-000000000010';

  function deletionPrisma(task: {
    developerId: string;
    status: TaskStatus;
    submittedAt: Date | null;
  }) {
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValue({
          id: taskId,
          title: 'Draft task',
          taskCode: 'CUST-CRIM-0',
          developerChecklist: null,
          ...task,
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
      taskStatusHistory: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskTaskType: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    return {
      tx,
      prisma: {
        $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      },
    };
  }

  it('permanently removes an owned, unsubmitted Developer draft', async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: user.id,
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).resolves.toBeUndefined();

    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
  });

  it("does not let a Developer discard another user's draft", async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: '00000000-0000-4000-8000-000000000099',
      status: TaskStatus.DRAFT,
      submittedAt: null,
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('does not let a Developer discard a submitted task', async () => {
    const user = actor(['DEVELOPER']);
    const { prisma, tx } = deletionPrisma({
      developerId: user.id,
      status: TaskStatus.SUBMITTED,
      submittedAt: new Date('2026-02-02T10:00:00.000Z'),
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.task.delete).not.toHaveBeenCalled();
  });

  it('preserves existing Admin deletion access', async () => {
    const user = actor(['ADMIN']);
    const { prisma, tx } = deletionPrisma({
      developerId: '00000000-0000-4000-8000-000000000099',
      status: TaskStatus.SUBMITTED,
      submittedAt: new Date('2026-02-02T10:00:00.000Z'),
    });
    const service = serviceWith(prisma);

    await expect(service.remove(taskId, user)).resolves.toBeUndefined();
    expect(tx.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
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
      title: 'Test task',
      currentReviewCycle: 1,
      handovers: [],
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
      handovers: [],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000201' }),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

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
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
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
      title: 'TEST-CRIM-1',
      status: 'InReview',
      reviewerId: user.id,
      reviewerName: user.name,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientId: candidate.developerId,
        type: 'TASK_ASSIGNED',
        title: 'Test task picked for review',
      }),
    );
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
            title: 'Test task',
            handovers: [],
          })
          .mockResolvedValueOnce({ currentReviewer: { fullName: 'Winning Reviewer' } }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

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
          title: 'Own task',
          handovers: [],
        }),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.pick('task-id', user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the previous reviewer retake a handed-over task and resolves the handover', async () => {
    const user = actor(['REVIEWER']);
    const handoverId = '00000000-0000-0000-0000-000000000030';
    const taskId = '00000000-0000-0000-0000-000000000010';
    const candidate = {
      developerId: '00000000-0000-0000-0000-000000000099',
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
      title: 'Handed-over task',
      currentReviewCycle: 1,
      handovers: [
        {
          id: handoverId,
          reason: 'Temporary workload conflict',
          fromReviewerId: user.id,
          fromReviewer: { fullName: user.name },
        },
      ],
    };
    const picked = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
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
      handovers: [
        {
          status: HandoverStatus.REASSIGNED,
          fromReviewer: { fullName: user.name },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000202' }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await expect(service.pick(taskId, user)).resolves.toMatchObject({
      id: taskId,
      reviewerId: user.id,
      handedOverByName: user.name,
    });
    expect(tx.handoverTask.updateMany).toHaveBeenCalledWith({
      where: { taskId, status: HandoverStatus.PENDING },
      data: {
        status: HandoverStatus.REASSIGNED,
        toReviewerId: user.id,
        reassignedBy: user.id,
        reassignedAt: expect.any(Date),
      },
    });
    expect(tx.taskReviewerAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId,
        reviewerId: user.id,
        assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
      }),
    });
    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientId: candidate.developerId,
        type: 'TASK_ASSIGNED',
      }),
    );
  });

  it('notifies the previous Reviewer and Admins when another Reviewer picks a handover', async () => {
    const user = actor(['REVIEWER']);
    const taskId = '00000000-0000-0000-0000-000000000010';
    const developerId = '00000000-0000-0000-0000-000000000099';
    const previousReviewerId = '00000000-0000-0000-0000-000000000098';
    const adminId = '00000000-0000-0000-0000-000000000097';
    const candidate = {
      developerId,
      currentReviewerId: null,
      currentReviewer: null,
      status: TaskStatus.SUBMITTED,
      title: 'Handed-over task',
      currentReviewCycle: 1,
      handovers: [
        {
          id: '00000000-0000-0000-0000-000000000030',
          reason: 'Temporary workload conflict',
          fromReviewerId: previousReviewerId,
          fromReviewer: { fullName: 'Previous Reviewer' },
        },
      ],
    };
    const picked = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      developerId,
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
      handovers: [
        {
          status: HandoverStatus.REASSIGNED,
          fromReviewer: { fullName: 'Previous Reviewer' },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(picked),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskReviewerAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000203' }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: adminId },
            { id: user.id },
            { id: developerId },
            { id: previousReviewerId },
          ]),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    await service.pick(taskId, user);

    expect(notifications.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ recipientId: developerId }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        recipientId: previousReviewerId,
        message: `${user.name} picked up the review task you handed over.`,
      }),
      expect.objectContaining({
        recipientId: adminId,
        message: `${user.name} picked up the handed-over review task.`,
      }),
    ]);
  });
});

describe('ReviewTasksService handover', () => {
  it('removes the assigned reviewer, records the reason, and returns the task to pickup', async () => {
    const reviewer = actor(['REVIEWER']);
    const taskId = '00000000-0000-0000-0000-000000000010';
    const adminId = '00000000-0000-0000-0000-000000000011';
    const eligibleReviewerId = '00000000-0000-0000-0000-000000000012';
    const candidate = {
      id: taskId,
      title: 'Test task',
      developerId: '00000000-0000-0000-0000-000000000099',
      status: TaskStatus.IN_REVIEW,
      currentReviewCycle: 1,
      currentReviewerId: reviewer.id,
      currentReviewer: { fullName: reviewer.name },
      handovers: [],
    };
    const updated = {
      id: taskId,
      taskCode: 'TEST-01',
      title: candidate.title,
      crimId: 'CRIM-1',
      version: null,
      customerId: '00000000-0000-0000-0000-000000000020',
      priority: 'MEDIUM',
      status: TaskStatus.SUBMITTED,
      currentReviewCycle: 1,
      developerId: candidate.developerId,
      currentReviewerId: null,
      checklistCompleted: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      submittedAt: new Date('2026-01-01T01:00:00.000Z'),
      customer: { name: 'Test', code: 'TEST', color: '#123456' },
      developer: { fullName: 'Developer' },
      currentReviewer: null,
      taskTypes: [],
      developerChecklist: null,
      codeReviewForms: [],
      handovers: [
        {
          status: 'PENDING',
          fromReviewer: { fullName: reviewer.name },
        },
      ],
    };
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      handoverTask: {
        create: vi.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000030' }),
      },
      taskReviewerAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: adminId }])
          .mockResolvedValueOnce([{ id: eligibleReviewerId }]),
      },
    };
    const service = serviceWith({
      $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    });

    const draft = {
      rank: null,
      comments: [],
      generalCheck: [],
      findings: {
        incorrectCode: '',
        incompleteImplementation: '',
        sourceFormatting: '',
      },
      otherRemarks: 'Preserve this draft',
      feedbackSummary: '',
    };
    const result = await service.handover(
      taskId,
      { reason: 'On leave next week.', draft },
      reviewer,
    );

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: taskId, currentReviewerId: reviewer.id, status: TaskStatus.IN_REVIEW },
      data: { currentReviewerId: null, status: TaskStatus.SUBMITTED },
    });
    expect(tx.handoverTask.create).toHaveBeenCalledWith({
      data: {
        taskId,
        fromReviewerId: reviewer.id,
        reason: 'On leave next week.',
        status: 'PENDING',
      },
    });
    expect(result).toMatchObject({
      id: taskId,
      status: 'Submitted',
      reviewerId: null,
      isHandedOver: true,
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      reviewer,
      expect.objectContaining({
        actionType: 'TASK_HANDOVER',
        newValue: expect.objectContaining({ reason: 'On leave next week.' }),
        metadata: { reviewDraft: draft },
      }),
    );
    expect(notifications.createMany).toHaveBeenCalledWith(tx, [
      expect.objectContaining({
        recipientId: updated.developerId,
        title: 'Test task handed over',
        message: `${reviewer.name} handed over your review task for reassignment.`,
      }),
      expect.objectContaining({
        recipientId: eligibleReviewerId,
        title: 'Test task available to pick',
        message: `${reviewer.name} handed over this review task. It is now available to pick.`,
      }),
      expect.objectContaining({
        recipientId: adminId,
        title: 'Test task handed over',
        message: `${reviewer.name} handed over this review task for reassignment.`,
      }),
    ]);
  });
});
