import {
  DEFECT_ANSWERS,
  DEFECT_RANKS,
  type GeneralCheckAnswer,
  type GeneralCheckEntry,
  type GeneralCheckQuestion,
  type ReviewDecision,
  type ReviewDraft,
  type ReviewRank,
} from '@sdp/contracts';

/**
 * The rules that decide whether a review may be submitted, and how.
 *
 * These are the most consequential rules in the product: they are what stops a
 * reviewer approving code they have just recorded serious defects against. Every
 * one is a pure function of the draft, so each can be asserted directly rather
 * than inferred from a disabled button — and each is re-enforced server-side,
 * because a disabled button is a courtesy, not a control.
 */

/* -------------------------------------------------------------------------- */
/* Blocking reasons                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Machine-readable reasons a review cannot be submitted.
 *
 * Codes rather than sentences: the domain layer must not depend on `content/`,
 * and the same code renders as a field error, a list row, and a toast.
 */
export const REVIEW_BLOCKERS = [
  'generalCheckIncomplete',
  'findingsRequired',
  'rankRequired',
  'screenshotRequired',
  'approveBlockedByRank',
] as const;
export type ReviewBlocker = (typeof REVIEW_BLOCKERS)[number];

export interface ReviewReadinessInput {
  draft: ReviewDraft;
  /** The questions actually rendered — the denominator for "all answered". */
  questions: readonly GeneralCheckQuestion[];
  screenshotCount: number;
}

/** Answers that oblige the reviewer to write Detailed Review Findings. */
function isDefectAnswer(answer: GeneralCheckAnswer): boolean {
  return (DEFECT_ANSWERS as readonly GeneralCheckAnswer[]).includes(answer);
}

/** Ranks that block approval and demand evidence (FL 2.9.2.5-01). */
export function isDefectRank(rank: ReviewRank | null): boolean {
  return rank !== null && (DEFECT_RANKS as readonly ReviewRank[]).includes(rank);
}

/** FL 2.9.2.4-01: every rendered General Check question must carry an answer. */
export function generalCheckComplete(
  questions: readonly GeneralCheckQuestion[],
  entries: readonly GeneralCheckEntry[],
): boolean {
  if (questions.length === 0) return false;
  const answered = new Set(entries.map((entry) => entry.questionId));
  return questions.every((question) => answered.has(question.id));
}

/** How many questions were answered "Partially OK" or "Not OK". */
export function defectAnswerCount(
  questions: readonly GeneralCheckQuestion[],
  entries: readonly GeneralCheckEntry[],
): number {
  const visible = new Set(questions.map((question) => question.id));
  return entries.filter((entry) => visible.has(entry.questionId) && isDefectAnswer(entry.answer))
    .length;
}

/** True when any of the three Detailed Review Findings boxes has content. */
export function hasFindings(draft: ReviewDraft): boolean {
  const { incorrectCode, incompleteImplementation, sourceFormatting } = draft.findings;
  return [incorrectCode, incompleteImplementation, sourceFormatting].some(
    (text) => text.trim() !== '',
  );
}

/**
 * Everything standing between this draft and a submission, for a given action.
 *
 * `decision` matters: Approve and Request Changes are gated differently, and a
 * draft that is perfectly valid for Request Changes may be forbidden for
 * Approve. That is the whole point of FL 2.9.2.5-01.
 */
export function reviewBlockers(
  input: ReviewReadinessInput,
  decision: ReviewDecision,
): ReviewBlocker[] {
  const { draft, questions, screenshotCount } = input;
  const blockers: ReviewBlocker[] = [];

  if (!generalCheckComplete(questions, draft.generalCheck)) {
    blockers.push('generalCheckIncomplete');
  }

  // FL 2.9.2.4-02: a defect answer obliges the reviewer to say what is wrong.
  if (defectAnswerCount(questions, draft.generalCheck) > 0 && !hasFindings(draft)) {
    blockers.push('findingsRequired');
  }

  if (draft.rank === null) {
    blockers.push('rankRequired');
  }

  /*
   * FL 2.9.2.5-01. Rank 2 and Rank 3 mean the reviewer has recorded real
   * defects, so:
   *   - Approve is not available at all, and
   *   - Request Changes requires written findings AND at least one screenshot,
   *     because the developer has to be able to see what to fix.
   */
  if (isDefectRank(draft.rank)) {
    if (decision === 'Approved') {
      blockers.push('approveBlockedByRank');
    }
    if (!hasFindings(draft) && !blockers.includes('findingsRequired')) {
      blockers.push('findingsRequired');
    }
    if (screenshotCount === 0) {
      blockers.push('screenshotRequired');
    }
  }

  return blockers;
}

export function canSubmitReview(input: ReviewReadinessInput, decision: ReviewDecision): boolean {
  return reviewBlockers(input, decision).length === 0;
}

/**
 * Whether the Approve action should be offered at all.
 *
 * Separate from `canSubmitReview` because the UI needs to disable the button the
 * moment Rank 2 is chosen, before the reviewer has attempted anything — the
 * spec's intent is that Approve visibly stops being an option.
 */
export function canApprove(input: ReviewReadinessInput): boolean {
  return canSubmitReview(input, 'Approved');
}

/* -------------------------------------------------------------------------- */
/* Cycle counting — plan risk R3                                               */
/* -------------------------------------------------------------------------- */

/**
 * The next review cycle after a decision.
 *
 * ⚠️ The two source documents disagree, and this is deliberately the ONLY place
 * that decides it:
 *
 *   - Spec p.10 — the cycle increments when the reviewer requests changes.
 *   - FL 2.11.2.3-02 Branch A — a rejection the reviewer subsequently ACCEPTS
 *     does not count as a cycle.
 *
 * Both readings are implemented and unit-tested; `countAcceptedRejections`
 * selects between them. Until the business rules on it, the default follows spec
 * p.10 (the simpler reading), and the contradiction stays isolated to this
 * function rather than smeared across the reports that consume the number.
 *
 * This is a Phase 2 blocker, not a Phase 1 one — the frontend renders whatever
 * the number is.
 */
export function nextReviewCycle(
  currentCycle: number,
  decision: ReviewDecision,
  options: {
    acceptedRejections?: number;
    countAcceptedRejections?: boolean;
  } = {},
): number {
  if (decision === 'Approved') return currentCycle;

  const { acceptedRejections = 0, countAcceptedRejections = true } = options;
  if (countAcceptedRejections) return currentCycle + 1;

  // Branch A: a cycle whose findings the reviewer later accepted as invalid does
  // not count against the developer.
  return acceptedRejections > 0 ? currentCycle : currentCycle + 1;
}
