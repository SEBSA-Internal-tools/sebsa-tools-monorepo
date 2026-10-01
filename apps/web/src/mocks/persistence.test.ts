import { describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './db.ts';
import { MOCK_DATABASE_KEY, persistDatabase, restoreDatabase } from './persistence.ts';

describe('browser mock database persistence', () => {
  it('restores task, cycle, responses and activity together after a reload', () => {
    const task = db.tasks.find((t) => t.id === 't-qa-adj-followup-developer')!;
    task.status = 'ReSubmitted';
    db.issueResponses.push({
      ...db.issueResponses.find((r) => r.taskId === task.id)!,
      id: 'persisted-cycle-2',
      reviewCycle: 2,
      kind: 'Rejected',
      rejectionReason: 'Test',
      verdict: 'Pending',
      reviewerComment: null,
      adjudicatedAt: null,
    });
    db.reviews.push({
      ...db.reviews.find((r) => r.taskId === task.id)!,
      id: 'persisted-review-2',
      reviewCycle: 2,
      decision: null,
      decidedAt: null,
      reviewerId: null,
      reviewerName: null,
      comments: [],
      rank: null,
    });
    const expected = structuredClone(db);
    persistDatabase(localStorage);
    resetDb();
    restoreDatabase(localStorage);
    expect(db).toEqual(expected);
  });

  it('rejects an incompatible snapshot without partially replacing the database', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const expected = structuredClone(db);
    localStorage.setItem(MOCK_DATABASE_KEY, JSON.stringify({ tasks: [] }));
    restoreDatabase(localStorage);
    expect(db).toEqual(expected);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
