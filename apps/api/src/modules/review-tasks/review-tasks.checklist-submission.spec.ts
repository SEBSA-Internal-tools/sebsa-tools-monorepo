import { TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '../auth/auth.constants.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTasksService } from './review-tasks.service.js';

const TASK_ID = '00000000-0000-4000-8000-000000000010';
const DEVELOPER_ID = '00000000-0000-4000-8000-000000000001';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000020';

function actor(roles: RoleCode[], id = DEVELOPER_ID): AuthenticatedUser {
  return {
    id,
    email: 'dev@example.com',
    name: 'Developer Name',
    roles,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sessionId: 'session',
  };
}

function baseTask(status: TaskStatus = TaskStatus.DRAFT, overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    taskCode: 'AASL-24',
    title: 'AASL-453-1',
    crimId: '453',
    version: '1',
    customerId: '00000000-0000-4000-8000-000000000030',
    priority: 'MEDIUM',
    status,
    currentReviewCycle: 1,
    developerId: DEVELOPER_ID,
    currentReviewerId: status === TaskStatus.DRAFT ? null : REVIEWER_ID,
    resubmissionReviewerId: null,
    noteToReviewer: 'Please check unit tests',
    checklistCompleted: true,
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    updatedAt: new Date('2026-10-13T10:00:00.000Z'),
    submittedAt: status === TaskStatus.DRAFT ? null : new Date('2026-10-13T10:30:00.000Z'),
    customer: { name: 'AASL', code: 'AASL', color: '#123456' },
    developer: { fullName: 'Developer Name' },
    currentReviewer: status === TaskStatus.DRAFT ? null : { fullName: 'Reviewer Name' },
    reviewerAssignments: [],
    taskTypes: [
      {
        taskType: {
          id: 1,
          code: 'CUSTOMIZATION',
          name: 'Customization',
          description: '',
          isActive: true,
        },
      },
    ],
    developerChecklist: {
      id: '00000000-0000-4000-8000-000000000040',
      taskId: TASK_ID,
      developerId: DEVELOPER_ID,
      additionalRemarks: 'All clear',
      createdAt: new Date('2026-10-13T10:15:00.000Z'),
      updatedAt: new Date('2026-10-13T10:25:00.000Z'),
      answers: [
        {
          id: '00000000-0000-4000-8000-000000000051',
          questionId: '00000000-0000-4000-8000-000000000061',
          answer: 'YES',
          comments: null,
          question: {
            id: '00000000-0000-4000-8000-000000000061',
            questionText: 'Have you tested according to specification?',
            displayOrder: 1,
            section: {
              id: '00000000-0000-4000-8000-000000000071',
              name: 'Unit Testing',
              displayOrder: 1,
            },
          },
        },
        {
          id: '00000000-0000-4000-8000-000000000052',
          questionId: '00000000-0000-4000-8000-000000000062',
          answer: 'NO',
          comments: 'Needs attention',
          question: {
            id: '00000000-0000-4000-8000-000000000062',
            questionText: 'Have you tested as end-user?',
            displayOrder: 2,
            section: {
              id: '00000000-0000-4000-8000-000000000071',
              name: 'Unit Testing',
              displayOrder: 1,
            },
          },
        },
      ],
    },
    codeReviewForms:
      status === TaskStatus.CHANGES_REQUESTED
        ? [{ reviewerId: REVIEWER_ID, decision: 'CHANGES_REQUESTED' }]
        : [],
    reviewCycles:
      status === TaskStatus.CHANGES_REQUESTED
        ? [{ roundNumber: 1, counted: true, exclusionReason: null }]
        : [],
    handovers: [],
    ...overrides,
  };
}

function harness(taskData: ReturnType<typeof baseTask>) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const notifications = {
    create: vi.fn().mockResolvedValue(undefined),
    createMany: vi.fn().mockResolvedValue(undefined),
    queueEmailForTriggerRows: vi.fn().mockResolvedValue(1),
  };
  const tx = {
    auditLog: { count: vi.fn().mockResolvedValue(1) },
    taskReviewerAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 'assignment-1' }),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    taskStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'admin-1' }]) },
    task: {
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          baseTask(
            (data['status'] as TaskStatus) ??
              (taskData.status === TaskStatus.DRAFT ? TaskStatus.IN_REVIEW : TaskStatus.RESUBMITTED),
            { ...data },
          ),
        ),
      ),
    },
  };
  const prisma = {
    task: {
      findUnique: vi.fn().mockResolvedValue(taskData),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    codeReviewForm: {
      findFirst: vi.fn().mockResolvedValue({ reviewerId: REVIEWER_ID, findings: [] }),
    },
    developerFindingResponse: { findMany: vi.fn().mockResolvedValue([]) },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: REVIEWER_ID,
        fullName: 'Reviewer Name',
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: [{ roleId: 2 }],
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    reviewerWorkload: {
      findMany: vi.fn().mockResolvedValue([{ reviewerId: REVIEWER_ID, activeTasksCount: 0 }]),
    },
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };

  const service = new ReviewTasksService(prisma as never, audit as never, notifications as never);
  return { prisma, tx, audit, notifications, service };
}

describe('Developer Quality Checklist Immutability & Submissions', () => {
  it('first submit creates exactly one checklist snapshot with version 1 in audit log', async () => {
    const dev = actor(['DEVELOPER']);
    const task = baseTask(TaskStatus.DRAFT);
    const { audit, service } = harness(task);

    await service.submit(TASK_ID, dev);

    // Verify TASK_SUBMITTED audit log was recorded with checklistSubmission
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      dev,
      expect.objectContaining({
        actionType: 'TASK_SUBMITTED',
        metadata: expect.objectContaining({
          checklistSubmission: expect.objectContaining({
            version: 1,
            developerId: DEVELOPER_ID,
            remarks: 'All clear',
            categories: expect.arrayContaining([
              expect.objectContaining({
                categoryName: 'Unit Testing',
                questions: expect.arrayContaining([
                  expect.objectContaining({
                    questionText: 'Have you tested according to specification?',
                    answer: 'Yes',
                  }),
                  expect.objectContaining({
                    questionText: 'Have you tested as end-user?',
                    answer: 'No',
                  }),
                ]),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('resubmission records TASK_RESUBMITTED but does NOT create another checklistSubmission snapshot', async () => {
    const dev = actor(['DEVELOPER']);
    const task = baseTask(TaskStatus.CHANGES_REQUESTED, {
      submittedAt: new Date('2026-10-13T10:30:00.000Z'),
    });
    const { audit, service } = harness(task);

    await service.submit(TASK_ID, dev);

    // TASK_RESUBMITTED audit log must still be created
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      dev,
      expect.objectContaining({
        actionType: 'TASK_RESUBMITTED',
      }),
    );

    // But its metadata must NOT contain checklistSubmission
    const resubmitCall = audit.record.mock.calls.find(
      (call) => call[2]?.actionType === 'TASK_RESUBMITTED',
    );
    expect(resubmitCall).toBeDefined();
    const metadata = resubmitCall?.[2]?.metadata;
    expect(metadata?.checklistSubmission).toBeUndefined();
  });

  it('repeated resubmission never increases checklist version count or attaches new checklist snapshots', async () => {
    const dev = actor(['DEVELOPER']);
    const task = baseTask(TaskStatus.CHANGES_REQUESTED, {
      submittedAt: new Date('2026-10-13T10:30:00.000Z'),
      currentReviewCycle: 2,
    });
    const { audit, service } = harness(task);

    await service.submit(TASK_ID, dev);

    const resubmitCall = audit.record.mock.calls.find(
      (call) => call[2]?.actionType === 'TASK_RESUBMITTED',
    );
    expect(resubmitCall).toBeDefined();
    expect(resubmitCall?.[2]?.metadata?.checklistSubmission).toBeUndefined();
  });

  it('findChecklistSubmissions returns canonical original submission (version 1) even with multiple historical snapshots', async () => {
    const dev = actor(['DEVELOPER']);
    const task = baseTask(TaskStatus.CHANGES_REQUESTED);
    const { prisma, service } = harness(task);

    const originalSubmittedAt = '2026-10-13T10:30:00.000Z';
    const originalSnapshot = {
      id: '00000000-0000-4000-8000-000000000081',
      taskId: TASK_ID,
      version: 1,
      submittedAt: originalSubmittedAt,
      developerId: DEVELOPER_ID,
      taskTypes: [{ id: '1', name: 'Customization' }],
      categories: [
        {
          categoryId: '00000000-0000-4000-8000-000000000071',
          categoryName: 'Unit Testing',
          categoryOrder: 0,
          questions: [
            {
              questionId: '00000000-0000-4000-8000-000000000061',
              questionText: 'Have you tested according to specification?',
              questionOrder: 1,
              answer: 'Yes',
            },
          ],
        },
      ],
      remarks: 'Initial submission',
    };

    const duplicateResubmissionSnapshot2 = {
      ...originalSnapshot,
      id: '00000000-0000-4000-8000-000000000082',
      version: 2,
      submittedAt: '2026-10-13T11:00:00.000Z',
      remarks: 'Accidental duplicate v2',
    };

    const duplicateResubmissionSnapshot3 = {
      ...originalSnapshot,
      id: '00000000-0000-4000-8000-000000000083',
      version: 3,
      submittedAt: '2026-10-13T12:00:00.000Z',
      remarks: 'Accidental duplicate v3',
    };

    // Historical audit logs containing duplicate resubmission snapshots
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'audit-1',
        action: 'TASK_SUBMITTED',
        createdAt: new Date(originalSubmittedAt),
        metadata: { checklistSubmission: originalSnapshot },
      },
      {
        id: 'audit-2',
        action: 'TASK_RESUBMITTED',
        createdAt: new Date('2026-10-13T11:00:00.000Z'),
        metadata: { checklistSubmission: duplicateResubmissionSnapshot2 },
      },
      {
        id: 'audit-3',
        action: 'TASK_RESUBMITTED',
        createdAt: new Date('2026-10-13T12:00:00.000Z'),
        metadata: { checklistSubmission: duplicateResubmissionSnapshot3 },
      },
    ]);

    const result = await service.findChecklistSubmissions(TASK_ID, dev);

    // Exactly one canonical submission is returned
    expect(result).toHaveLength(1);
    expect(result[0]?.version).toBe(1);
    expect(result[0]?.submittedAt).toBe(originalSubmittedAt);
    expect(result[0]?.remarks).toBe('Initial submission');
  });

  it('findChecklistSubmissions falls back to earliest snapshot if only TASK_RESUBMITTED exists in historical logs', async () => {
    const dev = actor(['DEVELOPER']);
    const task = baseTask(TaskStatus.IN_REVIEW);
    const { prisma, service } = harness(task);

    const snapshot = {
      id: '00000000-0000-4000-8000-000000000082',
      taskId: TASK_ID,
      version: 2,
      submittedAt: '2026-10-13T11:00:00.000Z',
      developerId: DEVELOPER_ID,
      taskTypes: [{ id: '1', name: 'Customization' }],
      categories: [],
      remarks: 'Earliest existing snapshot',
    };

    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'audit-2',
        action: 'TASK_RESUBMITTED',
        createdAt: new Date('2026-10-13T11:00:00.000Z'),
        metadata: { checklistSubmission: snapshot },
      },
    ]);

    const result = await service.findChecklistSubmissions(TASK_ID, dev);

    expect(result).toHaveLength(1);
    expect(result[0]?.version).toBe(1);
    expect(result[0]?.remarks).toBe('Earliest existing snapshot');
  });
});
