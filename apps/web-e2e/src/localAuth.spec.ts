import { expect, test, type Page } from '@playwright/test';

/**
 * Temporary local sign-in, in a real browser: no env flag, guest-only screens,
 * and the onboarding loop from "Add user" to a first sign-in.
 *
 * The mock API keeps password links in page memory (never storage), so a full
 * `page.goto` starts over with only the fixed QA links (`demo-*`, see
 * `mocks/passwordLinks.ts`). Where a test needs a link minted earlier in the
 * same page, it follows it with a client-side navigation instead.
 */

const NEW_PASSWORD = 'Zebra-Kettle-42!';
const DEMO_PASSWORD = 'Sebsa@2026';

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function choosePassword(page: Page, password: string) {
  await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  await page.getByLabel(/^new password/i).fill(password);
  await page.getByLabel(/^confirm password/i).fill(password);
  await page.getByRole('button', { name: 'Save password' }).click();
}

/** Follows an in-app URL without reloading, as a router link would. */
async function navigateInApp(page: Page, url: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);
}

test.describe('guest-only screens', () => {
  test('are reachable signed out, with no configuration', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();

    await page.goto('/link-expired');
    await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible();
  });

  test('send a signed-in user to the CRP home', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'hiruni.wijethilaka@sebsaworld.com', DEMO_PASSWORD);
    await expect(page).toHaveURL('http://localhost:5175/crp');

    for (const path of ['/forgot-password', '/set-password#token=demo-invite', '/login']) {
      await page.goto(path);
      await expect(page).toHaveURL('http://localhost:5175/crp');
    }
  });
});

test.describe('set password', () => {
  test('an invite link activates the account and the user can sign in', async ({ page }) => {
    await page.goto('/set-password#token=demo-invite');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    // The token leaves the address bar as soon as the screen reads it.
    await expect(page).toHaveURL('http://localhost:5175/set-password');
    await expect(page.locator('meta[name="referrer"][content="no-referrer"]')).toHaveCount(1);

    await choosePassword(page, NEW_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

    await signIn(page, 'new.starter@sebsaworld.com', NEW_PASSWORD);
    await expect(page).toHaveURL('http://localhost:5175/crp');
  });

  test('an expired link offers a new one', async ({ page }) => {
    await page.goto('/set-password#token=demo-expired-invite');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page).toHaveURL(/\/link-expired$/);

    await page.getByRole('button', { name: 'Send me a new link' }).click();
    await expect(page.getByText(/A new link is on its way/)).toBeVisible();
  });

  test('a used or unknown link explains itself', async ({ page }) => {
    for (const token of ['demo-used', 'made-up-token']) {
      await page.goto(`/set-password#token=${token}`);
      await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible();
    }
  });
});

test.describe('onboarding', () => {
  test('admin adds a user, who follows the emailed link and signs in', async ({ page }) => {
    const outbox: string[] = [];
    page.on('console', (message) => {
      const match = /\[dev outbox\] Invite for onboard\.e2e@sebsaworld\.com: (\S+)/.exec(
        message.text(),
      );
      if (match?.[1]) outbox.push(match[1]);
    });

    await page.goto('/login');
    await signIn(page, 'qa.admin@sebsaworld.com', DEMO_PASSWORD);
    await expect(page).toHaveURL('http://localhost:5175/crp');
    await page.goto('/crp/admin/users');

    await page.getByRole('button', { name: /add user/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name/i).fill('Onboard E2E');
    await dialog.getByLabel(/email/i).fill('onboard.e2e@');
    await dialog.getByLabel(/email/i).blur();
    await expect(
      dialog.getByText('Enter a valid email address, for example name@company.com'),
    ).toBeVisible();
    await dialog.getByLabel(/email/i).fill('Onboard.E2E@sebsaworld.com');
    await dialog.getByRole('checkbox', { name: 'Developer' }).click();
    await dialog.getByRole('button', { name: /^create user$/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('searchbox', { name: /search users/i }).fill('onboard.e2e');
    const row = page.getByRole('row', { name: /onboard\.e2e@sebsaworld\.com/ });
    await expect(row.getByText('Invited')).toBeVisible();
    await expect.poll(() => outbox.length).toBe(1);

    // Sign out, then open the emailed link in the same page (see file header).
    await page.evaluate(() => {
      window.localStorage.removeItem('sdp.mock-user-id');
      window.sessionStorage.removeItem('sdp.mock-user-id');
    });
    await page.goto('/login'); // reload: signed out, but the minted link is now gone
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    // A reload forgets in-memory links, so ask for a fresh one the way a user
    // whose email went missing would: Forgot password re-sends an invite.
    const fresh: string[] = [];
    page.on('console', (message) => {
      const match = /\[dev outbox\] Invite for onboard\.e2e@sebsaworld\.com: (\S+)/.exec(
        message.text(),
      );
      if (match?.[1]) fresh.push(match[1]);
    });
    await page.getByRole('link', { name: /forgot password/i }).click();
    // The screen is lazy-loaded: wait for it, or the fill lands on the login form.
    await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
    await page.getByLabel(/email/i).fill('onboard.e2e@sebsaworld.com');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect.poll(() => fresh.length).toBe(1);

    await navigateInApp(page, fresh[0]!.replace('http://localhost:5175', ''));
    await choosePassword(page, NEW_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to sign in' }).click();

    await signIn(page, 'onboard.e2e@sebsaworld.com', NEW_PASSWORD);
    await expect(page).toHaveURL('http://localhost:5175/crp');
  });
});
