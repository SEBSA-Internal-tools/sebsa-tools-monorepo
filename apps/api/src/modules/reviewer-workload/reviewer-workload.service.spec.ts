import { TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewerWorkloadService } from './reviewer-workload.service.js';

const REVIEWER_ID = '00000000-0000-4000-8000-000000000020';
const OTHER_REVIEWER = '00000000-0000-4000-8000-000000000021';

const admin: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.com',
  name: 'An Admin',
  roles: ['ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

function task(id: string, code: string, status: TaskStatus, extra: Record<string, unknown> = {}) {
  return { id, taskCode: code, title: `Task ${code}`, status, ...extra };
}

function harness(rows: { inReview?: unknown[]; awaiting?: unknown[]; handovers?: unknown[] }) {
  const prisma = {
    task: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(rows.inReview ?? [])
        .mockResolvedValueOnce(rows.awaiting ?? []),
    },
    handoverTask: { findMany: vi.fn().mockResolvedValue(rows.handovers ?? []) },
    auditLog: { create: vi.fn() },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new ReviewerWorkloadService(prisma as never, audit as never);
  return { audit, prisma, service };
}

describe('ReviewerWorkloadService.pendingFor', () => {
  it('lists in-review, awaiting-resubmission and handover work', async () => {
    const { service } = harness({
      inReview: [task('t1', 'A-1', TaskStatus.IN_REVIEW)],
      awaiting: [
        task('t2', 'A-2', TaskStatus.CHANGES_REQUESTED, {
          resubmissionReviewerId: null,
          codeReviewForms: [{ reviewerId: REVIEWER_ID }],
        }),
      ],
      handovers: [{ task: task('t3', 'A-3', TaskStatus.IN_REVIEW) }],
    });

    await expect(service.pendingFor(REVIEWER_ID)).resolves.toEqual([
      { id: 't1', taskCode: 'A-1', title: 'Task A-1', status: 'InReview', kind: 'InReview' },
      {
        id: 't2',
        taskCode: 'A-2',
        title: 'Task A-2',
        status: 'ChangesRequested',
        kind: 'AwaitingResubmission',
      },
      { id: 't3', taskCode: 'A-3', title: 'Task A-3', status: 'InReview', kind: 'Handover' },
    ]);
  });

  it('ignores a changes-requested task whose latest decision or follow-up belongs to someone else', async () => {
    const { service } = harness({
      awaiting: [
        // An earlier round was theirs, but the latest request came from another reviewer.
        task('t4', 'B-1', TaskStatus.CHANGES_REQUESTED, {
          resubmissionReviewerId: null,
          codeReviewForms: [{ reviewerId: OTHER_REVIEWER }],
        }),
        // An admin moved the follow-up to another reviewer.
        task('t5', 'B-2', TaskStatus.CHANGES_REQUESTED, {
          resubmissionReviewerId: OTHER_REVIEWER,
          codeReviewForms: [{ reviewerId: REVIEWER_ID }],
        }),
      ],
    });

    await expect(service.pendingFor(REVIEWER_ID)).resolves.toEqual([]);
  });

  it('looks up pending handovers the reviewer started or was given', async () => {
    const { prisma, service } = harness({});

    await service.pendingFor(REVIEWER_ID);

    expect(prisma.handoverTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PENDING',
          OR: [{ fromReviewerId: REVIEWER_ID }, { toReviewerId: REVIEWER_ID }],
        },
      }),
    );
  });
});

describe('ReviewerWorkloadService pending handovers', () => {
  const removals = ['DEACTIVATE', 'REMOVE_REVIEWER_ROLE', 'DELETE'] as const;

  it.each(removals)('blocks %s for the originator of a pending handover', async (removal) => {
    // fromReviewerId = reviewer, toReviewerId = null; the task waits in the pool.
    const { audit, service } = harness({
      handovers: [{ task: task('t6', 'C-1', TaskStatus.RESUBMITTED) }],
    });

    await expect(
      service.assertCanRemoveReviewer({ id: REVIEWER_ID, fullName: 'Rev' }, admin, removal),
    ).rejects.toMatchObject({
      code: 'REVIEWER_HAS_PENDING_TASKS',
      details: { tasks: [expect.objectContaining({ id: 't6', kind: 'Handover' })] },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      admin,
      expect.objectContaining({
        targetUserId: REVIEWER_ID,
        metadata: expect.objectContaining({ pendingTaskIds: ['t6'] }),
      }),
    );
  });

  it('still blocks the target of a pending handover', async () => {
    const { prisma, service } = harness({
      handovers: [{ task: task('t7', 'C-2', TaskStatus.IN_REVIEW) }],
    });

    await expect(
      service.assertNoPendingWork(prisma as never, { id: REVIEWER_ID, fullName: 'Rev' }),
    ).rejects.toMatchObject({ code: 'REVIEWER_HAS_PENDING_TASKS' });
  });

  it('releases the reviewer once the handover is reassigned or returned to the queue', async () => {
    // Resolved and returned-to-queue handovers are not PENDING, so the query returns none.
    const { audit, service } = harness({ handovers: [] });

    await expect(
      service.assertCanRemoveReviewer({ id: REVIEWER_ID, fullName: 'Rev' }, admin, 'DEACTIVATE'),
    ).resolves.toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('ReviewerWorkloadService.assertCanRemoveReviewer', () => {
  it('passes, writing nothing, when there is no pending work', async () => {
    const { audit, service } = harness({});

    await expect(
      service.assertCanRemoveReviewer({ id: REVIEWER_ID, fullName: 'Rev' }, admin, 'DEACTIVATE'),
    ).resolves.toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audits the refused attempt, then answers 409 with the task list', async () => {
    const { audit, prisma, service } = harness({
      inReview: [task('t1', 'A-1', TaskStatus.IN_REVIEW)],
    });

    await expect(
      service.assertCanRemoveReviewer(
        { id: REVIEWER_ID, fullName: 'Rev' },
        admin,
        'DEACTIVATE',
        'Leaving the team',
      ),
    ).rejects.toMatchObject({
      code: 'REVIEWER_HAS_PENDING_TASKS',
      details: { tasks: [expect.objectContaining({ id: 't1', kind: 'InReview' })] },
    });
    // Written with the root client, not a caller transaction, so it survives the rollback.
    expect(audit.record).toHaveBeenCalledWith(
      prisma,
      admin,
      expect.objectContaining({
        actionType: 'REVIEWER_DEACTIVATION_BLOCKED',
        targetUserId: REVIEWER_ID,
        metadata: expect.objectContaining({
          pendingTaskIds: ['t1'],
          reason: 'Leaving the team',
        }),
      }),
    );
  });
});
