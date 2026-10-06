import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { db } from '@/mocks/db.ts';
import { server } from '@/test/mswServer.ts';
import { settleRequests } from '@/test/settleRequests.ts';
import { renderApp, USERS } from '../fixtures/renderApp.tsx';

const TASK = 't-blom-010';

function draftSavedEvents(): number {
  return db.events.filter((e) => e.taskId === TASK && e.kind === 'ReviewDraftSaved').length;
}

async function openReview() {
  const utils = renderApp(`/crp/reviewer/tasks/${TASK}`, USERS.reviewer);
  await screen.findByRole('heading', { name: /reviewer assessment/i });
  expect(await screen.findByText('Saved')).toBeInTheDocument();
  return utils;
}

beforeEach(() => {
  const task = db.tasks.find((t) => t.id === TASK)!;
  Object.assign(task, {
    status: 'InReview',
    reviewerId: USERS.reviewer,
    reviewCycle: 1,
    historicalCycle: 1,
    adjustedCycles: [],
  });
  db.reviews = db.reviews.filter((r) => r.taskId !== TASK);
});

afterEach(settleRequests);

describe('reviewer draft autosave', () => {
  it('moves Saved → Unsaved → Saved on an edit, without writing task history', async () => {
    const { user } = await openReview();
    const before = draftSavedEvents();

    await user.click(screen.getByRole('radio', { name: /rank 1/i }));
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument();

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank).toBe(1);
    expect(draftSavedEvents()).toBe(before);
  });

  it('records exactly one history event for an explicit Save as Draft', async () => {
    const { user } = await openReview();
    const before = draftSavedEvents();

    await user.click(screen.getByRole('radio', { name: /rank 2/i }));
    await user.click(screen.getByRole('button', { name: /save as draft/i }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(draftSavedEvents()).toBe(before + 1);
    expect(db.tasks.find((t) => t.id === TASK)?.status).toBe('InReview');
  });

  it('reports a failed save and recovers on a manual retry', async () => {
    server.use(
      http.put('/api/tasks/:taskId/review', () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL', message: 'Save failed upstream' },
          { status: 500 },
        ),
      ),
    );
    const { user } = await openReview();

    await user.click(screen.getByRole('radio', { name: /rank 1/i }));
    expect(await screen.findByText('Save failed')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank ?? null).not.toBe(
      1,
    );

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: /save as draft/i }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(db.reviews.find((r) => r.taskId === TASK && r.decision === null)?.rank).toBe(1);
  });
});
