import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { E2E_USERS, signIn } from '../support/app.ts';
import { settleAnimations } from '../support/settleAnimations.ts';

/**
 * Sign-in, session cookies and sign-out against the real NestJS API: the
 * HttpOnly session cookies, the CSRF token, and the server's generic answer for
 * a wrong password.
 */
test.describe('signing in', () => {
  test('signs in, lands on the portal home with the user named, and signs out', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, E2E_USERS.developer.email);
    await expect(page).toHaveURL(/\/crp$/);
    await expect(page.getByText(E2E_USERS.developer.name).first()).toBeVisible();

    // The session lives in HttpOnly cookies only; nothing readable by script.
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name === 'sdp_access')?.httpOnly).toBe(true);
    expect(cookies.find((cookie) => cookie.name === 'sdp_refresh')?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('sdp_access');

    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('button', { name: /^sign out$/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/crp');
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects a wrong password with the one generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/work email/i).fill(E2E_USERS.developer.email);
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('returns to the deep link that needed a sign-in', async ({ page }) => {
    await page.goto('/crp/admin/users');
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, E2E_USERS.admin.email);
    await expect(page).toHaveURL(/\/crp\/admin\/users$/);
  });
});

test.describe('accessibility', () => {
  for (const [label, email] of [
    ['login', null],
    ['portal home', E2E_USERS.admin.email],
  ] as const) {
    test(`${label} has no critical or serious axe violations`, async ({ page }) => {
      if (email === null) await page.goto('/login');
      else await signIn(page, email);
      await settleAnimations(page);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      );
      expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
});
