import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { db } from '@/mocks/db.ts';
import { useTaskDraft } from '@/portals/code-review/features/tasks/hooks/useTaskDraft.ts';
import tasks from '@/content/tasks.json';
import { renderApp } from '../fixtures/renderApp.tsx';
import { DRAFT_OWNER, hydrateCompleteDraft } from '../fixtures/taskDraft.ts';

beforeEach(() => {
  useTaskDraft.getState().reset();
});

/** Submits from the review step and waits for the confirmation screen itself (a lazy route). */
async function submitFromReviewStep() {
  const utils = renderApp('/crp/developer/tasks/new/review', DRAFT_OWNER);
  await utils.user.click(await screen.findByRole('button', { name: /submit for review/i }));
  expect(
    await screen.findByRole('heading', { name: tasks.wizard.confirmed.title, level: 1 }),
  ).toBeInTheDocument();
  expect(utils.router.state.location.pathname).toBe('/crp/developer/tasks/new/confirmed');
  return utils;
}

describe('submitting a task from the wizard', () => {
  it('submits, confirms, and leaves no stale draft pointing at the submitted task', async () => {
    const task = hydrateCompleteDraft();
    await submitFromReviewStep();

    expect(screen.getByText(task.taskCode, { exact: false })).toBeInTheDocument();
    expect(db.tasks.find((t) => t.id === task.id)?.status).toBe('Submitted');
    await waitFor(() => {
      expect(useTaskDraft.getState().taskId).toBeNull();
    });
    expect(useTaskDraft.getState().answers).toEqual([]);
  });

  it('opens an empty wizard when a step URL is visited after submitting', async () => {
    hydrateCompleteDraft();
    const { unmount } = await submitFromReviewStep();
    unmount();

    renderApp('/crp/developer/tasks/new/details', DRAFT_OWNER);
    expect(await screen.findByRole('combobox', { name: /customer/i })).toBeInTheDocument();
    expect(useTaskDraft.getState().taskId).toBeNull();
    expect(useTaskDraft.getState().crimId).toBe('');
  });
});
