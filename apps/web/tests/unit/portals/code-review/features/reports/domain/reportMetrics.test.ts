import { describe, expect, it } from 'vitest';
import type { Customer, Review, TaskListItem, TaskStatus, User } from '@sdp/contracts';
import {
  applyReportFilters,
  calculateQualityScore,
  customerOverview,
  cycleComponentScore,
  cycleDistribution,
  developerPerformance,
  ftaComponentScore,
  isEligibleReviewedTask,
  isTaskFirstTimeApproved,
  kpiEligibleReviews,
  rankComponentScore,
  rankDistribution,
  reviewedTaskCount,
  reviewerActivity,
  reworkComponentScore,
  standingFor,
  summarise,
  taskStatusDistribution,
  ALL_REPORT_VALUES,
} from '@/portals/code-review/features/reports/domain/reportMetrics.ts';

/**
 * The oracle for these tests is the wireframe's own arithmetic.
 *
 * Screen 01 shows 33 tasks — 3 Draft, 5 Submitted, 1 In Review, 6 Changes
 * Requested, 2 Approved, 16 Cancelled — and screen 04 reports "14.3% approval
 * rate" for exactly that set. 2 / (33 − 3 − 16) = 14.3%. Reproducing that number
 * from an independently-built fixture is what proves the denominator is right;
 * asserting whatever the implementation happens to return would prove nothing.
 */

const STATUS_LABELS: Record<TaskStatus, string> = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  InReview: 'In Review',
  ChangesRequested: 'Changes Requested',
  ReSubmitted: 'Re-Submitted',
  Approved: 'Approved',
  Cancelled: 'Cancelled',
};

const RANK_LABELS = { 1: 'Rank 1', 2: 'Rank 2', 3: 'Rank 3' } as const;
const CYCLE_LABELS = { one: 'Cycle 1', two: 'Cycle 2', threePlus: 'Cycle 3+' };

let nextId = 0;

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  nextId += 1;
  const id = `t-${String(nextId)}`;

  return {
    id,
    taskCode: `AASL-${String(nextId)}`,
    title: 'AASL - CRIM-1',
    crimId: 'CRIM-1',
    version: null,
    customerId: 'c-aasl',
    priority: 'Medium',
    status: 'Submitted',
    reviewRound: 1,
    countedCycle: 1,
    adjustedCycles: [],
    developerId: 'u-dev',
    reviewerId: 'u-rev',
    taskTypeIds: ['tt-customization'],
    isChecklistComplete: true,
    isHandedOver: false,
    noteToReviewer: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    submittedAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    customerName: 'AASL',
    customerCode: 'AASL',
    customerColor: '#84cc16',
    developerName: 'Dev One',
    reviewerName: 'Rev One',
    ...overrides,
  };
}

function review(overrides: Partial<Review> = {}): Review {
  nextId += 1;

  return {
    id: `rev-${String(nextId)}`,
    taskId: 't-1',
    reviewRound: 1,
    reviewerId: 'u-rev',
    reviewerName: 'Rev One',
    comments: [],
    generalCheck: [],
    findings: {
      incorrectCode: '',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: '',
    rank: 1,
    screenshots: [],
    decision: 'Approved',
    decidedAt: '2026-05-02T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u-dev',
    name: 'Dev One',
    email: 'dev.one@sebsaworld.com',
    roles: ['Developer'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Screen 01's exact status mix. */
function screenOneTasks(): TaskListItem[] {
  const counts: [TaskStatus, number][] = [
    ['Draft', 3],
    ['Submitted', 5],
    ['InReview', 1],
    ['ChangesRequested', 6],
    ['Approved', 2],
    ['Cancelled', 16],
  ];

  return counts.flatMap(([status, count]) => Array.from({ length: count }, () => task({ status })));
}

describe('approval rate', () => {
  it('excludes drafts and cancellations from the denominator', () => {
    const tasks = screenOneTasks();

    expect(tasks).toHaveLength(33);
    expect(reviewedTaskCount(tasks)).toBe(14);
    expect(summarise(tasks, [], []).approvalRate).toBe(14.3);
  });

  /**
   * The negative control for the rule above. If the denominator were the whole
   * list, this number would be 6.1% and would not match the wireframe.
   */
  it('is NOT approved over total tasks', () => {
    expect(summarise(screenOneTasks(), [], []).approvalRate).not.toBe(6.1);
  });

  it('reports zero rather than dividing by zero when nothing reached review', () => {
    const summary = summarise([task({ status: 'Draft' })], [], []);
    expect(summary.approvalRate).toBe(0);
    expect(summary.isApprovalOnTarget).toBe(false);
  });
});

describe('averages', () => {
  it('averages counted cycles over approved tasks only', () => {
    const tasks = [
      task({ status: 'Approved', countedCycle: 1 }),
      task({ status: 'Approved', countedCycle: 3 }),
      // Still going round, so it is not yet "N cycles to approval".
      task({ status: 'ChangesRequested', countedCycle: 9 }),
    ];

    expect(summarise(tasks, [], []).avgCountedCycles).toBe(2);
    expect(summarise(tasks, [], []).avgReviewCycles).toBe(2);
  });

  it('averages rank over decided reviews only', () => {
    const reviews = [
      review({ rank: 1 }),
      review({ rank: 3 }),
      // In progress: no verdict yet, so it must not count as a good one.
      review({ rank: null, decision: null, decidedAt: null }),
      review({ rank: 3, decision: null, decidedAt: null }),
    ];

    expect(summarise([], reviews, []).avgQualityRank).toBe(2);
  });

  it('does not read an empty dataset as a perfect score', () => {
    const summary = summarise([], [], []);
    expect(summary.avgQualityRank).toBe(0);
    expect(summary.isQualityGood).toBe(false);
    expect(summary.isCycleCountHigh).toBe(false);
  });
});

describe('distributions', () => {
  it('reports status shares that sum to 100', () => {
    const slices = taskStatusDistribution(screenOneTasks(), STATUS_LABELS);

    expect(slices).toHaveLength(6);
    expect(Math.round(slices.reduce((sum, slice) => sum + slice.percent, 0))).toBe(100);
    expect(slices.find((slice) => slice.key === 'Cancelled')?.value).toBe(16);
  });

  it('omits statuses with no tasks rather than drawing a zero-width slice', () => {
    const slices = taskStatusDistribution([task({ status: 'Approved' })], STATUS_LABELS);
    expect(slices.map((slice) => slice.key)).toEqual(['Approved']);
  });

  it('buckets cycles as 1 / 2 / 3+ over approved tasks', () => {
    const tasks = [
      task({ status: 'Approved', countedCycle: 1 }),
      task({ status: 'Approved', countedCycle: 2 }),
      task({ status: 'Approved', countedCycle: 5 }),
      task({ status: 'Approved', countedCycle: 7 }),
      task({ status: 'ChangesRequested', countedCycle: 4 }),
    ];

    const slices = cycleDistribution(tasks, CYCLE_LABELS);
    expect(slices.map((slice) => [slice.key, slice.value])).toEqual([
      ['1', 1],
      ['2', 1],
      ['3+', 2],
    ]);
  });

  it('buckets cycle <= 1 into cycle one', () => {
    const slices = cycleDistribution(
      [task({ status: 'Approved', reviewCycle: 0 }), task({ status: 'Approved', reviewCycle: 1 })],
      CYCLE_LABELS,
    );

    expect(slices.map((slice) => [slice.key, slice.value])).toEqual([
      ['1', 2],
    ]);
  });

  it('ignores undecided reviews in the rank donut', () => {
    const slices = rankDistribution(
      [review({ rank: 1 }), review({ rank: 2, decision: null, decidedAt: null })],
      RANK_LABELS,
    );

    expect(slices).toEqual([{ key: '1', label: 'Rank 1', value: 1, percent: 100 }]);
  });

  it('excludes subsequent approval Rank 1 (cycle > 1) but keeps intermediate defect ranks (Rank 2 & 3)', () => {
    // Scenario: AASL-001
    // Review cycle 1 - Rank 3
    // Review cycle 2 - Rank 2
    // Review cycle 3 - Rank 1 (Approved)
    const reviews = [
      review({ id: 'r1', reviewRound: 1, rank: 3, decision: 'ChangesRequested' }),
      review({ id: 'r2', reviewRound: 2, rank: 2, decision: 'ChangesRequested' }),
      review({ id: 'r3', reviewRound: 3, rank: 1, decision: 'Approved' }),
    ];

    const eligible = kpiEligibleReviews(reviews);
    expect(eligible.map((r) => r.id)).toEqual(['r1', 'r2']);

    const slices = rankDistribution(reviews, RANK_LABELS);
    expect(slices).toEqual([
      { key: '2', label: 'Rank 2', value: 1, percent: 50 },
      { key: '3', label: 'Rank 3', value: 1, percent: 50 },
    ]);
  });

  it('includes First-Time-Right Rank 1 in review cycle 1', () => {
    const reviews = [
      review({ id: 'r1', reviewRound: 1, rank: 1, decision: 'Approved' }),
    ];

    const eligible = kpiEligibleReviews(reviews);
    expect(eligible.map((r) => r.id)).toEqual(['r1']);

    const slices = rankDistribution(reviews, RANK_LABELS);
    expect(slices).toEqual([
      { key: '1', label: 'Rank 1', value: 1, percent: 100 },
    ]);
  });
});

describe('breakdowns', () => {
  it('scores a developer on their own tasks only', () => {
    const mine = task({ status: 'Approved', developerId: 'u-dev' });
    const theirs = task({ status: 'Approved', developerId: 'u-other' });
    const changesTask = task({ status: 'ChangesRequested', developerId: 'u-dev' });
    const rows = developerPerformance(
      [mine, theirs, changesTask],
      [
        review({ taskId: mine.id, rank: 1, decision: 'Approved' }),
        review({ taskId: changesTask.id, rank: 2, decision: 'ChangesRequested' }),
      ],
      [user(), user({ id: 'u-other', name: 'Dev Two' })],
    );

    const dev = rows.find((row) => row.userId === 'u-dev');
    expect(dev?.taskCount).toBe(2);
    expect(dev?.approvedCount).toBe(1);
    expect(dev?.eligibleReviewedCount).toBe(2);
    expect(dev?.firstTimeApprovedCount).toBe(1);
    expect(dev?.firstTimeApprovalRate).toBe(50);
    expect(dev?.approvalRate).toBe(50);
    expect(dev?.avgRank).toBe(1.5);
    expect(dev?.reworkRounds).toBe(1);
    expect(dev?.avgReworkRounds).toBe(0.5);
    expect(dev?.changesRequestedCount).toBe(1);
  });

  it('leaves out people with nothing to report', () => {
    const rows = developerPerformance([], [], [user()]);
    expect(rows).toEqual([]);
  });

  it('calls a reviewer who mostly requests changes strict', () => {
    const rows = reviewerActivity(
      [
        review({ decision: 'ChangesRequested', rank: 3 }),
        review({ decision: 'ChangesRequested', rank: 2 }),
        review({ decision: 'ChangesRequested', rank: 3 }),
        review({ decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-rev', name: 'Rev One', roles: ['Reviewer'] })],
    );

    expect(rows[0]?.reviewCount).toBe(4);
    expect(rows[0]?.approvalRate).toBe(25);
    expect(rows[0]?.changesRate).toBe(75);
    expect(rows[0]?.tendency).toBe('strict');
  });

  it('ranks reviewers by how much they have reviewed, busiest first', () => {
    const rows = reviewerActivity(
      [
        review({ reviewerId: 'u-quiet', decision: 'Approved' }),
        review({ reviewerId: 'u-busy', decision: 'Approved' }),
        review({ reviewerId: 'u-busy', decision: 'Approved' }),
        // Undecided work is in progress, not activity — it must not inflate
        // anyone's count or their approval rate.
        review({ reviewerId: 'u-quiet', decision: null, decidedAt: null }),
      ],
      [
        user({ id: 'u-quiet', name: 'Rev Quiet', roles: ['Reviewer'] }),
        user({ id: 'u-busy', name: 'Rev Busy', roles: ['Reviewer'] }),
      ],
    );

    expect(rows.map((row) => row.userId)).toEqual(['u-busy', 'u-quiet']);
    expect(rows[1]?.reviewCount).toBe(1);
  });

  it('marks a developer whose work is mostly rejected as poor standing', () => {
    // 1 approved out of 4 reviewed is 25% — below half the 70% target, which is
    // the bottom band.
    const tApp = task({ id: 't-app', status: 'Approved', developerId: 'u-dev', countedCycle: 4 });
    const tCr1 = task({ id: 't-cr1', status: 'ChangesRequested', developerId: 'u-dev' });
    const tCr2 = task({ id: 't-cr2', status: 'ChangesRequested', developerId: 'u-dev' });
    const tCr3 = task({ id: 't-cr3', status: 'ChangesRequested', developerId: 'u-dev' });

    const rows = developerPerformance(
      [tApp, tCr1, tCr2, tCr3],
      [
        review({ taskId: 't-app', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 't-app', reviewRound: 2, decision: 'Approved', rank: 1 }),
        review({ taskId: 't-cr1', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 't-cr2', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 't-cr3', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
      ],
      [user()],
    );

    expect(rows[0]?.approvalRate).toBe(25);
    expect(rows[0]?.firstTimeApprovalRate).toBe(0);
    expect(rows[0]?.standing).toBe('poor');
  });
});

describe('customer overview', () => {
  function customer(overrides: Partial<Customer> = {}): Customer {
    return {
      id: 'c-aasl',
      name: 'AASL',
      code: 'AASL',
      description: '',
      color: '#84cc16',
      isActive: true,
      ...overrides,
    };
  }

  it('scores each customer over their own tasks and sorts by volume', () => {
    const aaslApproved = task({
      customerId: 'c-aasl',
      status: 'Approved',
      countedCycle: 3,
    });
    const tasks = [
      aaslApproved,
      task({ customerId: 'c-aasl', status: 'ChangesRequested' }),
      // Drafts never reached review, so they count towards the customer's task
      // total but must stay out of the approval-rate denominator.
      task({ customerId: 'c-aasl', status: 'Draft' }),
      task({ customerId: 'c-blom', status: 'Approved', countedCycle: 1 }),
    ];

    const rows = customerOverview(
      tasks,
      [review({ taskId: aaslApproved.id, rank: 2 })],
      [customer(), customer({ id: 'c-blom', name: 'BLOM', code: 'BLOM' })],
      { rank: RANK_LABELS, cycle: CYCLE_LABELS },
    );

    expect(rows.map((row) => row.customerId)).toEqual(['c-aasl', 'c-blom']);

    const aasl = rows[0];
    expect(aasl?.taskCount).toBe(3);
    expect(aasl?.approvedCount).toBe(1);
    // 1 approved / 2 reviewed, NOT 1 / 3 — the draft is excluded.
    expect(aasl?.approvalRate).toBe(50);
    expect(aasl?.avgCycles).toBe(3);
    // The donuts are cut from this customer's rows alone: BLOM's approval and
    // AASL's own draft must not appear in them.
    expect(aasl?.rankSlices).toEqual([{ key: '2', label: 'Rank 2', value: 1, percent: 100 }]);
    expect(aasl?.cycleSlices).toEqual([{ key: '3+', label: 'Cycle 3+', value: 1, percent: 100 }]);
  });

  it('leaves out customers with no tasks rather than drawing an empty row', () => {
    const rows = customerOverview([], [], [customer()], {
      rank: RANK_LABELS,
      cycle: CYCLE_LABELS,
    });

    expect(rows).toEqual([]);
  });

  it('reports no average cycle count when nothing has been approved yet', () => {
    const rows = customerOverview(
      [task({ customerId: 'c-aasl', status: 'Submitted' })],
      [],
      [customer()],
      { rank: RANK_LABELS, cycle: CYCLE_LABELS },
    );

    // `null`, not 0: "no data" and "approved on the first cycle" are different
    // answers and the screen renders them differently.
    expect(rows[0]?.avgCycles).toBeNull();
    expect(rows[0]?.approvalRate).toBe(0);
  });
});

describe('filters', () => {
  it('narrows by customer, status and start date together', () => {
    const tasks = [
      task({
        customerId: 'c-aasl',
        status: 'Approved',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-blom',
        status: 'Approved',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-aasl',
        status: 'Draft',
        createdAt: '2026-05-10T00:00:00.000Z',
      }),
      task({
        customerId: 'c-aasl',
        status: 'Approved',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ];

    const visible = applyReportFilters(tasks, {
      from: '2026-05-01T00:00:00.000Z',
      customerId: 'c-aasl',
      status: 'Approved',
    });

    expect(visible).toHaveLength(1);
  });

  it('passes everything through when nothing is selected', () => {
    const tasks = screenOneTasks();
    expect(
      applyReportFilters(tasks, {
        from: '',
        customerId: ALL_REPORT_VALUES,
        status: ALL_REPORT_VALUES,
      }),
    ).toHaveLength(33);
  });
});

describe('developer rework rounds KPI', () => {
  it('counts 1 rework round for one task with one ChangesRequested decision', () => {
    const t1 = task({ id: 't1', developerId: 'u-dev', status: 'ChangesRequested' });
    const rows = developerPerformance(
      [t1],
      [review({ taskId: 't1', reviewRound: 1, decision: 'ChangesRequested', rank: 2 })],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.reworkRounds).toBe(1);
    expect(rows[0]?.changesRequestedCount).toBe(1);
  });

  it('counts 3 rework rounds for one task with three ChangesRequested decisions', () => {
    const t1 = task({ id: 't1', developerId: 'u-dev', status: 'Approved', countedCycle: 4 });
    const rows = developerPerformance(
      [t1],
      [
        review({ taskId: 't1', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 't1', reviewRound: 2, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 't1', reviewRound: 3, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 't1', reviewRound: 4, decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.reworkRounds).toBe(3);
    expect(rows[0]?.approvedCount).toBe(1);
  });

  it('aggregates multiple tasks: Task A (2 reworks) + Task B (1 rework) + Task C (first-time approved) = 3 rework rounds', () => {
    const taskA = task({ id: 'ta', developerId: 'u-dev', status: 'Approved', countedCycle: 3 });
    const taskB = task({ id: 'tb', developerId: 'u-dev', status: 'Approved', countedCycle: 2 });
    const taskC = task({ id: 'tc', developerId: 'u-dev', status: 'Approved', countedCycle: 1 });

    const rows = developerPerformance(
      [taskA, taskB, taskC],
      [
        // Task A: 2 reworks + final approval
        review({ taskId: 'ta', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 'ta', reviewRound: 2, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 'ta', reviewRound: 3, decision: 'Approved', rank: 1 }),
        // Task B: 1 rework + final approval
        review({ taskId: 'tb', reviewRound: 1, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 'tb', reviewRound: 2, decision: 'Approved', rank: 1 }),
        // Task C: first-time approval
        review({ taskId: 'tc', reviewRound: 1, decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.reworkRounds).toBe(3);
    expect(rows[0]?.approvedCount).toBe(3);
    expect(rows[0]?.approvalRate).toBe(100);
  });

  it('counts historical rework rounds even when task is currently Approved', () => {
    const approvedTask = task({ id: 't-app', developerId: 'u-dev', status: 'Approved', countedCycle: 2 });
    const rows = developerPerformance(
      [approvedTask],
      [
        review({ taskId: 't-app', reviewRound: 1, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 't-app', reviewRound: 2, decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.reworkRounds).toBe(1);
    expect(rows[0]?.approvedCount).toBe(1);
  });

  it('counts only completed ChangesRequested review decisions, not task status independently', () => {
    const pendingTask = task({ id: 't-pend', developerId: 'u-dev', status: 'ChangesRequested' });
    // No completed review decision with ChangesRequested yet (e.g. state transition or edge case)
    const rows = developerPerformance(
      [pendingTask],
      [],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.reworkRounds).toBe(0);
    expect(rows[0]?.changesRequestedCount).toBe(0);
  });
});

describe('developer quality rank KPI rules', () => {
  it('counts Round 1 Rank 1 approval', () => {
    const t = task({ id: 't1', developerId: 'u-dev', status: 'Approved' });
    const rows = developerPerformance(
      [t],
      [review({ taskId: 't1', reviewRound: 1, decision: 'Approved', rank: 1 })],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    expect(rows[0]?.avgRank).toBe(1);
    const rank1Slice = rows[0]?.rankSlices.find((s) => s.key === '1');
    expect(rank1Slice?.value).toBe(1);
  });

  it('counts Rank 2 defect and excludes post-rework closing Rank 1 approval', () => {
    const t = task({ id: 't1', developerId: 'u-dev', status: 'Approved', countedCycle: 2 });
    const rows = developerPerformance(
      [t],
      [
        review({ taskId: 't1', reviewRound: 1, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 't1', reviewRound: 2, decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    // Only Round 1 Rank 2 is qualifying. Round 2 Rank 1 is excluded.
    expect(rows[0]?.avgRank).toBe(2);
    const rank1Slice = rows[0]?.rankSlices.find((s) => s.key === '1');
    const rank2Slice = rows[0]?.rankSlices.find((s) => s.key === '2');
    expect(rank1Slice).toBeUndefined();
    expect(rank2Slice?.value).toBe(1);
  });

  it('counts Rank 3 and Rank 2 across rework rounds and excludes final Rank 1', () => {
    const t = task({ id: 't1', developerId: 'u-dev', status: 'Approved', countedCycle: 3 });
    const rows = developerPerformance(
      [t],
      [
        review({ taskId: 't1', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
        review({ taskId: 't1', reviewRound: 2, decision: 'ChangesRequested', rank: 2 }),
        review({ taskId: 't1', reviewRound: 3, decision: 'Approved', rank: 1 }),
      ],
      [user({ id: 'u-dev', roles: ['Developer'] })],
    );

    // Qualifying reviews: Rank 3, Rank 2. Mean = (3 + 2)/2 = 2.5
    expect(rows[0]?.avgRank).toBe(2.5);
    const rank1Slice = rows[0]?.rankSlices.find((s) => s.key === '1');
    const rank2Slice = rows[0]?.rankSlices.find((s) => s.key === '2');
    const rank3Slice = rows[0]?.rankSlices.find((s) => s.key === '3');
    expect(rank1Slice).toBeUndefined();
    expect(rank2Slice?.value).toBe(1);
    expect(rank3Slice?.value).toBe(1);
  });
});

describe('developer cycle KPI rules', () => {
  it('counts cycle distribution strictly for approved tasks only', () => {
    const approved1 = task({ id: 't1', developerId: 'u-dev', status: 'Approved', countedCycle: 1 });
    const approved2 = task({ id: 't2', developerId: 'u-dev', status: 'Approved', countedCycle: 2 });
    const unapproved = task({ id: 't3', developerId: 'u-dev', status: 'InReview', countedCycle: 3 });

    const rows = developerPerformance(
      [approved1, approved2, unapproved],
      [],
      [user({ id: 'u-dev', roles: ['Developer'] })],
      {
        rank: RANK_LABELS,
        cycle: CYCLE_LABELS,
      },
    );

    expect(rows[0]?.taskCount).toBe(3);
    expect(rows[0]?.approvedCount).toBe(2);
    const cycle1 = rows[0]?.cycleSlices.find((s) => s.key === '1');
    const cycle2 = rows[0]?.cycleSlices.find((s) => s.key === '2');
    const cycle3Plus = rows[0]?.cycleSlices.find((s) => s.key === '3+');
    expect(cycle1?.value).toBe(1);
    expect(cycle2?.value).toBe(1);
    expect(cycle3Plus).toBeUndefined();
  });
});

describe('developer performance standing composite badge', () => {
  it('1. returns none ("No reviews") when eligible reviewed task count is 0', () => {
    expect(standingFor(0, 0, null, null, 0)).toBe('none');
  });

  it('2. returns limited ("Limited Data") when eligible reviewed task count is 1', () => {
    expect(standingFor(1, 0, 2.0, 2.0, 1.0)).toBe('limited');
    expect(standingFor(1, 100, 1.0, 1.0, 0)).toBe('limited');
  });

  it('3. returns limited ("Limited Data") when eligible reviewed task count is 2', () => {
    expect(standingFor(2, 50, 1.5, 1.5, 0.5)).toBe('limited');
    expect(standingFor(2, 0, 3.0, 4.0, 3.0)).toBe('limited');
  });

  it('4. awards Good for 3+ reviewed tasks with strong KPIs', () => {
    // Sandun-like profile: FTA 66.7%, Avg Rank 1.5, Avg Cycles 1.5, Avg Rework 0.5 -> Score ~81.9
    expect(standingFor(6, 66.7, 1.5, 1.5, 0.5)).toBe('good');
    // Strong profile: FTA 80%, Avg Rank 1.4, Avg Cycles 1.3, Avg Rework 0.2 -> Score 88.0
    expect(standingFor(10, 80, 1.4, 1.3, 0.2)).toBe('good');
  });

  it('5. awards Fair for 3+ reviewed tasks with mixed KPIs', () => {
    // Anjali-like profile: FTA 33.3%, Avg Rank 2.0, Avg Cycles 2.3, Avg Rework 1.0 -> Score 55.9
    expect(standingFor(3, 33.3, 2.0, 2.3, 1.0)).toBe('fair');
    // Moderate profile: FTA 50%, Avg Rank 2.1, Avg Cycles 2.3, Avg Rework 1.2 -> Score 55.0
    expect(standingFor(8, 50, 2.1, 2.3, 1.2)).toBe('fair');
  });

  it('6. awards Needs attention for 3+ reviewed tasks with weak overall KPIs', () => {
    // Weak profile: FTA 15%, Avg Rank 2.6, Avg Cycles 3.2, Avg Rework 2.2 -> Score 20.0
    expect(standingFor(10, 15, 2.6, 3.2, 2.2)).toBe('poor');
  });

  it('7. low FTA but good Rank/Cycles/Rework does NOT automatically become Needs Attention (Sadini-like profile)', () => {
    // Sadini-like profile: FTA 25%, Avg Rank 1.86, Avg Cycles 2.0, Avg Rework 1.25 -> Score 53.8
    expect(standingFor(4, 25, 1.86, 2.0, 1.25)).toBe('fair');
  });

  it('8. high Quality Score but Avg Rank > 2.50 is capped at Fair by safety guardrail', () => {
    // Score with Avg Rank 2.6: 90*0.35 + 20*0.30 + 100*0.20 + 100*0.15 = 72.5 (>= 60)
    expect(calculateQualityScore(90, 2.6, 1.2, 0.2)).toBe(72.5);
    expect(standingFor(5, 90, 2.6, 1.2, 0.2)).toBe('fair');
  });

  it('9. high Quality Score but Avg Cycles > 3.00 is capped at Fair by safety guardrail', () => {
    // Score with Avg Cycles 3.5: 90*0.35 + 100*0.30 + 25*0.20 + 100*0.15 = 81.5 (>= 60)
    expect(calculateQualityScore(90, 1.2, 3.5, 0.2)).toBe(81.5);
    expect(standingFor(5, 90, 1.2, 3.5, 0.2)).toBe('fair');
  });

  it('10. high Quality Score but Avg Rework > 2.00 is capped at Fair by safety guardrail', () => {
    // Score with Avg Rework 2.5: 90*0.35 + 100*0.30 + 100*0.20 + 25*0.15 = 85.3 (>= 60)
    expect(calculateQualityScore(90, 1.2, 1.2, 2.5)).toBe(85.3);
    expect(standingFor(5, 90, 1.2, 1.2, 2.5)).toBe('fair');
  });

  it('11. weighted score calculation is deterministic and handles scoring table thresholds', () => {
    expect(ftaComponentScore(80)).toBe(80);
    expect(rankComponentScore(1.2)).toBe(100);
    expect(rankComponentScore(1.4)).toBe(90);
    expect(rankComponentScore(1.7)).toBe(80);
    expect(rankComponentScore(1.9)).toBe(70);
    expect(rankComponentScore(2.2)).toBe(55);
    expect(rankComponentScore(2.4)).toBe(40);
    expect(rankComponentScore(2.8)).toBe(20);
    expect(rankComponentScore(null)).toBe(70);

    expect(cycleComponentScore(1.2)).toBe(100);
    expect(cycleComponentScore(1.4)).toBe(90);
    expect(cycleComponentScore(1.8)).toBe(75);
    expect(cycleComponentScore(2.3)).toBe(60);
    expect(cycleComponentScore(2.8)).toBe(45);
    expect(cycleComponentScore(3.5)).toBe(25);
    expect(cycleComponentScore(null)).toBe(50);

    expect(reworkComponentScore(0.2)).toBe(100);
    expect(reworkComponentScore(0.4)).toBe(90);
    expect(reworkComponentScore(0.8)).toBe(75);
    expect(reworkComponentScore(1.3)).toBe(60);
    expect(reworkComponentScore(1.8)).toBe(45);
    expect(reworkComponentScore(2.5)).toBe(25);

    expect(calculateQualityScore(80, 1.4, 1.3, 0.2)).toBe(88.0);
    expect(calculateQualityScore(80, 1.4, 1.3, 0.2)).toBe(88.0);
  });

  it('12. DeveloperPerformance populates qualityScore for 3+ tasks and null for limited/none', () => {
    const t1 = task({ id: 't1', developerId: 'u-dev', status: 'Approved' });
    const r1 = review({ taskId: 't1', reviewRound: 1, decision: 'Approved', rank: 1 });

    // 1 task -> limited, qualityScore null
    const rows1 = developerPerformance([t1], [r1], [user({ id: 'u-dev' })]);
    expect(rows1[0]?.standing).toBe('limited');
    expect(rows1[0]?.qualityScore).toBeNull();

    // 3 tasks -> full standing, qualityScore present
    const t2 = task({ id: 't2', developerId: 'u-dev', status: 'Approved' });
    const t3 = task({ id: 't3', developerId: 'u-dev', status: 'Approved' });
    const r2 = review({ taskId: 't2', reviewRound: 1, decision: 'Approved', rank: 1 });
    const r3 = review({ taskId: 't3', reviewRound: 1, decision: 'Approved', rank: 1 });

    const rows3 = developerPerformance([t1, t2, t3], [r1, r2, r3], [user({ id: 'u-dev' })]);
    expect(rows3[0]?.standing).toBe('good');
    expect(rows3[0]?.qualityScore).toBe(100.0);
  });
});

describe('first-time approval rate specification tests (Section 15)', () => {
  it('1. Round 1 Rank 1 Approved -> First-Time Approved = YES', () => {
    const reviews = [
      review({ reviewRound: 1, rank: 1, decision: 'Approved' }),
    ];
    expect(isTaskFirstTimeApproved(reviews)).toBe(true);
  });

  it('2. Round 1 Rank 2 ChangesRequested, Round 2 Rank 1 Approved -> First-Time Approved = NO', () => {
    const reviews = [
      review({ reviewRound: 1, rank: 2, decision: 'ChangesRequested' }),
      review({ reviewRound: 2, rank: 1, decision: 'Approved' }),
    ];
    expect(isTaskFirstTimeApproved(reviews)).toBe(false);
  });

  it('3. Round 1 Rank 3 ChangesRequested, Round 2 Rank 2 ChangesRequested, Round 3 Rank 1 Approved -> First-Time Approved = NO', () => {
    const reviews = [
      review({ reviewRound: 1, rank: 3, decision: 'ChangesRequested' }),
      review({ reviewRound: 2, rank: 2, decision: 'ChangesRequested' }),
      review({ reviewRound: 3, rank: 1, decision: 'Approved' }),
    ];
    expect(isTaskFirstTimeApproved(reviews)).toBe(false);
  });

  it('4. Round 1 ChangesRequested, task still open -> included in denominator, not included in numerator', () => {
    const openTask = task({ id: 't-open', developerId: 'u-dev', status: 'ChangesRequested' });
    const reviews = [
      review({ taskId: 't-open', reviewRound: 1, rank: 2, decision: 'ChangesRequested' }),
    ];

    expect(isEligibleReviewedTask(openTask, reviews)).toBe(true);
    expect(isTaskFirstTimeApproved(reviews)).toBe(false);

    const rows = developerPerformance([openTask], reviews, [user({ id: 'u-dev' })]);
    expect(rows[0]?.eligibleReviewedCount).toBe(1);
    expect(rows[0]?.firstTimeApprovedCount).toBe(0);
    expect(rows[0]?.firstTimeApprovalRate).toBe(0);
  });

  it('5. Submitted/InReview with no completed review -> excluded from denominator', () => {
    const inReviewTask = task({ id: 't-in-rev', developerId: 'u-dev', status: 'InReview' });
    const submittedTask = task({ id: 't-sub', developerId: 'u-dev', status: 'Submitted' });
    // Incomplete review (decision is null)
    const undecidedReview = review({ taskId: 't-in-rev', decision: null });

    expect(isEligibleReviewedTask(inReviewTask, [undecidedReview])).toBe(false);
    expect(isEligibleReviewedTask(submittedTask, [])).toBe(false);

    const rows = developerPerformance(
      [inReviewTask, submittedTask],
      [undecidedReview],
      [user({ id: 'u-dev' })],
    );
    expect(rows[0]?.eligibleReviewedCount).toBe(0);
    expect(rows[0]?.firstTimeApprovalRate).toBe(0);
    expect(rows[0]?.standing).toBe('none');
  });

  it('6. Cancelled task -> excluded from eligible reviewed tasks', () => {
    const cancelledTask = task({ id: 't-canc', developerId: 'u-dev', status: 'Cancelled' });
    const reviews = [
      review({ taskId: 't-canc', reviewRound: 1, rank: 3, decision: 'ChangesRequested' }),
    ];

    expect(isEligibleReviewedTask(cancelledTask, reviews)).toBe(false);
  });

  it('7 & 8. Rework Rounds: 2 ChangesRequested = 2, first-time approved = 0', () => {
    const tRework = task({ id: 't-rew', developerId: 'u-dev', status: 'Approved' });
    const tClean = task({ id: 't-clean', developerId: 'u-dev', status: 'Approved' });

    const reviews = [
      // tRework: 2 ChangesRequested
      review({ taskId: 't-rew', reviewRound: 1, rank: 3, decision: 'ChangesRequested' }),
      review({ taskId: 't-rew', reviewRound: 2, rank: 2, decision: 'ChangesRequested' }),
      review({ taskId: 't-rew', reviewRound: 3, rank: 1, decision: 'Approved' }),
      // tClean: first-time approved (0 ChangesRequested)
      review({ taskId: 't-clean', reviewRound: 1, rank: 1, decision: 'Approved' }),
    ];

    const rows = developerPerformance(
      [tRework, tClean],
      reviews,
      [user({ id: 'u-dev' })],
    );

    expect(rows[0]?.reworkRounds).toBe(2);
    expect(rows[0]?.eligibleReviewedCount).toBe(2);
    expect(rows[0]?.firstTimeApprovedCount).toBe(1);
    expect(rows[0]?.firstTimeApprovalRate).toBe(50);
    expect(rows[0]?.avgReworkRounds).toBe(1.0);
  });

  it('9. Avg Rework Rounds = Total Rework Rounds / Eligible Reviewed Tasks', () => {
    const t1 = task({ id: 't1', developerId: 'u-dev', status: 'Approved' });
    const t2 = task({ id: 't2', developerId: 'u-dev', status: 'Approved' });
    const t3 = task({ id: 't3', developerId: 'u-dev', status: 'Approved' });
    const t4 = task({ id: 't4', developerId: 'u-dev', status: 'Approved' });

    const reviews = [
      review({ taskId: 't1', reviewRound: 1, decision: 'ChangesRequested', rank: 2 }),
      review({ taskId: 't1', reviewRound: 2, decision: 'Approved', rank: 1 }),
      review({ taskId: 't2', reviewRound: 1, decision: 'ChangesRequested', rank: 3 }),
      review({ taskId: 't2', reviewRound: 2, decision: 'Approved', rank: 1 }),
      review({ taskId: 't3', reviewRound: 1, decision: 'Approved', rank: 1 }),
      review({ taskId: 't4', reviewRound: 1, decision: 'Approved', rank: 1 }),
    ];

    const rows = developerPerformance([t1, t2, t3, t4], reviews, [user({ id: 'u-dev' })]);
    expect(rows[0]?.eligibleReviewedCount).toBe(4);
    expect(rows[0]?.reworkRounds).toBe(2);
    // 2 rework rounds / 4 eligible reviewed tasks = 0.5
    expect(rows[0]?.avgReworkRounds).toBe(0.5);
  });
});
