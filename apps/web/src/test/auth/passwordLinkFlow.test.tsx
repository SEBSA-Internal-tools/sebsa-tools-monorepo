import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '@/app/routes.tsx';
import { useSession } from '@/hooks/useSession.ts';
import { devOutbox } from '@/mocks/passwordLinks.ts';
import { signInForTest, signOutForTest } from '@/test/setup.ts';

/**
 * Onboarding end to end, through the real route table, the real screens and the
 * MSW handlers — nothing in `localAuthApi` is mocked.
 *
 * The email step is the one seam: the handlers "send" to `devOutbox`, and the
 * test opens that link exactly as a user clicking it would, with the token in
 * the URL fragment.
 */

const NEW_EMAIL = 'flow.person@sebsaworld.com';
const NEW_PASSWORD = 'Zebra-Kettle-42!';

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/** What a click on the emailed link does: the browser lands with `#token=...`. */
function openEmailedLink(token: string) {
  window.history.replaceState(null, '', `/set-password#token=${token}`);
  return renderApp('/set-password');
}

async function choosePassword(user: ReturnType<typeof userEvent.setup>, password: string) {
  await screen.findByRole('heading', { name: 'Create your password' });
  const [first, confirm] = screen.getAllByLabelText(/password/i, { selector: 'input' });
  await user.type(first!, password);
  await user.type(confirm!, password);
  await user.click(screen.getByRole('button', { name: 'Save password' }));
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('new user onboarding', () => {
  it('admin adds a user → invite link → password → first sign-in', async () => {
    // 1. An admin adds the user. No password is typed by the admin.
    signInForTest('u-qa-admin');
    const admin = renderApp('/crp/admin/users');
    await admin.user.click(await screen.findByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/password/i)).toBeNull();
    await admin.user.type(within(dialog).getByLabelText(/name/i), 'Flow Person');
    await admin.user.type(within(dialog).getByLabelText(/email/i), 'Flow.Person@SebsaWorld.com');
    await admin.user.click(within(dialog).getByRole('checkbox', { name: 'Developer' }));
    await admin.user.click(within(dialog).getByRole('button', { name: /^create user$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await admin.user.type(screen.getByRole('searchbox', { name: /search users/i }), 'flow.person');
    const row = (await screen.findByText(NEW_EMAIL)).closest('tr')!;
    expect(within(row).getByText('Invited')).toBeInTheDocument();
    // The invite detail is a tooltip on the pill, not a column of its own.
    expect(within(row).getByText('Invited')).toHaveAttribute(
      'title',
      expect.stringMatching(/Expires in 2\d h/),
    );
    expect(screen.queryByRole('columnheader', { name: /^invite$/i })).toBeNull();
    // Activation is not offered: only the user can finish it by setting a password.
    expect(within(row).queryByRole('button', { name: /^activate/i })).toBeNull();
    admin.unmount();

    const invite = devOutbox.findLast((message) => message.to === NEW_EMAIL);
    expect(invite?.purpose).toBe('INVITE');

    // 2. The new user, signed out, opens the link and chooses a password.
    signOutForTest();
    const link = openEmailedLink(invite!.token);
    await screen.findByRole('heading', { name: 'Create your password' });
    // Scrubbed from the address bar as soon as the screen reads it.
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(invite!.token);
    await choosePassword(link.user, NEW_PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Password saved' })).toBeInTheDocument();
    await link.user.click(screen.getByRole('button', { name: 'Go to sign in' }));
    await waitFor(() => expect(link.router.state.location.pathname).toBe('/login'));

    // 3. They sign in with it and land on the CRP home.
    await link.user.type(await screen.findByLabelText(/work email/i), NEW_EMAIL);
    await link.user.type(screen.getByLabelText(/^password/i), NEW_PASSWORD);
    await link.user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(link.router.state.location.pathname).toBe('/crp'));
    expect(useSession.getState().isAuthenticated).toBe(true);
    link.unmount();

    // 4. The link is spent. Signed out again, it explains instead of working.
    signOutForTest();
    openEmailedLink(invite!.token);
    expect(
      await screen.findByRole('heading', { name: "This link can't be used" }),
    ).toBeInTheDocument();
  });

  it('shows the server’s answer when the password names the user', async () => {
    signOutForTest();
    const { user } = openEmailedLink('demo-invite');
    await choosePassword(user, 'Starter-Pass-42!');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Choose a password that doesn't include your name or email",
    );
  });

  it('takes an expired link to the expired screen and sends a new one', async () => {
    signOutForTest();
    const { user } = openEmailedLink('demo-expired-invite');

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send me a new link' }));
    expect(await screen.findByText(/A new link is on its way/)).toBeInTheDocument();
    expect(devOutbox.at(-1)).toMatchObject({ to: 'new.starter@sebsaworld.com', purpose: 'INVITE' });
  });
});

describe('forgot password', () => {
  it('confirms the same way for any address, and a real one gets a working link', async () => {
    signOutForTest();
    const first = renderApp('/forgot-password');
    await first.user.type(await screen.findByLabelText(/email/i), 'nobody@nowhere.example');
    await first.user.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(devOutbox).toHaveLength(0);
    first.unmount();

    const second = renderApp('/forgot-password');
    await second.user.type(
      await screen.findByLabelText(/email/i),
      'dheliya.kankanamge@sebsaworld.com',
    );
    await second.user.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    second.unmount();

    const reset = devOutbox.at(-1)!;
    expect(reset.purpose).toBe('RESET');
    const link = openEmailedLink(reset.token);
    await choosePassword(link.user, NEW_PASSWORD);
    expect(await screen.findByRole('heading', { name: 'Password saved' })).toBeInTheDocument();
  });
});
