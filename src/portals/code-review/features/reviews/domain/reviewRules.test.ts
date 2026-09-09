import { describe, expect, it } from 'vitest';
import type { GeneralCheckQuestion, ReviewDraft } from '@sdp/contracts';
import {
  canApprove,
  defectAnswerCount,
  generalCheckComplete,
  hasFindings,
  isDefectRank,
  nextReviewCycle,
  reviewBlockers,
} from './reviewRules.ts';

/**
 * FL 2.9.2.5-01 is the most consequential rule in the product — it is what stops
 * a reviewer approving code they have just recorded serious defects against — so
 * it is tested from every direction rather than assumed from a disabled button.
 */

const QUESTIONS: GeneralCheckQuestion[] = Array.from({ length: 3 }, (_, index) => ({
  id: `gc-${String(index + 1)}`,
  text: `Question ${String(index + 1)}`,
  order: (index + 1) * 10,
}));

const EMPTY_FINDINGS = {
  incorrectCode: '',
  incompleteImplementation: '',
  sourceFormatting: '',
};

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    generalCheck: QUESTIONS.map((question) => ({
      questionId: question.id,
      answer: 'Ok' as const,
    })),
    findings: EMPTY_FINDINGS,
    otherRemarks: '',
    feedbackSummary: '',
    rank: 1,
    ...overrides,
  };
}

function input(overrides: Partial<ReviewDraft> = {}, screenshotCount = 0) {
  return { draft: draft(overrides), questions: QUESTIONS, screenshotCount };
}

describe('generalCheckComplete (FL 2.9.2.4-01)', () => {
  it('requires every rendered question to be answered', () => {
    expect(generalCheckComplete(QUESTIONS, draft().generalCheck)).toBe(true);
    expect(generalCheckComplete(QUESTIONS, [{ questionId: 'gc-1', answer: 'Ok' }])).toBe(false);
  });

  it('is not satisfied by an empty question bank', () => {
    // Regression guard of the same shape as the developer checklist's: zero of
    // zero must not read as complete.
    expect(generalCheckComplete([], [])).toBe(false);
  });

  it('ignores answers to questions that are not rendered', () => {
    const stale = [...draft().generalCheck, { questionId: 'gc-99', answer: 'NotOk' as const }];
    expect(generalCheckComplete(QUESTIONS, stale)).toBe(true);
    expect(defectAnswerCount(QUESTIONS, stale)).toBe(0);
  });
});

describe('findings requirement (FL 2.9.2.4-02)', () => {
  it('treats Partially OK and Not OK as defects, OK and N/A as not', () => {
    const answers = (answer: 'Ok' | 'PartiallyOk' | 'NotOk' | 'NA') =>
      defectAnswerCount(QUESTIONS, [{ questionId: 'gc-1', answer }]);

    expect(answers('Ok')).toBe(0);
    expect(answers('NA')).toBe(0);
    expect(answers('PartiallyOk')).toBe(1);
    expect(answers('NotOk')).toBe(1);
  });

  it('blocks submission when a defect answer has no written findings', () => {
    const withDefect = input({
      generalCheck: [
        { questionId: 'gc-1', answer: 'NotOk' },
        { questionId: 'gc-2', answer: 'Ok' },
        { questionId: 'gc-3', answer: 'Ok' },
      ],
    });

    expect(reviewBlockers(withDefect, 'ChangesRequested')).toContain('findingsRequired');
  });

  it('accepts findings in any one of the three boxes', () => {
    for (const key of ['incorrectCode', 'incompleteImplementation', 'sourceFormatting'] as const) {
      expect(hasFindings(draft({ findings: { ...EMPTY_FINDINGS, [key]: 'Something' } }))).toBe(
        true,
      );
    }
    expect(hasFindings(draft({ findings: { ...EMPTY_FINDINGS, incorrectCode: '   ' } }))).toBe(
      false,
    );
  });
});

describe('the rank gate (FL 2.9.2.5-01)', () => {
  it('treats Rank 2 and Rank 3 as defect ranks, Rank 1 as clean', () => {
    expect(isDefectRank(1)).toBe(false);
    expect(isDefectRank(2)).toBe(true);
    expect(isDefectRank(3)).toBe(true);
    expect(isDefectRank(null)).toBe(false);
  });

  it('permits Approve at Rank 1 with nothing else outstanding', () => {
    expect(canApprove(input())).toBe(true);
  });

  it.each([2, 3] as const)('BLOCKS Approve at Rank %i, however complete the review is', (rank) => {
    const complete = input(
      {
        rank,
        findings: {
          ...EMPTY_FINDINGS,
          incorrectCode: 'Found a real problem.',
        },
      },
      1,
    );

    // Everything else is satisfied — findings written, screenshot attached — and
    // Approve is STILL unavailable. That is the rule.
    expect(reviewBlockers(complete, 'ChangesRequested')).toEqual([]);
    expect(reviewBlockers(complete, 'Approved')).toEqual(['approveBlockedByRank']);
    expect(canApprove(complete)).toBe(false);
  });

  it('requires findings AND a screenshot before Request Changes at a defect rank', () => {
    const bare = input({ rank: 2 });
    expect(reviewBlockers(bare, 'ChangesRequested')).toEqual([
      'findingsRequired',
      'screenshotRequired',
    ]);

    const withFindings = input({
      rank: 2,
      findings: {
        ...EMPTY_FINDINGS,
        sourceFormatting: 'Indentation is inconsistent.',
      },
    });
    expect(reviewBlockers(withFindings, 'ChangesRequested')).toEqual(['screenshotRequired']);

    const withBoth = input(
      {
        rank: 2,
        findings: { ...EMPTY_FINDINGS, sourceFormatting: 'Indentation.' },
      },
      1,
    );
    expect(reviewBlockers(withBoth, 'ChangesRequested')).toEqual([]);
  });

  it('does not demand a screenshot at Rank 1', () => {
    // Rank 1 means no serious issues, so there is nothing to photograph.
    expect(reviewBlockers(input({ rank: 1 }, 0), 'ChangesRequested')).toEqual([]);
  });

  it('requires a rank before either decision', () => {
    expect(reviewBlockers(input({ rank: null }), 'Approved')).toContain('rankRequired');
    expect(reviewBlockers(input({ rank: null }), 'ChangesRequested')).toContain('rankRequired');
  });

  it('does not report the same blocker twice', () => {
    // A defect answer AND a defect rank both demand findings; the reviewer
    // should be told once.
    const both = input({
      rank: 3,
      generalCheck: [
        { questionId: 'gc-1', answer: 'NotOk' },
        { questionId: 'gc-2', answer: 'Ok' },
        { questionId: 'gc-3', answer: 'Ok' },
      ],
    });

    const blockers = reviewBlockers(both, 'ChangesRequested');
    expect(blockers.filter((b) => b === 'findingsRequired')).toHaveLength(1);
  });
});

describe('nextReviewCycle — the contradiction in plan risk R3', () => {
  it('does not advance the cycle on approval', () => {
    expect(nextReviewCycle(2, 'Approved')).toBe(2);
  });

  it('advances on Request Changes under spec p.10, the default reading', () => {
    expect(nextReviewCycle(1, 'ChangesRequested')).toBe(2);
  });

  it('holds the cycle under FL 2.11.2.3-02 Branch A when a rejection was accepted', () => {
    // The competing reading: a cycle whose findings the reviewer later conceded
    // were invalid should not count against the developer. Both are implemented
    // here so the business can choose without a code change reaching the screens.
    expect(
      nextReviewCycle(1, 'ChangesRequested', {
        acceptedRejections: 1,
        countAcceptedRejections: false,
      }),
    ).toBe(1);

    expect(
      nextReviewCycle(1, 'ChangesRequested', {
        acceptedRejections: 0,
        countAcceptedRejections: false,
      }),
    ).toBe(2);
  });
});
