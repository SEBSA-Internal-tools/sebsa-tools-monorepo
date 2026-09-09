import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { signInForTest } from '@/test/setup.ts';
import { routes } from '@/app/routes.tsx';
import { db } from '@/mocks/db.ts';

/**
 * FL 2.11.2.3-01, end to end through the real route table.
 *
 * The rule that matters: a developer may disagree with a reviewer, but not
 * silently. Rejecting a finding without a written reason must not resubmit the
 * task, and the SERVER must refuse it even if the button somehow allowed it.
 */

const DEVELOPER = 'u-hiruni';
const REVIEWER = 'u-pinsara';

/**
 * "Submit for Review", and NOT "Resubmit for Review".
 *
 * An unanchored `/submit for review/i` is a substring match, and "Resubmit for
 * Review" contains it — so the obvious query finds the panel's button and every
 * assertion about the header control silently measures the wrong element.
 */
const HEADER_SUBMIT = /^submit for review$/i;

/** The task the seeder reshapes, so the tests here share one starting point. */
function developerTask() {
  const task = db.tasks.find(
    (candidate) => candidate.developerId === DEVELOPER && candidate.isChecklistComplete,
  );
  if (!task) throw new Error('seed has no complete task for this developer');
  return task;
}

/** Puts a task into ChangesRequested with one screenshot finding to answer. */
function seedFeedback() {
  const task = developerTask();

  task.status = 'ChangesRequested';
  task.reviewerId = null;
  task.reviewCycle = 2;

  db.reviews.push({
    id: `rev-${task.id}-1`,
    taskId: task.id,
    reviewCycle: 1,
    reviewerId: REVIEWER,
    reviewerName: 'Pinsara Chandika',
    generalCheck: [],
    findings: {
      incorrectCode: 'The cursor selects against a table instead of a view.',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: 'Two things to fix before this can go.',
    rank: 2,
    screenshots: [
      {
        id: 'shot-1',
        fileName: 'cursor.png',
        sizeBytes: 2048,
        mimeType: 'image/png',
        storageRef: 'data:,',
        comment: 'This query is the problem.',
        uploadedAt: '2026-01-02T00:00:00.000Z',
      },
    ],
    decision: 'ChangesRequested',
    decidedAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

  return task;
}

function renderTask(taskId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [`/crp/developer/tasks/${taskId}`],
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

beforeEach(() => {
  signInForTest(DEVELOPER);
});

describe('responding to review feedback', () => {
  it('shows every finding the reviewer raised', async () => {
    const task = seedFeedback();
    renderTask(task.id);

    // 'Review Feedback' and 'Review Feedback History' both match a loose regex.
    expect(await screen.findByText('Review Feedback')).toBeInTheDocument();
    // One issue per screenshot, plus one for the written findings.
    expect(await screen.findByText(/this query is the problem/i)).toBeInTheDocument();
    expect(screen.getByText(/cursor selects against a table/i)).toBeInTheDocument();
    // The summary appears twice by design: once in the panel being answered, and
    // again in the cycle history below it.
    expect(screen.getAllByText(/two things to fix/i).length).toBeGreaterThan(0);
  });

  it('blocks resubmission until every finding is answered', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    const resubmit = await screen.findByRole('button', {
      name: /resubmit for review/i,
    });
    expect(resubmit).toBeDisabled();
    expect(screen.getByText(/2 findings still need a response/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[0]!);
    await waitFor(() => {
      expect(screen.getByText(/1 finding still needs a response/i)).toBeInTheDocument();
    });
  });

  it('will not record a rejection without a reason (FL 2.11.2.3-01)', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    // Nothing was saved, and the developer is told why.
    expect(
      await screen.findByText(/provide a reason when rejecting a review finding/i),
    ).toBeInTheDocument();
    expect(db.issueResponses).toHaveLength(0);
  });

  it('records a justified rejection and then allows resubmission', async () => {
    const task = seedFeedback();
    const { user } = renderTask(task.id);

    await screen.findByRole('button', { name: /resubmit for review/i });

    // Reject the screenshot finding, with a reason.
    await user.click(screen.getAllByRole('button', { name: /^reject$/i })[0]!);
    await user.type(
      screen.getByLabelText(/why are you rejecting/i),
      'The view is generated at deploy time.',
    );
    await user.click(screen.getByRole('button', { name: /save rejection/i }));

    // Resolve the written findings.
    await waitFor(() => {
      expect(db.issueResponses).toHaveLength(1);
    });
    await user.click(screen.getAllByRole('button', { name: /^resolve$/i })[1]!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resubmit for review/i })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: /resubmit for review/i }));

    await waitFor(() => {
      expect(db.tasks.find((t) => t.id === task.id)?.status).toBe('ReSubmitted');
    });

    const stored = db.issueResponses.find((r) => r.screenshotId === 'shot-1');
    expect(stored?.kind).toBe('Rejected');
    expect(stored?.rejectionReason).toBe('The view is generated at deploy time.');
    // The reviewer rules on the rejection next cycle (FL 2.11.2.3-02).
    expect(stored?.verdict).toBe('Pending');
  });

  /**
   * One control, one rule.
   *
   * `canSubmitForReview` is true on BOTH submit edges — Draft → Submitted and
   * ChangesRequested → ReSubmitted — so a header Submit gated only on checklist
   * completeness let a developer resubmit a returned task without answering a
   * single finding. The server refused with 422 `RESPONSES_INCOMPLETE` (the test
   * below), so nothing was corrupted, but the developer was handed an error they
   * had no way to anticipate while a correctly-disabled Resubmit sat further
   * down the same page.
   *
   * Spec 2.11.2.2 makes "all feedback items addressed" the activation condition,
   * and `ReviewFeedbackPanel` already enforces exactly that. The header control
   * steps aside once a task has been returned.
   */
  it('offers no header Submit on a returned task, only the gated Resubmit', async () => {
    const task = seedFeedback();
    renderTask(task.id);

    // The panel's own control is present and blocked — so the page is fully
    // rendered and the absence below is a real absence, not a slow mount.
    expect(await screen.findByRole('button', { name: /resubmit for review/i })).toBeDisabled();

    expect(screen.queryByRole('button', { name: HEADER_SUBMIT })).not.toBeInTheDocument();
  });

  /**
   * The negative control for the test above.
   *
   * Without it, `queryByRole('button', { name: /submit for review/i })` returning
   * null proves nothing — a renamed label or a page that failed to render would
   * satisfy it just as well. A Draft task must still offer the header Submit.
   */
  it('still offers the header Submit on a draft', async () => {
    // The same row the seeder above reshapes, left as a Draft instead. Same task,
    // same checklist, one field different — so the only thing the two tests can
    // disagree about is the status.
    const draft = developerTask();
    draft.status = 'Draft';
    draft.reviewerId = null;

    renderTask(draft.id);

    expect(await screen.findByRole('button', { name: HEADER_SUBMIT })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /resubmit for review/i })).not.toBeInTheDocument();
  });

  it('refuses a resubmission server-side even when the client asks for one', async () => {
    // The button is a courtesy; this is the control. Nothing has been answered.
    const task = seedFeedback();
    signInForTest(DEVELOPER);

    const response = await fetch(`/api/tasks/${task.id}/submit`, {
      method: 'POST',
      headers: { 'X-Mock-User-Id': DEVELOPER, Accept: 'application/json' },
    });

    expect(response.status).toBe(422);
    expect(db.tasks.find((t) => t.id === task.id)?.status).toBe('ChangesRequested');
  });
});
