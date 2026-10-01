import { describe, expect, it } from 'vitest';
import {
  createCycleResponseId,
  nextHistoricalReviewCycle,
  resolveActiveReviewCycle,
} from './reviewCycles.ts';

describe('nextHistoricalReviewCycle', () => {
  it('moves past both the highest stored review and the task counter', () => {
    expect(nextHistoricalReviewCycle({ reviewCycle: 1 }, [])).toBe(2);
    expect(nextHistoricalReviewCycle({ reviewCycle: 1 }, [{ reviewCycle: 3 }])).toBe(4);
    expect(nextHistoricalReviewCycle({ reviewCycle: 2, historicalCycle: 5 }, [])).toBe(6);
  });

  it('never collides after the counted cycle was decremented', () => {
    // Counted cycle went 3 -> 2, but cycle 3 already exists historically.
    expect(nextHistoricalReviewCycle({ reviewCycle: 2 }, [{ reviewCycle: 3 }])).toBe(4);
  });
});

describe('resolveActiveReviewCycle', () => {
  const decided = (reviewCycle: number) => ({ reviewCycle, decision: 'ChangesRequested' });

  it('sits above every completed cycle while the task is in rework or re-review', () => {
    for (const status of ['ChangesRequested', 'ReSubmitted', 'InReview']) {
      expect(resolveActiveReviewCycle({ reviewCycle: 1, status }, [decided(1)])).toBe(2);
    }
  });

  it('keeps an open draft cycle when it is already ahead', () => {
    const reviews = [decided(1), { reviewCycle: 3, decision: null }];
    expect(resolveActiveReviewCycle({ reviewCycle: 1, status: 'InReview' }, reviews)).toBe(3);
  });

  it('uses the current cycle when nothing has been decided yet or the task is closed', () => {
    expect(resolveActiveReviewCycle({ reviewCycle: 1, status: 'InReview' })).toBe(1);
    expect(resolveActiveReviewCycle({ reviewCycle: 2, status: 'Approved' }, [decided(2)])).toBe(2);
    expect(
      resolveActiveReviewCycle({ reviewCycle: 1, historicalCycle: 4, status: 'Submitted' }, []),
    ).toBe(4);
  });
});

describe('createCycleResponseId', () => {
  it('scopes a response id to its task and cycle', () => {
    expect(createCycleResponseId('t-1', 2, 'abc')).toBe('resp-t-1-2-c-abc');
    expect(createCycleResponseId('t-1', 3, 'abc')).not.toBe(createCycleResponseId('t-1', 2, 'abc'));
  });

  it('keeps an entity key that is already prefixed', () => {
    expect(createCycleResponseId('t-1', 1, 'c-9')).toBe('resp-t-1-1-c-9');
    expect(createCycleResponseId('t-1', 1, 's-shot')).toBe('resp-t-1-1-s-shot');
  });
});
