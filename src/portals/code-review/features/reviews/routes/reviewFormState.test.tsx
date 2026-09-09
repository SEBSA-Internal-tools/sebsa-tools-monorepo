import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@/test/setup.ts';
import { routes } from '@/app/routes.tsx';
import { db, findReview } from '@/mocks/db.ts';

/**
 * Regression: the review form must not lose what the reviewer typed.
 *
 * The form seeds itself in `useState` and is remounted by a `key` when it should
 * genuinely reset — the documented alternative to copying props into state from
 * an effect. Keying it on the REVIEW ID looked natural and was wrong: the review
 * row is created lazily on the first write, so attaching the first screenshot
 * made the id appear, changed the key, remounted the form, and silently threw
 * away the General Check answers, findings and rank underneath it.
 *
 * The acceptance suite caught it only because a scenario finally uploaded a
 * screenshot AND typed something in the same run. This test names the bug so it
 * cannot come back quietly, and it is the negative control for the fix: it fails
 * if the key ever goes back to being the review id.
 */

/** Pinsara is the assigned reviewer on BLOM-010, which is In Review. */
const REVIEWER = 'u-pinsara';
const IN_REVIEW_TASK = 't-blom-010';

/** A real 1×1 PNG, so the size and type checks see an actual image. */
function pngFile(name: string) {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: 'image/png' });
}

function renderReviewForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [`/crp/reviewer/tasks/${IN_REVIEW_TASK}`],
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, user: userEvent.setup({ delay: null }) };
}

function fileInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('No screenshot input on the review form');
  return input;
}

beforeEach(() => {
  signInForTest(REVIEWER);
});

describe('review form state', () => {
  it('keeps typed findings and the chosen rank when the first screenshot is attached', async () => {
    const { user } = renderReviewForm();

    const findings = await screen.findByLabelText(/incorrect code and performance/i);
    await user.type(findings, 'The cancellation path is missing.');
    await user.click(screen.getByRole('radio', { name: /rank 2/i }));

    // Before the upload there is no review row at all — this is the transition
    // that used to remount the form.
    await user.upload(fileInput(), pngFile('defect.png'));
    expect(await screen.findByText('defect.png')).toBeInTheDocument();

    // Everything typed BEFORE the upload survives it.
    expect(screen.getByLabelText(/incorrect code and performance/i)).toHaveValue(
      'The cancellation path is missing.',
    );
    expect(screen.getByRole('radio', { name: /rank 2/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets a Rank 2 review reach Request Changes once findings and a screenshot exist', async () => {
    const { user } = renderReviewForm();

    // Answer the 13 General Check questions (spec §3.1) so only the rank rules
    // are left standing between the reviewer and a decision.
    /*
     * Waiting on the COUNT, not on "any radiogroup".
     *
     * `findAllByRole('radiogroup')` resolves the instant the first one exists,
     * and that is the rank picker — it renders from the task itself, while the
     * General Check rows wait on the checklist-template query. Filtering that
     * early snapshot found the rank picker alone and yielded nothing, which
     * failed about one run in three.
     *
     * The General Check groups are the ones offering "Partially OK"; the rank
     * picker is a radiogroup too and must not be answered here.
     */
    const generalCheckGroups = () =>
      screen
        .getAllByRole('radiogroup')
        .filter((group) => within(group).queryByRole('radio', { name: 'Partially OK' }) !== null);

    await waitFor(() => {
      expect(generalCheckGroups()).toHaveLength(13);
    });
    const generalCheck = generalCheckGroups();
    for (const group of generalCheck) {
      // `^OK$` rather than "OK": a substring match would also hit "Partially OK".
      await user.click(within(group).getByRole('radio', { name: /^OK$/ }));
    }

    await user.type(
      screen.getByLabelText(/incorrect code and performance/i),
      'Rollback branch is wrong.',
    );
    await user.type(screen.getByLabelText(/summary comments/i), 'One issue to fix.');
    await user.click(screen.getByRole('radio', { name: /rank 2/i }));

    const requestChanges = screen.getByRole('button', {
      name: /request changes/i,
    });
    // FL 2.9.2.6-01: a defect rank needs evidence before either decision.
    expect(requestChanges).toBeDisabled();

    await user.upload(fileInput(), pngFile('defect.png'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /request changes/i })).toBeEnabled();
    });
    // Approve stays shut — the rank gate is not satisfied by evidence.
    expect(screen.getByRole('button', { name: /approve task/i })).toBeDisabled();
  });

  /**
   * Auto-save (spec p.10).
   *
   * Until `PUT /tasks/:id/review` existed there was no endpoint that could hold
   * work in progress: the draft lived only in `ReviewFormSection`'s `useState`
   * and the only write was the decision. A reviewer who answered ten of the
   * thirteen General Check questions and then opened the task list lost all ten,
   * with nothing on screen to suggest that would happen.
   */
  it('persists work in progress without deciding the review', async () => {
    const { user } = renderReviewForm();

    const findings = await screen.findByLabelText(/incorrect code and performance/i);
    await user.type(findings, 'Retry loop never terminates.');
    await user.click(screen.getByRole('radio', { name: /rank 3/i }));

    // Debounced, so this waits rather than asserting immediately — the point is
    // that it lands on its own, with no Save button and no decision.
    await waitFor(
      () => {
        const stored = findReview(IN_REVIEW_TASK, 1);
        expect(stored?.findings.incorrectCode).toBe('Retry loop never terminates.');
        expect(stored?.rank).toBe(3);
      },
      { timeout: 5000 },
    );

    /*
     * Still undecided, which is what keeps a saved draft out of every metric:
     * `decidedReviews` filters on exactly this field, so a draft that arrived
     * with a decision would be counted as a completed review the moment a
     * reviewer started typing.
     */
    const stored = findReview(IN_REVIEW_TASK, 1);
    expect(stored?.decision).toBeNull();
    expect(stored?.decidedAt).toBeNull();

    // And the task has not moved: saving is not deciding.
    expect(db.tasks.find((task) => task.id === IN_REVIEW_TASK)?.status).toBe('InReview');
  });
});
