import { describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './db.ts';
import { MOCK_DATABASE_KEY, persistDatabase, restoreDatabase } from './persistence.ts';

describe('browser mock database persistence', () => {
  it('restores task, round, responses and activity together after a reload', () => {
    const task = db.tasks.find((t) => t.id === 't-qa-adj-followup-developer')!;
    task.status = 'ReSubmitted';
    db.issueResponses.push({
      ...db.issueResponses.find((r) => r.taskId === task.id)!,
      id: 'persisted-cycle-2',
      reviewRound: 2,
      kind: 'Rejected',
      rejectionReason: 'Test',
      verdict: 'Pending',
      reviewerComment: null,
      adjudicatedAt: null,
    });
    db.reviews.push({
      ...db.reviews.find((r) => r.taskId === task.id)!,
      id: 'persisted-review-2',
      reviewRound: 2,
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

  it('hydrates legacy snapshots with reviewCycle into reviewRound and countedCycle', () => {
    resetDb();
    const legacyDatabase = structuredClone(db);
    (legacyDatabase.tasks[0] as unknown as Record<string, unknown>)['reviewCycle'] = 2;
    (legacyDatabase.tasks[0] as unknown as Record<string, unknown>)['historicalCycle'] = 3;
    delete (legacyDatabase.tasks[0] as unknown as Record<string, unknown>)['reviewRound'];
    delete (legacyDatabase.tasks[0] as unknown as Record<string, unknown>)['countedCycle'];

    (legacyDatabase.reviews[0] as unknown as Record<string, unknown>)['reviewCycle'] = 2;
    delete (legacyDatabase.reviews[0] as unknown as Record<string, unknown>)['reviewRound'];
    if (legacyDatabase.reviews[0]?.comments[0]) {
      (legacyDatabase.reviews[0].comments[0] as unknown as Record<string, unknown>)['reviewCycle'] = 2;
      delete (legacyDatabase.reviews[0].comments[0] as unknown as Record<string, unknown>)['reviewRound'];
    }

    if (legacyDatabase.issueResponses[0]) {
      (legacyDatabase.issueResponses[0] as unknown as Record<string, unknown>)['reviewCycle'] = 2;
      delete (legacyDatabase.issueResponses[0] as unknown as Record<string, unknown>)['reviewRound'];
    }

    if (legacyDatabase.events[0]) {
      (legacyDatabase.events[0] as unknown as Record<string, unknown>)['reviewCycle'] = 2;
      delete (legacyDatabase.events[0] as unknown as Record<string, unknown>)['reviewRound'];
    }

    localStorage.setItem(MOCK_DATABASE_KEY, JSON.stringify(legacyDatabase));
    restoreDatabase(localStorage);

    const task = db.tasks[0];
    expect(task).toBeDefined();
    expect(task?.reviewRound).toBe(3); // from historicalCycle fallback
    expect(task?.countedCycle).toBe(2);

    const review = db.reviews[0];
    expect(review?.reviewRound).toBe(2);
    if (review?.comments[0]) {
      expect(review.comments[0].reviewRound).toBe(2);
    }

    const resp = db.issueResponses[0];
    if (resp) {
      expect(resp.reviewRound).toBe(2);
    }

    const ev = db.events[0];
    if (ev) {
      expect(ev.reviewRound).toBe(2);
    }
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
