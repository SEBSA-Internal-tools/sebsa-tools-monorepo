import { describe, expect, it } from 'vitest';
import type { IssueResponseDraft, Review } from '@sdp/contracts';
import { isResponseComplete, issuesFromReview, resubmitReadiness } from './responseRules.ts';

/**
 * FL 2.11.2.3-01 — a developer may disagree with a reviewer, but not silently.
 */

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rev-1',
    taskId: 't-1',
    reviewCycle: 1,
    reviewerId: 'u-rev',
    reviewerName: 'Reviewer',
    generalCheck: [],
    findings: {
      incorrectCode: '',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: '',
    rank: 2,
    screenshots: [],
    decision: 'ChangesRequested',
    decidedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function shot(id: string, comment: string) {
  return {
    id,
    fileName: `${id}.png`,
    sizeBytes: 1024,
    mimeType: 'image/png',
    storageRef: 'data:,',
    comment,
    uploadedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('issuesFromReview', () => {
  it('yields nothing for an approved review — there is nothing to answer', () => {
    expect(issuesFromReview(review({ decision: 'Approved' }))).toEqual([]);
    expect(issuesFromReview(review({ decision: null }))).toEqual([]);
    expect(issuesFromReview(null)).toEqual([]);
  });

  it('makes each screenshot its own issue', () => {
    const issues = issuesFromReview(
      review({
        screenshots: [shot('s1', 'Wrong view'), shot('s2', 'Bad indent')],
      }),
    );

    expect(issues.map((issue) => issue.screenshotId)).toEqual(['s1', 's2']);
    expect(issues[0]?.detail).toBe('Wrong view');
  });

  it('folds the three written findings into one issue', () => {
    // They are one argument about the same submission; splitting them would ask
    // the developer to accept the formatting complaint while rejecting the
    // performance one, a distinction the spec does not draw.
    const issues = issuesFromReview(
      review({
        findings: {
          incorrectCode: 'Cursor is wrong.',
          incompleteImplementation: '',
          sourceFormatting: 'Indentation.',
        },
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.screenshotId).toBeNull();
    expect(issues[0]?.detail).toBe('Cursor is wrong.\n\nIndentation.');
  });

  it('ignores findings boxes that hold only whitespace', () => {
    const issues = issuesFromReview(
      review({
        findings: {
          incorrectCode: '   ',
          incompleteImplementation: '',
          sourceFormatting: '',
        },
      }),
    );
    expect(issues).toEqual([]);
  });
});

describe('isResponseComplete', () => {
  const base = { screenshotId: 's1' } as const;

  it('accepts a resolution with no reason', () => {
    expect(isResponseComplete({ ...base, kind: 'Resolved' })).toBe(true);
  });

  it('REJECTS a rejection with no reason (FL 2.11.2.3-01)', () => {
    expect(isResponseComplete({ ...base, kind: 'Rejected' })).toBe(false);
    expect(isResponseComplete({ ...base, kind: 'Rejected', rejectionReason: '' })).toBe(false);
    expect(isResponseComplete({ ...base, kind: 'Rejected', rejectionReason: '   ' })).toBe(false);
  });

  it('accepts a rejection that explains itself', () => {
    expect(
      isResponseComplete({
        ...base,
        kind: 'Rejected',
        rejectionReason: 'This is by design.',
      }),
    ).toBe(true);
  });
});

describe('resubmitReadiness', () => {
  const issues = issuesFromReview(
    review({
      screenshots: [shot('s1', 'a'), shot('s2', 'b')],
      findings: {
        incorrectCode: 'Something',
        incompleteImplementation: '',
        sourceFormatting: '',
      },
    }),
  );

  function responses(...items: IssueResponseDraft[]) {
    return items;
  }

  it('counts unanswered findings', () => {
    const readiness = resubmitReadiness(
      issues,
      responses({ screenshotId: 's1', kind: 'Resolved' }),
    );

    expect(issues).toHaveLength(3);
    expect(readiness.unanswered).toBe(2);
    expect(readiness.canResubmit).toBe(false);
  });

  it('counts an unjustified rejection separately from an unanswered one', () => {
    // Different mistakes deserve different prompts.
    const readiness = resubmitReadiness(
      issues,
      responses(
        { screenshotId: 's1', kind: 'Rejected' },
        { screenshotId: 's2', kind: 'Resolved' },
        { screenshotId: null, kind: 'Resolved' },
      ),
    );

    expect(readiness.unanswered).toBe(0);
    expect(readiness.unjustified).toBe(1);
    expect(readiness.canResubmit).toBe(false);
  });

  it('allows resubmission once every finding is answered and every rejection explained', () => {
    const readiness = resubmitReadiness(
      issues,
      responses(
        {
          screenshotId: 's1',
          kind: 'Rejected',
          rejectionReason: 'Already handled upstream.',
        },
        { screenshotId: 's2', kind: 'Resolved' },
        { screenshotId: null, kind: 'Resolved' },
      ),
    );

    expect(readiness.canResubmit).toBe(true);
  });

  it('refuses to call an empty issue list ready', () => {
    // A ChangesRequested task always has at least one finding — the rank gate
    // guarantees it. Treating "nothing to answer" as ready would let a developer
    // resubmit without engaging with the feedback at all.
    expect(resubmitReadiness([], []).canResubmit).toBe(false);
  });
});
