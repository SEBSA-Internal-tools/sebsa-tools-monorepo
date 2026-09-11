import { describe, expect, it } from 'vitest';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import { ALL, EMPTY_TASK_FILTERS, filterTasks } from './taskFilters.ts';

/**
 * `filterTasks` is the one definition of "which tasks match", read by every grid
 * and by the count line above it. The bucket dimension is new: it is what a
 * dashboard counter card selects, and it composes with the filter bar rather
 * than replacing it.
 */

function task(overrides: Partial<TaskListItem> & { status: TaskStatus }): TaskListItem {
  return {
    id: `t-${overrides.status}`,
    taskCode: 'AASL-001',
    title: 'AASL - 3.8',
    crimId: '3.8',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    reviewCycle: 1,
    developerId: 'u-dev',
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
    developerName: 'Dev',
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
  'Delivered',
  'Cancelled',
];

const everyStatus = ALL_STATUSES.map((status) => task({ status }));

describe('filterTasks — bucket', () => {
  it('passes everything through when no bucket is selected', () => {
    expect(filterTasks(everyStatus, EMPTY_TASK_FILTERS)).toHaveLength(everyStatus.length);
  });

  it('keeps the three statuses a developer has handed over', () => {
    // The developer's "Submitted Tasks" counter. Counting only `Submitted` would
    // drop the number to 0 the moment a reviewer picked the task up.
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'awaitingReview',
    });
    expect(kept.map((t) => t.status)).toEqual(['Submitted', 'InReview', 'ReSubmitted']);
  });

  it('keeps only the literal status for the admin submitted counter', () => {
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'submitted',
    });
    expect(kept.map((t) => t.status)).toEqual(['Submitted']);
  });

  it('treats a delivered task as approved', () => {
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'approved',
    });
    expect(kept.map((t) => t.status)).toEqual(['Approved', 'Delivered']);
  });

  it('ignores a bucket it does not recognise rather than emptying the grid', () => {
    // A hand-edited URL, or a param left behind by an older build. Showing every
    // row is recoverable; showing none looks like data loss.
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'nonsense',
    });
    expect(kept).toHaveLength(everyStatus.length);
  });

  it('composes with the filter bar rather than replacing it', () => {
    const rows = [
      task({ id: 'a', status: 'Approved', priority: 'High' }),
      task({ id: 'b', status: 'Approved', priority: 'Low' }),
      task({ id: 'c', status: 'Draft', priority: 'High' }),
    ];

    const kept = filterTasks(rows, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'approved',
      priority: 'High',
    });

    expect(kept.map((t) => t.id)).toEqual(['a']);
  });

  it('can narrow a bucket to one of its own statuses', () => {
    // Clicking Approved on the dashboard and then picking Delivered in the
    // Select is a legitimate, if narrow, question — the two must intersect, not
    // fight.
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'approved',
      status: 'Delivered',
    });

    expect(kept.map((t) => t.status)).toEqual(['Delivered']);
  });

  it('returns nothing when the bucket and the status select cannot both hold', () => {
    const kept = filterTasks(everyStatus, {
      ...EMPTY_TASK_FILTERS,
      bucket: 'draft',
      status: 'Approved',
    });

    expect(kept).toHaveLength(0);
  });
});

describe('filterTasks — existing dimensions still hold', () => {
  it('buckets cycle 3 and above together', () => {
    const rows = [
      task({ id: 'one', status: 'Draft', reviewCycle: 1 }),
      task({ id: 'three', status: 'Draft', reviewCycle: 3 }),
      task({ id: 'nine', status: 'Draft', reviewCycle: 9 }),
    ];

    const kept = filterTasks(rows, { ...EMPTY_TASK_FILTERS, cycle: '3+' });
    expect(kept.map((t) => t.id)).toEqual(['three', 'nine']);
  });

  it('searches across code, title, CRIM and customer', () => {
    const rows = [
      task({ id: 'match', status: 'Draft', crimId: 'CRIM-848' }),
      task({ id: 'miss', status: 'Draft', crimId: '9.9', title: 'BLOM - 9.9' }),
    ];

    expect(
      filterTasks(rows, { ...EMPTY_TASK_FILTERS, search: 'crim-848' }).map((t) => t.id),
    ).toEqual(['match']);
  });

  it('treats ALL as no filter on every dimension', () => {
    expect(
      filterTasks(everyStatus, {
        search: '',
        status: ALL,
        priority: ALL,
        cycle: ALL,
        bucket: ALL,
      }),
    ).toHaveLength(everyStatus.length);
  });
});
