import { expect, test, type Page } from '@playwright/test';

/**
 * Idle session expiry, and the trip back to the screen the user was working on.
 *
 * THE REQUIREMENT
 * A user signs in, opens a screen, and leaves the app idle for hours. When the
 * session has expired by the time they come back:
 *
 *   1. the "You've been signed out" screen is shown — on the screen they were
 *      on, not an error page and not a silent bounce to the login form;
 *   2. after "Sign in again" and a successful sign-in they land on EXACTLY that
 *      screen again — same path and query string — not on Home.
 *
 * HOW THE TEST GETS THERE WITHOUT WAITING HOURS
 * - `page.clock` moves the browser's clock forward three hours, so every cached
 *   query is genuinely stale when the user returns.
 * - The server ending the session is modelled by an init script that answers 401
 *   for every `/api/*` call (except sign-in) once a flag is set. The mock API has
 *   no idle timeout of its own, and the app keeps the signed-in identity in
 *   memory, so editing storage mid-page would not be noticed — whereas a 401 is
 *   exactly what an expired session looks like to the app on the real backend.
 *   A successful sign-in clears the flag: a new session has been issued.
 * - Returning to the tab is a `visibilitychange`, which is what makes the app
 *   refetch stale data — and discover the session is gone.
 *
 * `sessionExpiry.spec.ts` covers the expiry screen itself; this file covers the
 * idle trigger and the deep-link return. The same flow is unit-tested against
 * the real route table in `apps/web/src/test/session/idleExpiryReturn.test.tsx`.
 */

const EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Sebsa@2026';
// `MOCK_IDENTITY_KEY` in `apps/web/src/lib/apiClient.ts`.
const IDENTITY_KEY = 'sdp.mock-user-id';
// Deliberately NOT under `sdp.`: the app purges that prefix on sign-out.
const SERVER_SESSION_FLAG = 'e2e.server-session';

/** Owned by Hiruni in `apps/web/src/mocks/data/tasks.json`. */
const TASK_ID = 't-blom-010';
const TASK_CODE = 'BLOM-010';

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.addInitScript((flagKey) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isApi = new URL(url, window.location.href).pathname.startsWith('/api/');
      if (isApi && url.includes('/api/auth/login')) {
        // Signing in issues a new server session.
        window.sessionStorage.removeItem(flagKey);
      } else if (isApi && window.sessionStorage.getItem(flagKey) === 'revoked') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 401,
              code: 'NOT_AUTHENTICATED',
              message: 'Not authenticated.',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return realFetch(input, init);
    };
  }, SERVER_SESSION_FLAG);
});

async function fillAndSubmitLogin(page: Page) {
  await page.getByLabel(/work email/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function signIn(page: Page) {
  await page.goto('/login');
  await fillAndSubmitLogin(page);
  await page.waitForURL('/crp');
}

/** Address-bar form of the current location: path plus query string. */
function currentUrl(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

/** The user walks away for three hours; the server ends the session meanwhile. */
async function idleForHoursWhileServerExpiresSession(page: Page) {
  await page.clock.fastForward('03:00:00');
  await page.evaluate((flagKey) => {
    window.sessionStorage.setItem(flagKey, 'revoked');
  }, SERVER_SESSION_FLAG);
}

/** The user comes back to the tab. */
async function returnToTheTab(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

async function expectSignedOutScreen(page: Page) {
  await expect(page.getByText(/you’ve been signed out/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/come straight back to where you were/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in again/i })).toBeVisible();
  await expect(page.getByText(/this page ran into a problem/i)).toHaveCount(0);
}

/**
 * One screen per workspace, each with something on it that proves the right
 * page rendered — not just the right URL. The filtered list carries its filters
 * in the query string, which must survive the round trip too.
 */
const SCREENS = [
  {
    name: 'a developer task',
    path: `/crp/developer/tasks/${TASK_ID}`,
    proof: (page: Page) => page.getByText(TASK_CODE).first(),
  },
  {
    name: 'a filtered developer task list',
    path: '/crp/developer?status=InReview',
    proof: (page: Page) =>
      page.locator('#main-content').getByRole('heading', { name: 'Developer Dashboard' }),
  },
  {
    name: 'the reviewer queue',
    path: '/crp/reviewer/my-tasks',
    proof: (page: Page) => page.getByRole('table'),
  },
  {
    name: 'admin user management',
    path: '/crp/admin/users',
    proof: (page: Page) => page.getByRole('table'),
  },
] as const;

test.describe('idle session expiry', () => {
  test('shows the signed-out screen on the screen the user left idle', async ({ page }) => {
    await signIn(page);
    const start = `/crp/developer/tasks/${TASK_ID}`;
    await page.goto(start);
    await expect(page.getByText(TASK_CODE).first()).toBeVisible();

    await idleForHoursWhileServerExpiresSession(page);
    await returnToTheTab(page);

    await expectSignedOutScreen(page);
    // Still on the user's screen: the redirect is theirs to trigger.
    expect(currentUrl(page)).toBe(start);

    // The session is already cleared behind the screen.
    const identity = await page.evaluate(
      (key) => window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key),
      IDENTITY_KEY,
    );
    expect(identity).toBeNull();
  });

  test('does not sign out a user whose session the server still accepts', async ({ page }) => {
    await signIn(page);
    const start = `/crp/developer/tasks/${TASK_ID}`;
    await page.goto(start);
    await expect(page.getByText(TASK_CODE).first()).toBeVisible();

    // Same three hours away, but the session is still valid server-side.
    await page.clock.fastForward('03:00:00');
    await returnToTheTab(page);

    await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/you’ve been signed out/i)).toHaveCount(0);
    expect(currentUrl(page)).toBe(start);
  });
});

test.describe('signing back in after an idle expiry', () => {
  for (const screen of SCREENS) {
    test(`returns the user to ${screen.name}`, async ({ page }) => {
      await signIn(page);
      await page.goto(screen.path);
      await expect(screen.proof(page)).toBeVisible();

      await idleForHoursWhileServerExpiresSession(page);
      await returnToTheTab(page);
      await expectSignedOutScreen(page);

      await page.getByRole('button', { name: /sign in again/i }).click();
      await expect(page).toHaveURL(/\/login$/);
      await fillAndSubmitLogin(page);

      // Back exactly where they were — path AND query string — not on Home.
      await expect.poll(() => currentUrl(page), { timeout: 20_000 }).toBe(screen.path);
      await expect(screen.proof(page)).toBeVisible();
      await expect(page.getByText(/you’ve been signed out/i)).toHaveCount(0);
    });
  }

  test('Back does not return to the sign-in form after the return trip', async ({ page }) => {
    await signIn(page);
    const start = `/crp/developer/tasks/${TASK_ID}`;
    await page.goto(start);
    await expect(page.getByText(TASK_CODE).first()).toBeVisible();

    await idleForHoursWhileServerExpiresSession(page);
    await returnToTheTab(page);
    await expectSignedOutScreen(page);
    await page.getByRole('button', { name: /sign in again/i }).click();
    await fillAndSubmitLogin(page);
    await expect.poll(() => currentUrl(page), { timeout: 20_000 }).toBe(start);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('returns the user to their screen when the browser was closed while idle', async ({
    page,
  }) => {
    // The other way back: the tab is reopened (a full page load) after the
    // session has died, rather than refocused.
    await signIn(page);
    const start = `/crp/developer/tasks/${TASK_ID}`;
    await page.goto(start);
    await expect(page.getByText(TASK_CODE).first()).toBeVisible();

    await idleForHoursWhileServerExpiresSession(page);
    await page.reload();
    await expectSignedOutScreen(page);
    expect(currentUrl(page)).toBe(start);

    await page.getByRole('button', { name: /sign in again/i }).click();
    await fillAndSubmitLogin(page);
    await expect.poll(() => currentUrl(page), { timeout: 20_000 }).toBe(start);
    await expect(page.getByText(TASK_CODE).first()).toBeVisible();
  });
});

test.describe('ordinary sign-in is unchanged', () => {
  test('a sign-in with no expired session behind it goes to the portal home', async ({
    page,
  }) => {
    await page.goto('/login');
    await fillAndSubmitLogin(page);
    await expect(page).toHaveURL(/\/crp$/);
  });
});
