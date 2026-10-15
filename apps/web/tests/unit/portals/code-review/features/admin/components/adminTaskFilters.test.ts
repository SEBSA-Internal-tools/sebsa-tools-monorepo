import { describe, expect, it } from 'vitest';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import {
  EMPTY_ADMIN_FILTERS,
  filterAdminTasks,
} from '@/portals/code-review/features/admin/components/adminTaskFilters.ts';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';

function createTask(overrides: Partial<TaskListItem> & { status: TaskStatus }): TaskListItem {
  return {
    id: `t-${overrides.id ?? overrides.status}`,
    taskCode: 'AASL-001',
    title: 'AASL - Task',
    crimId: '7.4',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    reviewRound: 1,
    countedCycle: 1,
    adjustedCycles: [],
    developerId: 'u-dev-1',
    reviewerId: null,
    taskTypeIds: [],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    submittedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    customerName: 'AASL',
    customerCode: 'AASL',
    customerColor: '#2563eb',
    developerName: 'Developer 1',
    reviewerName: null,
    ...overrides,
  };
}

const ALL_STATUSES: readonly TaskStatus[] = [
  'Draft',
  'Submitted',
  'InReview',
  'ChangesRequested',
  'ReSubmitted',
  'Approved',
  'Cancelled',
];

const sampleTasks = ALL_STATUSES.map((status) => createTask({ status }));

describe('filterAdminTasks — status & bucket filtration', () => {
  it('strictly returns only Submitted tasks when status is Submitted (no InReview or ReSubmitted tasks)', () => {
    const result = filterAdminTasks(sampleTasks, {
      ...EMPTY_ADMIN_FILTERS,
      status: 'Submitted',
    });

    expect(result.map((t) => t.status)).toEqual(['Submitted']);
  });

  it('strictly returns only ReSubmitted tasks when status is ReSubmitted', () => {
    const result = filterAdminTasks(sampleTasks, {
      ...EMPTY_ADMIN_FILTERS,
      status: 'ReSubmitted',
    });

    expect(result.map((t) => t.status)).toEqual(['ReSubmitted']);
  });

  it('strictly returns only InReview tasks when status is InReview', () => {
    const result = filterAdminTasks(sampleTasks, {
      ...EMPTY_ADMIN_FILTERS,
      status: 'InReview',
    });

    expect(result.map((t) => t.status)).toEqual(['InReview']);
  });

  it('keeps Submitted and ReSubmitted tasks when awaitingReviewAdmin bucket is selected without a single status', () => {
    const result = filterAdminTasks(sampleTasks, {
      ...EMPTY_ADMIN_FILTERS,
      bucket: 'awaitingReviewAdmin',
      status: ALL,
    });

    expect(result.map((t) => t.status)).toEqual(['Submitted', 'ReSubmitted']);
  });

  it('narrows awaitingReviewAdmin bucket to strictly Submitted when status=Submitted is chosen', () => {
    const result = filterAdminTasks(sampleTasks, {
      ...EMPTY_ADMIN_FILTERS,
      bucket: 'awaitingReviewAdmin',
      status: 'Submitted',
    });

    expect(result.map((t) => t.status)).toEqual(['Submitted']);
  });

  it('filters by developerId, reviewerId, and customerId accurately', () => {
    const tasksWithPeople: TaskListItem[] = [
      createTask({
        id: '1',
        status: 'Submitted',
        developerId: 'u-dev-1',
        reviewerId: 'u-rev-1',
        customerId: 'c-1',
      }),
      createTask({
        id: '2',
        status: 'Submitted',
        developerId: 'u-dev-2',
        reviewerId: 'u-rev-1',
        customerId: 'c-1',
      }),
      createTask({
        id: '3',
        status: 'Submitted',
        developerId: 'u-dev-1',
        reviewerId: 'u-rev-2',
        customerId: 'c-2',
      }),
    ];

    const devFiltered = filterAdminTasks(tasksWithPeople, {
      ...EMPTY_ADMIN_FILTERS,
      developerId: 'u-dev-1',
    });
    expect(devFiltered.map((t) => t.id)).toEqual(['1', '3']);

    const revFiltered = filterAdminTasks(tasksWithPeople, {
      ...EMPTY_ADMIN_FILTERS,
      reviewerId: 'u-rev-1',
    });
    expect(revFiltered.map((t) => t.id)).toEqual(['1', '2']);

    const custFiltered = filterAdminTasks(tasksWithPeople, {
      ...EMPTY_ADMIN_FILTERS,
      customerId: 'c-2',
    });
    expect(custFiltered.map((t) => t.id)).toEqual(['3']);
  });
});
