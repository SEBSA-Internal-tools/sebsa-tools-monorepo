import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@/test/setup.ts';
import { routes } from '@/app/routes.tsx';

/**
 * The admin workspace, driven through the real route table and the real MSW
 * handlers.
 *
 * The interesting assertions here are the negative ones. Every row action is
 * gated by `statusMachine`, and a gate is only proved by the case it refuses —
 * an admin grid that shows Delete on an in-review task would pass any test that
 * only clicked Delete on a draft.
 */

/** Holds all three roles, so `RequireWorkspace` lets them in. */
const ADMIN = 'u-charith';
/** Developer only — the negative control for the workspace guard. */
const DEVELOPER_ONLY = 'u-dheliya';

function renderAdmin(path = '/crp/admin') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/**
 * The `<tr>` whose Task ID cell holds this code.
 *
 * Filters the grid down to the code first rather than scanning whatever is on
 * screen. The grid pages at 15 and the seed holds far more tasks than that,
 * newest first — so whether a given row happens to be on page 1 is an accident
 * of the fixture dates, not a property of the app. Five tests here broke the day
 * eight tasks were added to `tasks.json`, all of them for that reason and none
 * of them because the behaviour under test had changed.
 *
 * Searching asserts exactly the same thing without the coupling. Each call
 * re-types the filter, so consecutive lookups in one test are independent.
 */
async function taskRow(taskCode: string) {
  const search = await screen.findByRole('searchbox', {
    name: /search tasks/i,
  });
  await userEvent.clear(search);
  await userEvent.type(search, taskCode);

  const cell = await screen.findByText(taskCode);
  const row = cell.closest('tr');
  if (row === null) throw new Error(`No row found for ${taskCode}`);
  return row;
}

beforeEach(() => {
  signInForTest(ADMIN);
});

describe('admin workspace guard', () => {
  it('keeps a developer-only account out of /admin', async () => {
    signInForTest(DEVELOPER_ONLY);
    const { router } = renderAdmin();

    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe('/crp/admin');
    });
  });
});

describe('admin tasks grid', () => {
  it('shows every task, not just the signed-in admin’s own', async () => {
    renderAdmin();

    // Tasks raised by someone else entirely — SEMCO-013 by Pinsara, BLOM-009 by
    // Hiruni, neither of them the signed-in admin. `scope=all` is admin-only in
    // the handler, so these rows appearing proves the scope was honoured.
    expect(await taskRow('SEMCO-013')).toBeInTheDocument();
    expect(await taskRow('BLOM-009')).toBeInTheDocument();
  });

  it('offers Delete on a draft but NOT on a task under review', async () => {
    renderAdmin();

    const draft = await taskRow('AASL-014');
    expect(within(draft).getByRole('button', { name: /delete AASL-014/i })).toBeInTheDocument();

    // The control. A task in review carries review cycles and findings that
    // Reports counts, so it may be cancelled but never destroyed.
    const inReview = await taskRow('BLOM-010');
    expect(within(inReview).queryByRole('button', { name: /delete BLOM-010/i })).toBeNull();
    expect(within(inReview).getByRole('button', { name: /cancel BLOM-010/i })).toBeInTheDocument();
  });

  it('offers no Assign action on a draft — there is nothing to review yet', async () => {
    renderAdmin();

    const draft = await taskRow('AASL-014');
    expect(within(draft).queryByRole('button', { name: /assign a reviewer/i })).toBeNull();
  });

  it('assigns a reviewer and moves the task into review', async () => {
    const { user } = renderAdmin();

    const row = await taskRow('BLOM-009');
    await user.click(
      within(row).getByRole('button', {
        name: /assign a reviewer to BLOM-009/i,
      }),
    );

    await user.click(await screen.findByRole('combobox', { name: /reviewer/i }));

    // BLOM-009 was raised by Hiruni, so Hiruni must not be offered as its
    // reviewer — the self-review bar, which the handler enforces regardless.
    expect(screen.queryByRole('option', { name: 'Hiruni Wijethilaka' })).toBeNull();

    await user.click(await screen.findByRole('option', { name: 'Pinsara Chandika' }));
    await user.click(screen.getByRole('button', { name: /^assign reviewer$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const updated = await taskRow('BLOM-009');
    await waitFor(() => {
      expect(within(updated).getByText('Pinsara Chandika')).toBeInTheDocument();
    });
    expect(within(updated).getByText('In Review')).toBeInTheDocument();
  });

  it('cancels a task after confirming', async () => {
    const { user } = renderAdmin();

    const row = await taskRow('SEMCO-013');
    await user.click(within(row).getByRole('button', { name: /cancel SEMCO-013/i }));

    // Nothing changes until the confirmation is answered.
    //
    // Read from the row already in hand rather than calling `taskRow` again:
    // the confirm dialog is open, and Radix makes everything behind it inert, so
    // a helper that types into the grid's search box cannot run from here.
    expect(await screen.findByText(/cancel this task\?/i)).toBeInTheDocument();
    expect(within(row).getByText('Submitted')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel task$/i }));

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Cancelled')).toBeInTheDocument();
    });
  });
});

describe('admin users tab', () => {
  it('lists users and creates a new one', async () => {
    const { user } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('dheliya.kankanamge@sebsaworld.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add user/i }));
    await user.type(await screen.findByLabelText(/name/i), 'Test Person');
    await user.type(screen.getByLabelText(/email/i), 'test.person@sebsaworld.com');
    await user.click(screen.getByRole('checkbox', { name: 'Reviewer' }));
    await user.click(screen.getByRole('button', { name: /^create user$/i }));

    expect(await screen.findByText('test.person@sebsaworld.com')).toBeInTheDocument();
  });

  it('refuses to create a user with no role', async () => {
    const { user } = renderAdmin('/crp/admin/users');

    await user.click(await screen.findByRole('button', { name: /add user/i }));
    await user.type(await screen.findByLabelText(/name/i), 'Roleless');
    await user.type(screen.getByLabelText(/email/i), 'roleless@sebsaworld.com');
    await user.click(screen.getByRole('button', { name: /^create user$/i }));

    expect(await screen.findByText(/select at least one role/i)).toBeInTheDocument();
    // The dialog stays open rather than silently discarding the input.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('filters by role', async () => {
    const { user } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('Dheliya Kankanamge')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /role/i }));
    await user.click(await screen.findByRole('option', { name: 'Admin' }));

    // Dheliya is Developer-only, so the Admin filter must drop them.
    await waitFor(() => {
      expect(screen.queryByText('Dheliya Kankanamge')).toBeNull();
    });
    expect(
      within(screen.getByRole('table')).getByText('Charith Widanapathirana'),
    ).toBeInTheDocument();
  });
});

describe('admin customers tab', () => {
  it('creates a customer with a chosen colour', async () => {
    const { user } = renderAdmin('/crp/admin/customers');

    expect(await screen.findByText('Semco Maritime')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add customer/i }));
    await user.type(await screen.findByLabelText(/name/i), 'Northwind Traders');
    await user.click(screen.getByRole('button', { name: /use teal/i }));
    await user.click(screen.getByRole('button', { name: /^create customer$/i }));

    expect(await screen.findByText('Northwind Traders')).toBeInTheDocument();
    // The code is derived from the name, never typed.
    expect(await screen.findByText('NORTHW')).toBeInTheDocument();
  });

  it('refuses to delete a customer that has tasks', async () => {
    const { user } = renderAdmin('/crp/admin/customers');

    // Matched on the DESCRIPTION cell: 'BLOM' is both the chip name and the
    // code, so it is not a unique handle on the row.
    const cell = await screen.findByText('Biomsterlandet');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No BLOM row');

    await user.click(within(row).getByRole('button', { name: /delete BLOM/i }));

    const confirm = await screen.findByRole('button', {
      name: /^delete customer$/i,
    });
    await user.click(confirm);

    // Wait for the request to settle. The toast is NOT asserted here: `Toaster`
    // is mounted in `App`, which the route table does not include, so a toast
    // assertion in a router test never matches and passes for the wrong reason.
    await waitFor(() => {
      expect(confirm).toHaveAttribute('aria-busy', 'false');
    });

    // The handler refused: the dialog is still open and the customer survives.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Biomsterlandet')).toBeInTheDocument();
  });
});
