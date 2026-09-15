import type { IssueResponseKind, Review, ReviewScreenshot } from '@sdp/contracts';

/**
 * The developer's reply to a reviewer's findings (spec §1.5 p.11, FL 2.11.2.3-01).
 *
 * Every finding must be answered before the task can go back, and rejecting one
 * requires a written justification — a developer may disagree with a reviewer,
 * but not silently. Both rules are pure functions here and re-enforced in the
 * handler, because "the Resubmit button was disabled" is not a control.
 */

/** One thing the developer has to respond to. */
export interface Issue {
  /** Null when the finding is the review as a whole rather than one screenshot. */
  screenshotId: string | null;
  label: string;
  detail: string;
}

/**
 * The findings a developer must answer, derived from the reviewer's last cycle.
 *
 * Screenshots come first and each is its own issue, because each carries its own
 * annotation and the developer answers them one at a time. The three written
 * findings are then folded into a single "overall" issue: they are one argument
 * about the same submission, and splitting them would ask the developer to
 * accept the formatting complaint while rejecting the performance one, which is
 * not a distinction the spec draws.
 */
export function issuesFromReview(review: Review | null): Issue[] {
  if (review?.decision !== 'ChangesRequested') return [];

  const issues: Issue[] = review.screenshots.map((shot: ReviewScreenshot) => ({
    screenshotId: shot.id,
    label: shot.fileName,
    detail: shot.comment,
  }));

  const written = [
    review.findings.incorrectCode,
    review.findings.incompleteImplementation,
    review.findings.sourceFormatting,
  ]
    .map((text) => text.trim())
    .filter((text) => text !== '');

  if (written.length > 0) {
    issues.push({
      screenshotId: null,
      label: 'findings',
      detail: written.join('\n\n'),
    });
  }

  return issues;
}

/**
 * The shape both a draft response and a stored one satisfy.
 *
 * Written structurally rather than as `IssueResponseDraft` so the same rule can
 * be applied to a record read back from the store, where `rejectionReason` is
 * `null` rather than absent. One rule, both directions.
 */
export interface ResponseLike {
  screenshotId: string | null;
  kind: IssueResponseKind;
  rejectionReason?: string | null | undefined;
}

/** FL 2.11.2.3-01: a rejection without a written reason is not a rejection. */
export function isResponseComplete(response: ResponseLike): boolean {
  if (response.kind !== 'Rejected') return true;
  return (response.rejectionReason ?? '').trim() !== '';
}

export interface ResubmitReadiness {
  /** Issues with no answer at all. */
  unanswered: number;
  /** Rejections still missing their justification. */
  unjustified: number;
  canResubmit: boolean;
}

/**
 * Whether the developer may resubmit.
 *
 * Counts the two failure modes separately so the UI can say which one is in the
 * way — "you have not answered 2 findings" and "you rejected a finding without
 * saying why" are different mistakes and deserve different prompts.
 */
export function resubmitReadiness(
  issues: readonly Issue[],
  responses: readonly ResponseLike[],
): ResubmitReadiness {
  const byScreenshot = new Map(responses.map((response) => [response.screenshotId, response]));

  let unanswered = 0;
  let unjustified = 0;

  for (const issue of issues) {
    const response = byScreenshot.get(issue.screenshotId);
    if (response === undefined) {
      unanswered += 1;
      continue;
    }
    if (!isResponseComplete(response)) unjustified += 1;
  }

  return {
    unanswered,
    unjustified,
    // An empty issue list means there is nothing to respond to, which cannot
    // happen for a ChangesRequested task — the rank gate guarantees at least
    // one finding. Treating it as "ready" would let a developer resubmit
    // without engaging with feedback at all.
    canResubmit: issues.length > 0 && unanswered === 0 && unjustified === 0,
  };
}
