import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { signInForTest } from '@/test/setup.ts';
import { db, findUser } from '@/mocks/db.ts';
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
      {/* `Toaster` lives in `App`; mounted here so toast outcomes can be asserted. */}
      <Toaster />
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

  it('does not show a separate Role Granting tab for Super Admin', async () => {
    const actor = findUser(ADMIN);
    if (actor === undefined) throw new Error('Admin fixture was not found');
    actor.roles = ['SuperAdmin'];

    renderAdmin('/crp/admin/users');

    expect(await screen.findByText('User Management')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /role granting/i })).toBeNull();
  });
});

describe('admin tasks grid', () => {
  it('shows submitted tasks from every developer, but hides all drafts', async () => {
    renderAdmin();

    // Tasks raised by someone else entirely — SEMCO-013 by Pinsara, BLOM-009 by
    // Hiruni, neither of them the signed-in admin. `scope=all` is admin-only in
    // the handler, so these rows appearing proves the scope was honoured.
    expect(await taskRow('SEMCO-013')).toBeInTheDocument();
    expect(await taskRow('BLOM-009')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: /search tasks/i });
    const draftCodes = db.tasks
      .filter((task) => task.status === 'Draft')
      .map((task) => task.taskCode);
    expect(draftCodes.length).toBeGreaterThan(0);

    for (const taskCode of draftCodes) {
      await userEvent.clear(search);
      await userEvent.type(search, taskCode);
      await waitFor(() => {
        expect(screen.queryByText(taskCode)).toBeNull();
      });
    }
  });

  it('offers Cancel but not Delete on a task under review', async () => {
    renderAdmin();

    const inReview = await taskRow('BLOM-010');
    expect(within(inReview).queryByRole('button', { name: /delete BLOM-010/i })).toBeNull();
    expect(within(inReview).getByRole('button', { name: /cancel BLOM-010/i })).toBeInTheDocument();
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

    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'No longer required.');
    await user.click(screen.getByRole('button', { name: /^cancel task$/i }));

    await waitFor(() => {
      expect(within(screen.getByRole('table')).getByText('Cancelled')).toBeInTheDocument();
    });
  });
});

describe('admin users tab', () => {
  it('lets the current Super Admin transfer ownership to an existing Admin', async () => {
    const actor = findUser('u-qa-superadmin');
    const target = findUser('u-janith');
    if (actor === undefined || target === undefined) throw new Error('Admin fixture was not found');
    signInForTest(actor.id);

    const { user } = renderAdmin('/crp/admin/users');
    await user.type(await screen.findByRole('searchbox', { name: /search users/i }), target.name);
    await user.click(
      await screen.findByRole('button', {
        name: /transfer super admin to Janith Hasthanayake/i,
      }),
    );

    expect(
      screen.getByText(/all their other roles will be removed.*remain an admin/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^transfer super admin$/i }));

    await waitFor(() => {
      expect(target.roles).toContain('SuperAdmin');
      expect(target.roles).toEqual(['SuperAdmin']);
      expect(actor.roles).toContain('Admin');
      expect(actor.roles).not.toContain('SuperAdmin');
    });
    expect(
      [actor, target].filter((candidate) => candidate.roles.includes('SuperAdmin')),
    ).toHaveLength(1);
  });

  it('lists users and creates a new one', async () => {
    const { user } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('dheliya.kankanamge@sebsaworld.com')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^delete /i })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /add user/i }));
    expect(screen.getByRole('checkbox', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Admin' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Super Admin' })).toBeNull();
    await user.type(await screen.findByLabelText(/name/i), 'Test Person');
    await user.type(screen.getByLabelText(/email/i), 'test.person@sebsaworld.com');
    await user.click(screen.getByRole('checkbox', { name: 'Reviewer' }));
    await user.click(screen.getByRole('button', { name: /^create user$/i }));

    await user.type(
      await screen.findByRole('searchbox', { name: /search users/i }),
      'test.person@sebsaworld.com',
    );
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

  it.each(['name@company', 'name@@company.com', 'name company@x.com', 'name@company.c'])(
    'rejects the malformed email %j before anything is sent',
    async (email) => {
      const { user } = renderAdmin('/crp/admin/users');
      await user.click(await screen.findByRole('button', { name: /add user/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/name/i), 'Bad Email');
      await user.type(within(dialog).getByLabelText(/email/i), email);
      await user.tab();

      expect(
        await within(dialog).findByText(
          'Enter a valid email address, for example name@company.com',
        ),
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole('checkbox', { name: 'Developer' }));
      await user.click(within(dialog).getByRole('button', { name: /^create user$/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(db.users.some((u) => u.name === 'Bad Email')).toBe(false);
    },
  );

  it('creates the user as Invited, with resend and revoke instead of activate', async () => {
    const { user } = renderAdmin('/crp/admin/users');
    await user.click(await screen.findByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/name/i), 'Invite Person');
    await user.type(within(dialog).getByLabelText(/email/i), 'invite.person@sebsaworld.com');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Reviewer' }));
    await user.click(within(dialog).getByRole('button', { name: /^create user$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    await user.type(screen.getByRole('searchbox', { name: /search users/i }), 'invite.person');
    const row = (await screen.findByText('invite.person@sebsaworld.com')).closest('tr')!;
    expect(within(row).getByText('Invited')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Resend invite for Invite Person' }),
    ).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^(activate|deactivate)/i })).toBeNull();

    // The invite only just went out, so the server asks the admin to wait.
    await user.click(within(row).getByRole('button', { name: 'Resend invite for Invite Person' }));
    expect(await screen.findByText('Please wait a moment before resending.')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Revoke invite for Invite Person' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke invite' }));
    expect(
      await screen.findByText('Invite for invite.person@sebsaworld.com revoked.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('invite.person@sebsaworld.com')).toBeNull();
    });
  });

  it('shows invite state in the Status column, with no separate Invite column', async () => {
    db.users.push({
      id: 'u-new-starter',
      name: 'New Starter',
      email: 'new.starter@sebsaworld.com',
      roles: ['Developer'],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString(),
      inviteEmailStatus: 'SENT',
    });
    renderAdmin('/crp/admin/users');
    await screen.findByText('dheliya.kankanamge@sebsaworld.com');

    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^invite$/i })).toBeNull();
    // An invited user is listed as Invited, and keeps its row actions.
    const row = screen.getByText('new.starter@sebsaworld.com').closest('tr')!;
    expect(within(row).getByText('Invited')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Resend invite for New Starter' }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Revoke invite for New Starter' }),
    ).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /edit New Starter/i })).toBeInTheDocument();
  });

  it('filters to invited users', async () => {
    db.users.push({
      id: 'u-waiting',
      name: 'Waiting Person',
      email: 'waiting@sebsaworld.com',
      roles: ['Developer'],
      isActive: false,
      createdAt: '2026-10-01T09:00:00.000Z',
      status: 'INVITED',
      inviteExpiresAt: null,
      inviteEmailStatus: 'SENT',
    });
    const { user } = renderAdmin('/crp/admin/users');
    await screen.findByText('dheliya.kankanamge@sebsaworld.com');

    await user.click(screen.getByRole('combobox', { name: /status/i }));
    await user.click(await screen.findByRole('option', { name: 'Invited' }));

    expect(await screen.findByText('waiting@sebsaworld.com')).toBeInTheDocument();
    expect(screen.queryByText('dheliya.kankanamge@sebsaworld.com')).toBeNull();
    expect(screen.getByText('Showing 1 of', { exact: false })).toHaveTextContent('Showing 1 of');
  });

  it('filters by role', async () => {
    const { user } = renderAdmin('/crp/admin/users');

    expect(await screen.findByText('Dheliya Kankanamge')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /role/i }));
    await user.click(await screen.findByRole('checkbox', { name: 'Admin' }));

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
    signInForTest('u-qa-superadmin');
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
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'Duplicate customer record.');
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

describe('admin users tab: editing roles and reviewer workload (docs/25)', () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.type(await screen.findByRole('searchbox', { name: /search users/i }), name);
    await user.click(await screen.findByRole('button', { name: new RegExp(`^edit ${name}$`, 'i') }));
    return screen.findByRole('dialog');
  }

  it('adds a role to a single-role user', async () => {
    const { user } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(user, 'Dheliya Kankanamge');

    await user.click(within(dialog).getByRole('checkbox', { name: 'Reviewer' }));
    await user.click(within(dialog).getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => {
      expect(findUser('u-dheliya')?.roles).toEqual(['Developer', 'Reviewer']);
    });
  });

  it('removes one role from a user who holds two', async () => {
    db.users.push({
      id: 'u-two-roles',
      name: 'Two Roles',
      email: 'two.roles@sebsaworld.com',
      roles: ['Developer', 'Reviewer'],
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const { user } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(user, 'Two Roles');

    await user.click(within(dialog).getByRole('checkbox', { name: 'Reviewer' }));
    await user.click(within(dialog).getByRole('button', { name: /^save changes$/i }));

    await waitFor(() => {
      expect(findUser('u-two-roles')?.roles).toEqual(['Developer']);
    });
  });

  it('never lets the last remaining role be cleared', async () => {
    const { user } = renderAdmin('/crp/admin/users');
    const dialog = await openEdit(user, 'Dheliya Kankanamge');

    expect(within(dialog).getByRole('checkbox', { name: 'Developer' })).toBeDisabled();
    expect(within(dialog).queryByRole('checkbox', { name: 'Admin' })).toBeNull();
  });

  it('blocks deactivating a reviewer who still has review work, and lists it', async () => {
    const pending = db.tasks.find((task) => task.status === 'InReview' && task.reviewerId !== null);
    const reviewer = pending?.reviewerId ? findUser(pending.reviewerId) : undefined;
    if (pending === undefined || reviewer === undefined) throw new Error('No in-review fixture');
    signInForTest('u-qa-superadmin');

    const { user } = renderAdmin('/crp/admin/users');
    await user.type(await screen.findByRole('searchbox', { name: /search users/i }), reviewer.name);
    await user.click(
      await screen.findByRole('button', { name: new RegExp(`^deactivate ${reviewer.name}$`, 'i') }),
    );
    const dialog = await screen.findByRole('dialog');
    const reason = within(dialog).queryByRole('textbox');
    if (reason !== null) await user.type(reason, 'Leaving the team');
    await user.click(within(dialog).getByRole('button', { name: /^deactivate$/i }));

    const notice = await within(dialog).findByRole('alert');
    expect(notice).toHaveTextContent(/still has \d+ pending review task/i);
    expect(within(notice).getByRole('link', { name: new RegExp(pending.taskCode, 'i') })).toBeInTheDocument();
    // Nothing changed: the reviewer is still active.
    expect(reviewer.isActive).toBe(true);
  });
});
