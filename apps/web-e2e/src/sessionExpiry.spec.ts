import { expect, test, type Page } from '@playwright/test';

/**
 * What the user sees when their session dies while the app is open.
 *
 * The reported defect was "This page ran into a problem" — the route error
 * boundary — instead of being told the session had ended.
 *
 * HOW THIS IS TRIGGERED, AND WHY NOT BY BACKDATING THE DEADLINE
 * Backdating `expiresAt` and firing a focus event does NOT reproduce it: the
 * `/auth/me` query has a five-minute `staleTime`, so focus does not refetch it,
 * and a 401 on a list query is not an expiry — only the principal failing is. In
 * the real report the user had been away long enough for `/auth/me` to be stale
 * too, which is not something a test should sit and wait for.
 *
 * Storing a session for an account the server will not accept reaches the same
 * code path deterministically and models a real case in its own right: an account
 * deactivated or a token revoked while the tab sat open, and on the Phase 2
 * backend, a genuinely expired token. The app boots believing it is signed in —
 * the stored mock identity is present — and `/auth/me` answers 401 in-page, which
 * is exactly the sequence that used to crash.
 *
 * The two-hour timer reaches the same `expireSession()` and is covered in
 * `src/app/sessionLifecycle.test.tsx`, where the clock can be controlled.
 */

const EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Sebsa@2026';
// `MOCK_IDENTITY_KEY` in `apps/web/src/lib/apiClient.ts`: read from sessionStorage, then localStorage.
const IDENTITY_KEY = 'sdp.mock-user-id';
const DRAFT_KEY = 'sdp.taskDraft';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

/**
 * Leaves a stored identity naming an account the server rejects, then reloads so
 * the app boots trusting it.
 */
async function rejectTheStoredSession(page: Page, path: string) {
  await page.evaluate((key) => {
    window.sessionStorage.setItem(key, 'u-revoked-account');
    window.localStorage.setItem(key, 'u-revoked-account');
  }, IDENTITY_KEY);

  await page.goto(path);
}

test.describe('session expiry', () => {
  test('explains the timeout rather than crashing the page', async ({ page }) => {
    await signIn(page);
    await rejectTheStoredSession(page, '/crp/developer');

    await expect(page.getByText(/you’ve been signed out/i)).toBeVisible({
      timeout: 20_000,
    });

    // The defect, asserted as absent.
    await expect(page.getByText(/this page ran into a problem/i)).toHaveCount(0);
    // And not the old misleading message either.
    await expect(page.getByText(/authentication failed/i)).toHaveCount(0);

    // Informative, not just a bounce: what happened, and what was done.
    await expect(page.getByText(/your secure sign-in has expired/i)).toBeVisible();
    await expect(page.getByText(/have been cleared/i)).toBeVisible();

    // Deliberately still on the route the user was on — the redirect is theirs to
    // trigger, which is what makes the explanation readable.
    await expect(page).toHaveURL(/\/developer$/);
  });

  test('clears the session and the wizard draft before the screen appears', async ({ page }) => {
    await signIn(page);

    // A half-finished task. This used to survive a sign-out, so the next person
    // to sign in on a shared browser inherited a stranger's work.
    await page.goto('/crp/developer/tasks/new/details');
    await page.getByRole('combobox', { name: /customer/i }).click();
    await page.getByRole('option', { name: 'AASL' }).click();
    await page.getByLabel(/crim id/i).fill('CRIM-EXPIRY');
    await expect
      .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), DRAFT_KEY))
      .not.toBeNull();

    await rejectTheStoredSession(page, '/crp/developer');
    await expect(page.getByText(/you’ve been signed out/i)).toBeVisible({
      timeout: 20_000,
    });

    const stored = await page.evaluate(
      ({ identity, draft }) => ({
        identity: window.sessionStorage.getItem(identity) ?? window.localStorage.getItem(identity),
        draft: window.sessionStorage.getItem(draft),
      }),
      { identity: IDENTITY_KEY, draft: DRAFT_KEY },
    );
    expect(stored.identity).toBeNull();
    expect(stored.draft).toBeNull();
  });

  test('takes the user to the login form, with its notice, on request', async ({ page }) => {
    await signIn(page);
    await rejectTheStoredSession(page, '/crp/developer');

    await expect(page.getByRole('button', { name: /sign in again/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /sign in again/i }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    // The reminder outlives the screen.
    await expect(page.getByText(/you’ve been signed out/i)).toBeVisible();
  });
});
