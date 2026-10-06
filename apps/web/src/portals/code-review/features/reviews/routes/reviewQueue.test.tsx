import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { Toaster } from 'sonner';
import { signInForTest } from '@/test/setup.ts';
import { server } from '@/test/mswServer.ts';
import { routes } from '@/app/routes.tsx';
import { db } from '@/mocks/db.ts';

/**
 * The reviewer queues, driven through the real route table.
 *
 * The self-review bar and the concurrent-pick race are the two rules here that
 * have real consequences, and neither is visible from a component test — both
 * are enforced by the handler, so both are exercised through it.
 */

/** A user who holds Reviewer and has submitted tasks of their own. */
const REVIEWER = 'u-hiruni';

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {/*
          `Toaster` lives in `App`, which these router-level tests do not mount.
          Rendering it here keeps the harness faithful: a rule the user only
          learns about through a toast is not verified unless the toast renders.
        */}
        <Toaster />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

function bodyRows() {
  const table = screen.getByRole('table');
  const body = within(table).getAllByRole('rowgroup')[1];
  if (!body) throw new Error('table has no body');
  return within(body).getAllByRole('row');
}

/**
 * Waits for the grid to hold real rows.
 *
 * `findByRole('table')` on its own is NOT that signal: `DataTable` renders its
 * skeleton as `<tr>`s inside the real `<table>`, so the header and the column
 * widths are already settled when the data lands. The table therefore exists
 * from the first frame, and a test that waits only for it reads placeholder rows
 * and counts eight of them.
 *
 * The loading pass marks the grid `role="status"`, so its disappearance is the
 * honest readiness signal.
 */
async function findLoadedTable() {
  await screen.findByRole('table');
  await waitFor(() => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
}

beforeEach(() => {
  signInForTest(REVIEWER);
});

describe('Available Tasks', () => {
  it('shows stored titles without a duplicate version tag or column', async () => {
    renderApp('/crp/reviewer');
    await findLoadedTable();

    expect(screen.queryByRole('columnheader', { name: /^version$/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('version-tag')).not.toBeInTheDocument();
  });

  it('never lists a task the signed-in reviewer submitted', async () => {
    renderApp('/crp/reviewer');
    await findLoadedTable();

    // The seed has this reviewer submitting several tasks. The handler filters
    // them out; this asserts none reached the client at all, which is the point
    // — hiding them in the UI would still have shipped them over the wire.
    const ownSubmissions = db.tasks
      .filter((task) => task.developerId === REVIEWER)
      .map((task) => task.taskCode);
    expect(ownSubmissions.length).toBeGreaterThan(0);

    const rendered = bodyRows().map((row) => row.textContent ?? '');
    for (const taskCode of ownSubmissions) {
      expect(rendered.some((text) => text.includes(taskCode))).toBe(false);
    }
  });

  it('only offers tasks that are waiting and unclaimed', async () => {
    renderApp('/crp/reviewer');
    await findLoadedTable();

    const expected = db.tasks.filter(
      (task) =>
        task.reviewerId === null &&
        task.developerId !== REVIEWER &&
        !task.isHandedOver &&
        (task.status === 'Submitted' || task.status === 'ReSubmitted'),
    );

    expect(bodyRows()).toHaveLength(expected.length);
  });

  it('picks a task, moves it to In Review and opens it', async () => {
    const { router, user } = renderApp('/crp/reviewer');
    await findLoadedTable();

    const before = bodyRows().length;
    await user.click(screen.getAllByRole('button', { name: /pick .* for review/i })[0]!);

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/crp\/reviewer\/tasks\//);
    });

    const picked = db.tasks.find(
      (task) => task.reviewerId === REVIEWER && task.status === 'InReview',
    );
    expect(picked).toBeDefined();
    expect(before).toBeGreaterThan(0);
  });

  it('reports the lost race rather than failing silently (FL 3.3-02)', async () => {
    // The server says someone else got there first. The reviewer must be told
    // who, not shown a generic error and left wondering.
    server.use(
      http.post('/api/tasks/:taskId/pick', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'ALREADY_PICKED',
            message: 'Pinsara Chandika has already picked up this task.',
          },
          { status: 409 },
        ),
      ),
    );

    const { router, user } = renderApp('/crp/reviewer');
    await findLoadedTable();

    await user.click(screen.getAllByRole('button', { name: /pick .* for review/i })[0]!);

    expect(await screen.findByText(/pinsara chandika has already picked up/i)).toBeInTheDocument();
    // And it does NOT navigate to a review the reviewer does not own.
    expect(router.state.location.pathname).toBe('/crp/reviewer');
  });
});

describe('My Review Tasks', () => {
  it('lists only what this reviewer is currently holding', async () => {
    // The seed already assigns this reviewer one in-review task; add a second so
    // the assertion is about the filter, not about a single row.
    const seeded = db.tasks.filter(
      (task) => task.reviewerId === REVIEWER && task.status === 'InReview',
    ).length;

    const task = db.tasks.find(
      (candidate) => candidate.developerId !== REVIEWER && candidate.status === 'Submitted',
    );
    if (!task) throw new Error('seed has no pickable task');
    task.reviewerId = REVIEWER;
    task.status = 'InReview';

    renderApp('/crp/reviewer/my-tasks');
    await findLoadedTable();

    expect(bodyRows()).toHaveLength(seeded + 1);
    expect(screen.getByRole('table')).toHaveTextContent(task.taskCode);
  });
});

describe('Review History', () => {
  /**
   * The scope is keyed on the REVIEW's reviewer, not the task's.
   *
   * This is the regression that mattered. Requesting changes clears
   * `task.reviewerId` — deliberately, so the resubmission returns to the open
   * queue — and history used to filter on exactly that field. The consequence
   * was that every review which found a problem disappeared from the reviewer's
   * own History tab the moment they submitted it, and the workspace's "Changes
   * Requested" counter, computed from that list, decayed towards zero in normal
   * use. A reviewer's record of their own work vanished as they did it.
   */
  it('keeps a task the reviewer sent back, whose reviewerId was cleared', async () => {
    const task = db.tasks.find(
      (candidate) => candidate.developerId !== REVIEWER && candidate.status === 'Submitted',
    );
    if (!task) throw new Error('seed has no pickable task');

    // The exact shape a completed Request Changes leaves behind: a decided
    // review naming this reviewer, and a task that no longer remembers them.
    db.reviews.push({
      id: `rev-${task.id}-history-probe`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Reviewer',
      comments: [],
      generalCheck: [],
      findings: { incorrectCode: 'x', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: '2026-07-02T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
    task.status = 'ChangesRequested';
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.reviewerId = null;

    renderApp('/crp/reviewer/history');
    await findLoadedTable();

    expect(screen.getByRole('table')).toHaveTextContent(task.taskCode);
  });

  it('does not repeat a task that has come back round and is in review again', async () => {
    // Its earlier cycle is decided by this reviewer, so it qualifies for
    // history — but it is also sitting in My Review Tasks right now, and one
    // task in two queues double-counts the workload.
    const task = db.tasks.find(
      (candidate) => candidate.developerId !== REVIEWER && candidate.status === 'Submitted',
    );
    if (!task) throw new Error('seed has no pickable task');

    db.reviews.push({
      id: `rev-${task.id}-reopened-probe`,
      taskId: task.id,
      reviewRound: 1,
      reviewerId: REVIEWER,
      reviewerName: 'Reviewer',
      comments: [],
      generalCheck: [],
      findings: { incorrectCode: 'x', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: '',
      feedbackSummary: '',
      rank: 2,
      screenshots: [],
      decision: 'ChangesRequested',
      decidedAt: '2026-07-02T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
    task.status = 'InReview';
    task.reviewRound = 2;
    task.countedCycle = 2;
    task.reviewerId = REVIEWER;

    renderApp('/crp/reviewer/history');
    await findLoadedTable();

    expect(screen.getByRole('table')).not.toHaveTextContent(task.taskCode);
  });
});
