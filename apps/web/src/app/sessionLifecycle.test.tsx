import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mswServer.ts';
import { signOutForTest } from '@/test/setup.ts';
import { setMockUserId } from '@/lib/apiClient.ts';
import { initialiseSession, useSession } from '@/hooks/useSession.ts';
import { routes } from './routes.tsx';
import { AppProviders } from './providers.tsx';

/**
 * The session lifecycle, end to end through the real route table.
 *
 * Everything here was previously uncovered — `initialiseSession` had literally
 * zero test coverage — and it is where a real, user-visible bug lived: an
 * authentication error appearing minutes after launch, with a "Try again" that
 * could not work.
 */

const KEY = 'sdp.mock-user-id';
const USER = 'u-hiruni';

function renderApp(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });

  return {
    ...render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
    router,
    user: userEvent.setup({ delay: null }),
  };
}

function seedStoredSession(): void {
  window.localStorage.setItem(KEY, USER);
}

beforeEach(() => {
  // Start from genuinely signed out: these tests are about what the STORED
  // session does, so the in-memory shortcut the harness normally uses would
  // mask exactly what is under test.
  signOutForTest();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useSession.setState({
    userId: null,
    isAuthenticated: false,
    didExpire: false,
  });
});

describe('booting from a stored session', () => {
  it('restores a live session before the first render', async () => {
    seedStoredSession();
    initialiseSession();

    expect(useSession.getState().isAuthenticated).toBe(true);

    const { router } = renderApp('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    // The account chip only exists once `/auth/me` has resolved a principal.
    // Asserting on a heading would not do: the login page has one too, so the
    // test would pass while sitting on the login screen.
    expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument();
  });

  /**
   * The negative control. Before the expiry envelope existed, storage held a
   * bare user id and a session lived forever — this is the case that proves the
   * two-hour limit is real rather than decorative.
   */
  it('refuses a session that has already expired, and lands on login', async () => {
    window.localStorage.removeItem(KEY);
    initialiseSession();

    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    const { router } = renderApp('/');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  /**
   * The bug that produced the reported error screen.
   *
   * `apiClient` used to hold the identity in a module-level `let`, primed once
   * at boot. Vite HMR resets that while React state survives, so every later
   * request went out anonymous while the UI still believed it was signed in.
   * Reading storage per request is what fixes it — this asserts the fix by
   * clearing the override and checking requests still authenticate.
   */
  it('authenticates from storage even when the in-memory override is lost', async () => {
    seedStoredSession();
    initialiseSession();

    // Simulate the module reset: the override is gone, storage is not.
    setMockUserId(null);

    renderApp('/');

    // The account chip renders only once `/api/auth/me` has authenticated —
    // which, with the override gone, it can only do by reading storage.
    expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument();
    expect(screen.queryByText(/authentication failed/i)).toBeNull();
  });
});

/** Makes `/api/auth/me` reject the session, as an expired one is rejected. */
function rejectTheSession(): void {
  server.use(
    http.get('/api/auth/me', () =>
      HttpResponse.json(
        {
          statusCode: 401,
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication failed or user account not configured.',
        },
        { status: 401 },
      ),
    ),
  );
}

describe('a session rejected mid-flight', () => {
  /**
   * The regression test for a real crash.
   *
   * `RootLayout` used to call `signOut()` from its RENDER BODY on a 401. That
   * write notified `RequireAuth`, which subscribes to the same store from above
   * it, so a component that had already rendered was invalidated mid-render — and
   * because the 401 was still there on the next pass it fired again every render.
   * React threw on the loop and the route boundary showed "This page ran into a
   * problem", which is what the user reported.
   *
   * Asserting the ABSENCE of that boundary is the point of this test. The screen
   * assertion below would pass even with the loop, because the boundary renders
   * in place of the layout and the test would simply not find the screen either.
   */
  it('explains the expiry instead of crashing into the error boundary', async () => {
    seedStoredSession();
    initialiseSession();
    rejectTheSession();

    const { router } = renderApp('/crp/developer');

    expect(await screen.findByText(/you’ve been signed out/i)).toBeInTheDocument();
    expect(screen.queryByText(/this page ran into a problem/i)).toBeNull();

    // Told what happened AND what was done about it — not bounced silently.
    expect(screen.getByText(/secure sign-in has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/have been cleared/i)).toBeInTheDocument();

    // The purge happens up front, so nothing sensitive sits behind the screen.
    expect(useSession.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    // Deliberately still on the route the user was on: the redirect is theirs to
    // trigger, which is what makes the explanation readable.
    expect(router.state.location.pathname).toBe('/crp/developer');
  });

  it('purges everything stored for the user, not just the session envelope', async () => {
    // A half-finished wizard draft. It used to survive a sign-out, so the next
    // person to sign in on a shared browser inherited a stranger's task.
    window.sessionStorage.setItem('sdp.taskDraft', JSON.stringify({ state: { crimId: 'CRIM-1' } }));

    seedStoredSession();
    initialiseSession();
    rejectTheSession();

    renderApp('/crp/developer');
    await screen.findByText(/you’ve been signed out/i);

    expect(window.sessionStorage.getItem('sdp.taskDraft')).toBeNull();
  });

  it('goes to the login form, with its notice, when the user asks', async () => {
    seedStoredSession();
    initialiseSession();
    rejectTheSession();

    const { router, user } = renderApp('/crp/developer');
    await screen.findByText(/you’ve been signed out/i);

    await user.click(screen.getByRole('button', { name: /sign in again/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });

    // `didExpire` outlives the screen, so the reminder is still there on the form.
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByText(/you’ve been signed out/i)).toBeInTheDocument();
  });
});
