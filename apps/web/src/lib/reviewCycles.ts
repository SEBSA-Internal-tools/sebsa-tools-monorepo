/**
 * Review-cycle arithmetic shared by the developer and reviewer workspaces and
 * the mock API. `reviews/domain/reviewRules` re-exports these for its callers.
 */

/**
 * The next strictly monotonic historical cycle number, so a cycle id never
 * collides even after the effective `reviewCycle` was decremented.
 */
export function nextHistoricalReviewCycle(
  task: { reviewCycle: number; historicalCycle?: number },
  existingReviews: readonly { reviewCycle: number }[],
): number {
  const highestExisting =
    existingReviews.length > 0 ? Math.max(...existingReviews.map((r) => r.reviewCycle)) : 0;
  const currentHistorical = task.historicalCycle ?? task.reviewCycle;
  return Math.max(highestExisting, currentHistorical) + 1;
}

/**
 * The cycle that developer responses and re-review adjudication belong to.
 *
 * Once a review has been decided and the task is back in rework or re-review,
 * the active cycle sits above every completed one, so responses get
 * cycle-scoped ids and never overwrite an earlier cycle's data.
 */
export function resolveActiveReviewCycle(
  task: { reviewCycle: number; historicalCycle?: number | null; status?: string | null },
  existingReviews: readonly { reviewCycle: number; decision?: string | null }[] = [],
): number {
  const completedReviews = existingReviews.filter((r) => r.decision !== null);
  const highestCompletedCycle =
    completedReviews.length > 0 ? Math.max(...completedReviews.map((r) => r.reviewCycle)) : 0;
  const anyCycle =
    existingReviews.length > 0 ? Math.max(...existingReviews.map((r) => r.reviewCycle)) : 0;
  const taskCycle = task.historicalCycle ?? task.reviewCycle;

  const inRework =
    task.status === 'ChangesRequested' ||
    task.status === 'ReSubmitted' ||
    task.status === 'InReview';
  if (highestCompletedCycle > 0 && inRework) {
    return Math.max(taskCycle, highestCompletedCycle + 1, anyCycle);
  }

  return Math.max(taskCycle, highestCompletedCycle, anyCycle, 1);
}

/** A cycle-scoped response id, so a response is never shared across cycles. */
export function createCycleResponseId(taskId: string, cycle: number, entityKey: string): string {
  const cleanKey =
    entityKey.startsWith('c-') || entityKey.startsWith('s-') ? entityKey : `c-${entityKey}`;
  return `resp-${taskId}-${String(cycle)}-${cleanKey}`;
}
