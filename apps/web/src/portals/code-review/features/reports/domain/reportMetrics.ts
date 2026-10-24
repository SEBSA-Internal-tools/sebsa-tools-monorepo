import type { Customer, Review, TaskListItem, TaskStatus, User } from '@sdp/contracts';
import { decidedReviews, isRank } from '@/lib/reviewStats.ts';
import {
  APPROVAL_RATE_TARGET,
  DEV_GUARDRAIL_MAX_CYCLES_FOR_GOOD,
  DEV_GUARDRAIL_MAX_RANK_FOR_GOOD,
  DEV_GUARDRAIL_MAX_REWORK_FOR_GOOD,
  DEV_QUALITY_WEIGHT_CYCLES,
  DEV_QUALITY_WEIGHT_FTA,
  DEV_QUALITY_WEIGHT_RANK,
  DEV_QUALITY_WEIGHT_REWORK,
  DEV_STANDING_MIN_ELIGIBLE_TASKS,
  DEV_STANDING_SCORE_FAIR,
  DEV_STANDING_SCORE_GOOD,
  GOOD_RANK_THRESHOLD,
  HIGH_CYCLE_THRESHOLD,
  LENIENT_APPROVAL_RATE,
  STRICT_APPROVAL_RATE,
} from '@/lib/analyticsTargets.ts';

/**
 * Every number on the Reports tab, as pure functions.
 *
 * These live in `domain/` and import nothing but types, for the usual reason:
 * the same aggregations move to SQL in Phase 2, and a rule that lives inside a
 * chart component cannot be ported line for line or unit-tested against the
 * business's own figures.
 *
 * Phase 1 computes them in the browser over the full task list, which is
 * defensible only because an admin is authorised to see every row anyway and
 * there are tens of them. Phase 2 pre-aggregates nightly (plan §2.6).
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportFilters {
  /** ISO date, inclusive. Empty means no lower bound. */
  from: string;
  customerId: string;
  status?: string;
}

export const ALL_REPORT_VALUES = 'all';

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  from: '',
  customerId: ALL_REPORT_VALUES,
  status: ALL_REPORT_VALUES,
};

export function applyReportFilters(
  tasks: readonly TaskListItem[],
  filters: ReportFilters,
): TaskListItem[] {
  return tasks.filter((task) => {
    if (filters.customerId !== ALL_REPORT_VALUES && task.customerId !== filters.customerId) {
      return false;
    }
    if (filters.status && filters.status !== ALL_REPORT_VALUES && task.status !== filters.status) {
      return false;
    }
    if (filters.from !== '' && task.createdAt < filters.from) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Distributions — the three donuts                                            */
/* -------------------------------------------------------------------------- */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** Share of the whole, 0–100, rounded to one decimal. */
  percent: number;
}

function toSlices(counts: ReadonlyMap<string, { label: string; value: number }>): Slice[] {
  const total = [...counts.values()].reduce((sum, entry) => sum + entry.value, 0);

  return [...counts.entries()]
    .filter(([, entry]) => entry.value > 0)
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      value: entry.value,
      percent: total === 0 ? 0 : Math.round((entry.value / total) * 1000) / 10,
    }));
}

export function taskStatusDistribution(
  tasks: readonly TaskListItem[],
  labels: Readonly<Record<TaskStatus, string>>,
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>();

  for (const task of tasks) {
    const existing = counts.get(task.status);
    counts.set(task.status, {
      label: labels[task.status],
      value: (existing?.value ?? 0) + 1,
    });
  }

  return toSlices(counts);
}

/**
 * Reviews eligible for developer / quality KPI generation.
 *
 * Rules:
 * - Must be a decided review with a non-null rank.
 * - Defect ranks (Rank 2 and Rank 3) are always counted across all cycles (Cycle 1, 2, 3...)
 *   towards the developer's defect KPI.
 * - Rank 1 (Approved / Clean) is ONLY counted on Round 1 (First-Time-Right).
 *   Subsequent approval Rank 1 (Cycle > 1) is excluded because every task is eventually
 *   approved with Rank 1 after rework, and folding in rework Rank 1 would flatter the
 *   developer's defect / quality metrics.
 */
export function kpiEligibleReviews(reviews: readonly Review[]): Review[] {
  return decidedReviews(reviews).filter((review) => {
    if (review.rank === null) return false;
    const round = review.reviewRound ?? (review as { reviewCycle?: number }).reviewCycle ?? 1;
    if (review.rank === 1 && round > 1) {
      return false;
    }
    return true;
  });
}

/**
 * Rank distribution over KPI-eligible DECIDED reviews.
 *
 * Undecided reviews are excluded rather than counted as rank 1: a review in
 * progress has no verdict, and folding it in would flatter the numbers.
 * Subsequent approval Rank 1 (Cycle > 1) is excluded to preserve defect KPI integrity.
 */
export function rankDistribution(
  reviews: readonly Review[],
  labels: Readonly<Record<1 | 2 | 3, string>>,
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>([
    ['1', { label: labels[1], value: 0 }],
    ['2', { label: labels[2], value: 0 }],
    ['3', { label: labels[3], value: 0 }],
  ]);

  for (const review of kpiEligibleReviews(reviews)) {
    if (review.rank === null) continue;
    const key = String(review.rank);
    const entry = counts.get(key);
    if (entry) {
      entry.value += 1;
    }
  }

  return toSlices(counts);
}

/**
 * How many cycles tasks took to reach approval, bucketed as the wireframe does:
 * Cycle 1, Cycle 2, Cycle 3+.
 *
 * Only approved tasks are counted. Cycles are strictly 1-based (Cycle 1 is the minimum).
 */
export function cycleDistribution(
  tasks: readonly TaskListItem[],
  labels: { one: string; two: string; threePlus: string },
): Slice[] {
  const counts = new Map<string, { label: string; value: number }>([
    ['1', { label: labels.one, value: 0 }],
    ['2', { label: labels.two, value: 0 }],
    ['3+', { label: labels.threePlus, value: 0 }],
  ]);

  for (const task of approvedTasks(tasks)) {
    const cycleCount = task.reviewCycle ?? task.countedCycle;
    const key = cycleCount <= 1 ? '1' : cycleCount === 2 ? '2' : '3+';
    const entry = counts.get(key);
    if (entry) entry.value += 1;
  }

  return toSlices(counts);
}

/* -------------------------------------------------------------------------- */
/* Summary — the eight KPI cards                                               */
/* -------------------------------------------------------------------------- */

export interface ReportSummary {
  total: number;
  approved: number;
  changesRequested: number;
  cancelled: number;
  /** Percent of tasks that reached review and were approved. */
  approvalRate: number;
  isApprovalOnTarget: boolean;
  avgCountedCycles: number;
  avgReviewCycles: number;
  isCycleCountHigh: boolean;
  avgQualityRank: number;
  isQualityGood: boolean;
  team: { developers: number; reviewers: number; admins: number };
}

/**
 * The denominator for approval rate is tasks that actually reached review —
 * total minus drafts minus cancellations.
 *
 * Counting drafts would punish a team for work in progress, and counting
 * cancellations would punish them for work the business withdrew. This matches
 * the wireframe's own arithmetic: 33 tasks, 3 drafts, 16 cancelled, 2 approved →
 * "14.3% approval rate".
 */
export function reviewedTaskCount(tasks: readonly TaskListItem[]): number {
  return tasks.filter((task) => task.status !== 'Draft' && task.status !== 'Cancelled').length;
}

export function summarise(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  users: readonly User[],
): ReportSummary {
  const approved = approvedTasks(tasks);
  const reviewed = reviewedTaskCount(tasks);
  const ranked = kpiEligibleReviews(reviews);

  const approvalRate = reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100);
  const avgCountedCycles =
    approved.length === 0 ? 0 : round2(mean(approved.map((task) => Math.max(task.countedCycle, 1))));
  const avgQualityRank =
    ranked.length === 0 ? 0 : round2(mean(ranked.map((review) => review.rank ?? 0)));

  const active = users.filter((user) => user.isActive);

  return {
    total: tasks.length,
    approved: approved.length,
    changesRequested: tasks.filter((task) => task.status === 'ChangesRequested').length,
    cancelled: tasks.filter((task) => task.status === 'Cancelled').length,
    approvalRate,
    isApprovalOnTarget: approvalRate >= APPROVAL_RATE_TARGET,
    avgCountedCycles,
    avgReviewCycles: avgCountedCycles,
    // Zero means "nothing approved yet", not "excellent" — an empty dataset must
    // not read as a perfect score.
    isCycleCountHigh: avgCountedCycles > HIGH_CYCLE_THRESHOLD,
    avgQualityRank,
    isQualityGood: ranked.length > 0 && avgQualityRank <= GOOD_RANK_THRESHOLD,
    team: {
      developers: active.filter((user) => user.roles.includes('Developer')).length,
      reviewers: active.filter((user) => user.roles.includes('Reviewer')).length,
      admins: active.filter((user) => user.roles.includes('Admin')).length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Per-person and per-customer breakdowns — the three sub-tabs                 */
/* -------------------------------------------------------------------------- */

/**
 * A task is an eligible reviewed task for developer quality KPIs if:
 * - It is not Cancelled or Draft.
 * - It has received at least one completed/decided review (review.decision !== null).
 */
export function isEligibleReviewedTask(
  task: TaskListItem,
  taskReviews: readonly Review[],
): boolean {
  if (task.status === 'Cancelled' || task.status === 'Draft') return false;
  return decidedReviews(taskReviews).length > 0;
}

/**
 * Evaluates whether a task was approved on its FIRST completed review decision
 * without requiring rework.
 *
 * Rules:
 * - The first completed review must be Review Round 1.
 * - decision === 'Approved'
 * - rank === 1
 * - No ChangesRequested decision was recorded for this task.
 */
export function isTaskFirstTimeApproved(
  taskReviews: readonly Review[],
): boolean {
  const decided = decidedReviews(taskReviews);
  if (decided.length === 0) return false;

  const sorted = [...decided].sort(
    (a, b) => (a.reviewRound ?? 1) - (b.reviewRound ?? 1),
  );
  const first = sorted[0];
  if (!first) return false;

  const round = first.reviewRound ?? 1;
  const hasChangesRequested = decided.some((r) => r.decision === 'ChangesRequested');

  return (
    round === 1 &&
    first.decision === 'Approved' &&
    first.rank === 1 &&
    !hasChangesRequested
  );
}

export interface DeveloperPerformance {
  userId: string;
  name: string;
  taskCount: number;
  approvedCount: number;
  eligibleReviewedCount: number;
  firstTimeApprovedCount: number;
  /** Percentage of eligible reviewed tasks approved on the first review without rework */
  firstTimeApprovalRate: number;
  /** Eventual approval rate (kept for backward compatibility) */
  approvalRate: number;
  avgRank: number | null;
  avgCycles: number | null;
  /** Total review rounds where changes were requested (review-event-based). */
  reworkRounds: number;
  /** Average rework rounds per eligible reviewed task */
  avgReworkRounds: number;
  /** Backward-compatibility alias for reworkRounds. */
  changesRequestedCount: number;
  /** Weighted composite quality score out of 100, or null when limited or no reviews. */
  qualityScore: number | null;
  /** Coarse label the wireframe shows as a chip. */
  standing: 'good' | 'fair' | 'poor' | 'none' | 'limited';
  rankSlices: Slice[];
  cycleSlices: Slice[];
}

const DEFAULT_DEV_RANK_LABELS: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'Rank 1',
  2: 'Rank 2',
  3: 'Rank 3',
};

const DEFAULT_DEV_CYCLE_LABELS = {
  one: 'Cycle 1',
  two: 'Cycle 2',
  threePlus: 'Cycle 3+',
};

export function developerPerformance(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  users: readonly User[],
  labels?: {
    rank: Readonly<Record<1 | 2 | 3, string>>;
    cycle: { one: string; two: string; threePlus: string };
  },
): DeveloperPerformance[] {
  const byTask = new Map(tasks.map((task) => [task.id, task]));
  const rankLabels = labels?.rank ?? DEFAULT_DEV_RANK_LABELS;
  const cycleLabels = labels?.cycle ?? DEFAULT_DEV_CYCLE_LABELS;
  const allDecided = decidedReviews(reviews);

  return users
    .filter((user) => user.roles.includes('Developer'))
    .map((user) => {
      const own = tasks.filter((task) => task.developerId === user.id);
      const approved = approvedTasks(own);
      const reviewed = reviewedTaskCount(own);
      const approvalRate = reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100);

      const ownReviews = allDecided.filter((review) => {
        const task = byTask.get(review.taskId);
        return task?.developerId === user.id;
      });

      const reviewsByTask = new Map<string, Review[]>();
      for (const review of ownReviews) {
        const list = reviewsByTask.get(review.taskId);
        if (list) {
          list.push(review);
        } else {
          reviewsByTask.set(review.taskId, [review]);
        }
      }

      const eligibleReviewed = own.filter((task) =>
        isEligibleReviewedTask(task, reviewsByTask.get(task.id) ?? []),
      );

      const firstTimeApproved = eligibleReviewed.filter((task) =>
        isTaskFirstTimeApproved(reviewsByTask.get(task.id) ?? []),
      );

      const firstTimeApprovalRate =
        eligibleReviewed.length === 0
          ? 0
          : round1((firstTimeApproved.length / eligibleReviewed.length) * 100);

      const ownKpiReviews = kpiEligibleReviews(ownReviews);
      const ranks = ownKpiReviews.map((review) => review.rank).filter(isRank);

      const avgRank = ranks.length === 0 ? null : round2(mean(ranks));
      const avgCycles =
        approved.length === 0
          ? null
          : round2(mean(approved.map((task) => Math.max(task.countedCycle, 1))));
      const reworkRounds = ownReviews.filter(
        (review) => review.decision === 'ChangesRequested',
      ).length;
      const avgReworkRounds =
        eligibleReviewed.length === 0
          ? 0
          : round2(reworkRounds / eligibleReviewed.length);

      const standing = standingFor(
        eligibleReviewed.length,
        firstTimeApprovalRate,
        avgRank,
        avgCycles,
        avgReworkRounds,
      );
      const qualityScore =
        eligibleReviewed.length < DEV_STANDING_MIN_ELIGIBLE_TASKS
          ? null
          : calculateQualityScore(
              firstTimeApprovalRate,
              avgRank,
              avgCycles,
              avgReworkRounds,
            );

      return {
        userId: user.id,
        name: user.name,
        taskCount: own.length,
        approvedCount: approved.length,
        eligibleReviewedCount: eligibleReviewed.length,
        firstTimeApprovedCount: firstTimeApproved.length,
        firstTimeApprovalRate,
        approvalRate,
        avgRank,
        avgCycles,
        reworkRounds,
        avgReworkRounds,
        changesRequestedCount: reworkRounds,
        qualityScore,
        standing,
        rankSlices: rankDistribution(ownReviews, rankLabels),
        cycleSlices: cycleDistribution(own, cycleLabels),
      };
    })
    .filter((row) => row.taskCount > 0)
    .sort((a, b) => b.taskCount - a.taskCount);
}

export interface ReviewerActivity {
  userId: string;
  name: string;
  reviewCount: number;
  approvalRate: number;
  changesRate: number;
  avgRankGiven: number | null;
  /** "Strict" when they mostly request changes; "Lenient" when they mostly approve. */
  tendency: 'strict' | 'balanced' | 'lenient' | 'none';
}

export function reviewerActivity(
  reviews: readonly Review[],
  users: readonly User[],
): ReviewerActivity[] {
  const finished = decidedReviews(reviews);

  return users
    .filter((user) => user.roles.includes('Reviewer'))
    .map((user) => {
      const own = finished.filter((review) => review.reviewerId === user.id);
      const approvals = own.filter((review) => review.decision === 'Approved').length;
      const approvalRate = own.length === 0 ? 0 : round1((approvals / own.length) * 100);
      const ranks = own.map((review) => review.rank).filter(isRank);

      return {
        userId: user.id,
        name: user.name,
        reviewCount: own.length,
        approvalRate,
        changesRate: own.length === 0 ? 0 : round1(100 - approvalRate),
        avgRankGiven: ranks.length === 0 ? null : round2(mean(ranks)),
        tendency: tendencyFor(own.length, approvalRate),
      };
    })
    .filter((row) => row.reviewCount > 0)
    .sort((a, b) => b.reviewCount - a.reviewCount);
}

export interface CustomerOverview {
  customerId: string;
  name: string;
  code: string;
  color: string;
  taskCount: number;
  approvedCount: number;
  approvalRate: number;
  avgCycles: number | null;
  rankSlices: Slice[];
  cycleSlices: Slice[];
}

export function customerOverview(
  tasks: readonly TaskListItem[],
  reviews: readonly Review[],
  customers: readonly Customer[],
  labels: {
    rank: Readonly<Record<1 | 2 | 3, string>>;
    cycle: { one: string; two: string; threePlus: string };
  },
): CustomerOverview[] {
  const byTask = new Map(tasks.map((task) => [task.id, task]));

  return customers
    .map((customer) => {
      const own = tasks.filter((task) => task.customerId === customer.id);
      const approved = approvedTasks(own);
      const reviewed = reviewedTaskCount(own);
      const ownReviews = reviews.filter((review) => {
        const task = byTask.get(review.taskId);
        return task?.customerId === customer.id;
      });

      return {
        customerId: customer.id,
        name: customer.name,
        code: customer.code,
        color: customer.color,
        taskCount: own.length,
        approvedCount: approved.length,
        approvalRate: reviewed === 0 ? 0 : round1((approved.length / reviewed) * 100),
        avgCycles:
          approved.length === 0
            ? null
            : round2(mean(approved.map((task) => Math.max(task.countedCycle, 1)))),
        rankSlices: rankDistribution(ownReviews, labels.rank),
        cycleSlices: cycleDistribution(own, labels.cycle),
      };
    })
    .filter((row) => row.taskCount > 0)
    .sort((a, b) => b.taskCount - a.taskCount);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function approvedTasks(tasks: readonly TaskListItem[]): TaskListItem[] {
  return tasks.filter((task) => task.status === 'Approved');
}

/*
 * Non-null on purpose, unlike the shared `mean` in `lib/reviewStats.ts`.
 *
 * Every call site here guards the empty case first and then chooses `0` or
 * `null` deliberately — an approval rate of 0% and an average rank of "no data"
 * are different claims (FL 2.4.3). Adopting the nullable version would collapse
 * that choice into one answer at the wrong layer.
 */
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalizes First-Time Approval Rate to a 0–100 score.
 * Formula: FTA Score = FTA Rate directly.
 */
export function ftaComponentScore(firstTimeApprovalRate: number): number {
  return Math.max(0, Math.min(100, firstTimeApprovalRate));
}

/**
 * Normalizes Average Quality Ranking to a 0–100 score.
 * Lower Avg Rank is better (1.0 = best, 3.0 = worst).
 *
 * Mapping:
 * - <= 1.25 -> 100
 * - <= 1.50 -> 90
 * - <= 1.75 -> 80
 * - <= 2.00 -> 70
 * - <= 2.25 -> 55
 * - <= 2.50 -> 40
 * - > 2.50  -> 20
 * - null    -> 70 (neutral baseline)
 */
export function rankComponentScore(avgRank: number | null): number {
  if (avgRank === null) return 70;
  if (avgRank <= 1.25) return 100;
  if (avgRank <= 1.50) return 90;
  if (avgRank <= 1.75) return 80;
  if (avgRank <= 2.00) return 70;
  if (avgRank <= 2.25) return 55;
  if (avgRank <= 2.50) return 40;
  return 20;
}

/**
 * Normalizes Average Review Cycles to a 0–100 score.
 * Lower Avg Cycles is better.
 *
 * Mapping:
 * - <= 1.25 -> 100
 * - <= 1.50 -> 90
 * - <= 2.00 -> 75
 * - <= 2.50 -> 60
 * - <= 3.00 -> 45
 * - > 3.00  -> 25
 * - null    -> 50 (neutral baseline when no approved tasks exist yet)
 */
export function cycleComponentScore(avgCycles: number | null): number {
  if (avgCycles === null) return 50;
  if (avgCycles <= 1.25) return 100;
  if (avgCycles <= 1.50) return 90;
  if (avgCycles <= 2.00) return 75;
  if (avgCycles <= 2.50) return 60;
  if (avgCycles <= 3.00) return 45;
  return 25;
}

/**
 * Normalizes Average Rework Rounds per Reviewed Task to a 0–100 score.
 * Lower is better.
 *
 * Mapping:
 * - <= 0.25 -> 100
 * - <= 0.50 -> 90
 * - <= 1.00 -> 75
 * - <= 1.50 -> 60
 * - <= 2.00 -> 45
 * - > 2.00  -> 25
 */
export function reworkComponentScore(avgReworkRounds: number): number {
  if (avgReworkRounds <= 0.25) return 100;
  if (avgReworkRounds <= 0.50) return 90;
  if (avgReworkRounds <= 1.00) return 75;
  if (avgReworkRounds <= 1.50) return 60;
  if (avgReworkRounds <= 2.00) return 45;
  return 25;
}

/**
 * Calculates the combined weighted Quality Score out of 100:
 * (FTA Score * 0.35) + (Rank Score * 0.30) + (Cycle Score * 0.20) + (Rework Score * 0.15)
 * Rounded to 1 decimal place.
 */
export function calculateQualityScore(
  firstTimeApprovalRate: number,
  avgRank: number | null,
  avgCycles: number | null,
  avgReworkRounds: number,
): number {
  const ftaScore = ftaComponentScore(firstTimeApprovalRate);
  const rankScore = rankComponentScore(avgRank);
  const cycleScore = cycleComponentScore(avgCycles);
  const reworkScore = reworkComponentScore(avgReworkRounds);

  const raw =
    ftaScore * DEV_QUALITY_WEIGHT_FTA +
    rankScore * DEV_QUALITY_WEIGHT_RANK +
    cycleScore * DEV_QUALITY_WEIGHT_CYCLES +
    reworkScore * DEV_QUALITY_WEIGHT_REWORK;

  return round1(raw);
}

/**
 * Calculates a developer's quality standing badge based on:
 * - Eligible Reviewed Task count:
 *     0 tasks -> 'none' (No reviews)
 *     1–2 tasks -> 'limited' (Limited Data)
 *     3+ tasks -> Weighted Quality Score (0–100)
 *
 * Quality Score thresholds (for 3+ eligible reviewed tasks):
 * - Score >= 60 -> 'good' (subject to guardrails)
 * - Score >= 40 and < 60 -> 'fair'
 * - Score < 40 -> 'poor' (Needs attention)
 *
 * Safety guardrails (capping 'good' at 'fair' without forcing 'poor'):
 * - Avg Rank > 2.50
 * - Avg Cycles > 3.00
 * - Avg Rework Rounds > 2.00
 */
export function standingFor(
  eligibleReviewedCount: number,
  firstTimeApprovalRate: number,
  avgRank: number | null,
  avgCycles: number | null,
  avgReworkRounds: number = 0,
): DeveloperPerformance['standing'] {
  if (eligibleReviewedCount === 0) return 'none';
  if (eligibleReviewedCount < DEV_STANDING_MIN_ELIGIBLE_TASKS) return 'limited';

  const score = calculateQualityScore(
    firstTimeApprovalRate,
    avgRank,
    avgCycles,
    avgReworkRounds,
  );

  if (score >= DEV_STANDING_SCORE_GOOD) {
    const exceedsRankGuardrail =
      avgRank !== null && avgRank > DEV_GUARDRAIL_MAX_RANK_FOR_GOOD;
    const exceedsCycleGuardrail =
      avgCycles !== null && avgCycles > DEV_GUARDRAIL_MAX_CYCLES_FOR_GOOD;
    const exceedsReworkGuardrail =
      avgReworkRounds > DEV_GUARDRAIL_MAX_REWORK_FOR_GOOD;

    if (exceedsRankGuardrail || exceedsCycleGuardrail || exceedsReworkGuardrail) {
      return 'fair';
    }
    return 'good';
  }

  if (score >= DEV_STANDING_SCORE_FAIR) {
    return 'fair';
  }

  return 'poor';
}

function tendencyFor(reviewCount: number, approvalRate: number): ReviewerActivity['tendency'] {
  if (reviewCount === 0) return 'none';
  if (approvalRate >= LENIENT_APPROVAL_RATE) return 'lenient';
  if (approvalRate >= STRICT_APPROVAL_RATE) return 'balanced';
  return 'strict';
}
