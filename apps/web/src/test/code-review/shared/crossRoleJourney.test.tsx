import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { db, reviewsForTask } from '@/mocks/db.ts';
import { settleRequests } from '@/test/settleRequests.ts';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';
import common from '@/content/common.json';
import { countText, renderApp, USERS } from '../fixtures/renderApp.tsx';
import { DRAFT_OWNER, hydrateCompleteDraft } from '../fixtures/taskDraft.ts';

beforeEach(() => {
  useTaskDraft.getState().reset();
});

afterEach(settleRequests);

describe('developer → reviewer → developer/admin journey', () => {
  it('keeps status, cycle and counts consistent across all three workspaces', async () => {
    // Developer submits.
    const task = hydrateCompleteDraft();
    const dev = renderApp('/crp/developer/tasks/new/review', DRAFT_OWNER);
    await dev.user.click(await screen.findByRole('button', { name: /submit for review/i }));
    await waitFor(() => {
      expect(db.tasks.find((t) => t.id === task.id)?.status).toBe('Submitted');
    });
    dev.unmount();

    // Reviewer (not the author) picks it from the queue and requests changes.
    expect(USERS.reviewer).not.toBe(DRAFT_OWNER);
    const rev = renderApp(`/crp/reviewer?search=${task.taskCode}`, USERS.reviewer);
    await rev.user.click(
      await screen.findByRole('button', { name: `Pick ${task.taskCode} for review` }),
    );
    await screen.findByRole('heading', { name: /reviewer assessment/i });
    expect(db.tasks.find((t) => t.id === task.id)).toMatchObject({
      status: 'InReview',
      reviewerId: USERS.reviewer,
    });

    await rev.user.click(screen.getByRole('radio', { name: /rank 2/i }));
    await rev.user.click(screen.getByRole('button', { name: /add comment/i }));
    await rev.user.type(
      screen.getByPlaceholderText(/describe the actionable issue/i),
      'Null customer id is not handled.',
    );
    await rev.user.click(screen.getByRole('button', { name: /request changes/i }));
    const dialog = await screen.findByRole('dialog');
    await rev.user.click(within(dialog).getByRole('button', { name: /request changes/i }));
    expect(await within(dialog).findByText('Changes Requested')).toBeInTheDocument();
    await settleRequests();

    const decided = db.tasks.find((t) => t.id === task.id)!;
    expect(decided.status).toBe('ChangesRequested');
    expect(reviewsForTask(task.id).filter((r) => r.decision === 'ChangesRequested')).toHaveLength(
      1,
    );

    // Developer sees the outcome on the task.
    const back = renderApp(`/crp/developer/tasks/${task.id}`, DRAFT_OWNER);
    expect((await screen.findAllByText(common.status.ChangesRequested)).length).toBeGreaterThan(0);
    back.unmount();

    // Admin's Changes Requested counter agrees with the data.
    renderApp('/crp/admin', USERS.adminOnly);
    const card = await screen.findByRole('button', { name: /show only changes requested/i });
    const expected = db.tasks.filter((t) => t.status === 'ChangesRequested').length;
    expect(card).toHaveTextContent(countText(expected));
  });
});
