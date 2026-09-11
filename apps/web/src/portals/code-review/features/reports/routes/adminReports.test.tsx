import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@/test/setup.ts';
import { routes } from '@/app/routes.tsx';
import { db } from '@/mocks/db.ts';
import { APPROVAL_RATE_TARGET } from '@/lib/analyticsTargets.ts';

/**
 * Admin Reports, rendered — which nothing tested before this file.
 *
 * `reportMetrics.test.ts` proves the arithmetic against the business's own
 * figures and is the better test of the maths. It cannot see any of what is
 * asserted here: that the number a function returns is the number the card
 * shows, that the card and the chart drawn from the same rows agree, and that a
 * filter moves both together. A page can wire `summary.cancelled` into the
 * Delivered card and pass every domain test ever written.
 *
 * Expected values are counted off the seed IN THIS FILE rather than by calling
 * the functions under test. Restating the implementation would make this a
 * tautology; an oracle is only worth having if it is derived independently.
 */

const ADMIN = 'u-charith';

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(routes, {
    initialEntries: ['/crp/admin/reports'],
  });

  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

const countOf = (status: string, tasks = db.tasks) =>
  tasks.filter((task) => task.status === status).length;

/** Every figure the cards claim, counted straight off the seed. */
function expected() {
  // "Approved" folds Delivered in — delivery is what happens to approved work
  // next, not a rival verdict.
  const approved = countOf('Approved') + countOf('Delivered');
  // Tasks that actually reached review: total, less drafts, less cancellations.
  const reviewed = db.tasks.length - countOf('Draft') - countOf('Cancelled');

  return {
    total: db.tasks.length,
    approved,
    delivered: countOf('Delivered'),
    changesRequested: countOf('ChangesRequested'),
    cancelled: countOf('Cancelled'),
    approvalRate: Math.round((approved / reviewed) * 1000) / 10,
  };
}

/**
 * The KPI card carrying this caption.
 *
 * Anchored on the CAPTION rather than the label, which is the lesson
 * `reviewerAnalytics.test.tsx` already paid for: "Approval Rate" and "Delivered"
 * each appear several times on this page — in the KPI row, in the status chart's
 * legend, and again as column headings inside the breakdown panels — so a label
 * query matches three elements and picks whichever it reaches first. The
 * captions are unique. The caption is a direct child of the card, so its parent
 * is the card itself.
 */
async function card(caption: RegExp) {
  const found = await screen.findByText(caption);
  const root = found.parentElement;
  if (root === null) throw new Error(`No KPI card for ${String(caption)}`);
  return root;
}

/**
 * The Task Status Distribution legend, which is the donut's accessible form.
 *
 * Each row reads label + count + share, concatenated without separators
 * ("Changes Requested918%"), so callers match a label-and-count prefix and leave
 * the percentage open rather than trying to split the digits apart.
 */
async function statusLegend() {
  const heading = await screen.findByRole('heading', {
    name: 'Task Status Distribution',
  });
  const chart = heading.closest('div.rounded-card');
  if (chart === null) throw new Error('status chart has no card');
  return within(chart as HTMLElement).getAllByRole('button');
}

beforeEach(() => {
  signInForTest(ADMIN);
});

describe('Admin Reports', () => {
  it('shows the counts the seed actually contains', async () => {
    const want = expected();

    renderReports();

    expect(
      within(await card(/^All review tasks$/)).getByText(String(want.total)),
    ).toBeInTheDocument();
    // The Approved caption interpolates the rate, so the anchor carries it: a
    // bare /approval rate/ also matches the column heading in every breakdown
    // panel below.
    expect(
      within(await card(new RegExp(`^${String(want.approvalRate)}% approval rate$`))).getByText(
        String(want.approved),
      ),
    ).toBeInTheDocument();
    expect(
      within(await card(/^Pending revisions$/)).getByText(String(want.changesRequested)),
    ).toBeInTheDocument();
    expect(
      within(await card(/^Tasks cancelled$/)).getByText(String(want.cancelled)),
    ).toBeInTheDocument();
  });

  /**
   * FS 2.19 lists a Delivered card among the Key Metrics. The page had none —
   * the figure existed only as a slice of the status donut.
   */
  it('reports Delivered as its own card', async () => {
    const want = expected();
    // Else the assertion below would pass against an empty page.
    expect(want.delivered).toBeGreaterThan(0);

    renderReports();

    expect(
      within(await card(/^Of which delivered$/)).getByText(String(want.delivered)),
    ).toBeInTheDocument();

    // And not at Approved's expense: a delivered task is still approved work, so
    // it is counted by both cards and summing the row is the mistake.
    expect(want.approved).toBeGreaterThan(want.delivered);
  });

  it('computes the approval rate over tasks that reached review', async () => {
    const want = expected();

    renderReports();

    const rate = await card(/^Of submitted tasks$/);
    expect(within(rate).getByText(`${String(want.approvalRate)}%`)).toBeInTheDocument();

    // Not approved ÷ total, the tempting wrong denominator: it would punish the
    // team for drafts in progress and for work the business itself withdrew.
    const naive = Math.round((want.approved / want.total) * 1000) / 10;
    expect(naive).not.toBe(want.approvalRate);
  });

  /**
   * The contradiction this pass exists to remove.
   *
   * Developer Analytics compared the same rate against 50 while this page used
   * 70, so one figure read "On target" for a developer and "Below target" for
   * the administrator looking at that same developer.
   */
  it('judges the rate against the shared target and says the target is provisional', async () => {
    const want = expected();

    renderReports();

    const rate = await card(/^Of submitted tasks$/);
    const verdict = want.approvalRate >= APPROVAL_RATE_TARGET ? /on target/i : /below target/i;
    expect(within(rate).getByText(verdict)).toBeInTheDocument();

    // FL 2.4.3 needs the indicator; the specification never gave a number. The
    // card has to admit that rather than presenting a placeholder as agreed.
    expect(within(rate).getByText(/placeholder pending business sign-off/i)).toBeInTheDocument();
  });

  /**
   * Card ↔ chart consistency.
   *
   * Both are drawn from the same filtered rows, so they cannot legitimately
   * disagree — but they are computed by different functions and nothing enforced
   * it.
   */
  it('agrees with the status chart drawn from the same rows', async () => {
    const want = expected();

    renderReports();

    const rows = await statusLegend();

    // One row per status present, and none for a status with no tasks — an
    // always-rendered zero slice would flatter the chart against the cards.
    const present = new Set(db.tasks.map((task) => task.status));
    expect(rows).toHaveLength(present.size);

    // The three statuses that also have a card of their own must report the same
    // number in both places.
    expect(rows.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(`^Changes Requested${String(want.changesRequested)}\\d+%$`),
        ),
        expect.stringMatching(new RegExp(`^Cancelled${String(want.cancelled)}\\d+%$`)),
        expect.stringMatching(new RegExp(`^Delivered${String(want.delivered)}\\d+%$`)),
      ]),
    );
  });

  it('moves the cards and the chart together when a customer filter is applied', async () => {
    const { user } = renderReports();

    const before = (await card(/^All review tasks$/)).textContent;

    const customer = db.customers.find((entry) =>
      db.tasks.some((task) => task.customerId === entry.id),
    );
    if (!customer) throw new Error('seed has no customer with tasks');
    const theirs = db.tasks.filter((task) => task.customerId === customer.id);

    await user.click(screen.getByRole('combobox', { name: 'Customer' }));
    await user.click(await screen.findByRole('option', { name: customer.name }));

    const after = await card(/^All review tasks$/);
    expect(after.textContent).not.toBe(before);
    expect(within(after).getByText(String(theirs.length))).toBeInTheDocument();

    // The chart followed. A filter that moved the cards and left the donut
    // showing the whole system would be the same defect in reverse.
    const rows = await statusLegend();
    expect(rows).toHaveLength(new Set(theirs.map((task) => task.status)).size);
  });
});
