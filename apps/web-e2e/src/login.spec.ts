import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Sign-in verified in a real browser.
 *
 * jsdom tests proved the components and the router; they cannot prove that the
 * MSW service worker actually registers and intercepts, which is the one thing
 * that differs between the test environment and the browser the user opens.
 */

const SEEDED_EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const DEMO_PASSWORD = 'Sebsa@2026';

/** Fails the test on any console error, so a silent runtime break cannot pass. */
function failOnConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function signIn(page: Page) {
  await page.getByLabel(/work email/i).fill(SEEDED_EMAIL);
  await page.getByLabel(/^password/i).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('sign-in', () => {
  test('signs in and lands on the portal home with the user named', async ({ page }) => {
    const errors = failOnConsoleErrors(page);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page);

    await expect(page).toHaveURL('http://localhost:5175/crp');
    // The name must appear on the page, not just in storage.
    await expect(page.getByText('Hiruni Wijethilaka').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/code review/i);

    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('rejects a wrong password and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/work email/i).fill(SEEDED_EMAIL);
    await page.getByLabel(/^password/i).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('keeps the session across a reload when Remember me is checked', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/remember me/i)).toBeChecked();
    await signIn(page);
    await expect(page).toHaveURL('http://localhost:5175/crp');

    await page.reload();
    // Still signed in: no bounce back to /login.
    await expect(page).toHaveURL('http://localhost:5175/crp');
    await expect(page.getByText('Hiruni Wijethilaka').first()).toBeVisible();
  });

  test('returns to a deep link after signing in', async ({ page }) => {
    await page.goto('/crp/admin');
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe('login page does not scroll', () => {
  // Heights chosen to cover a laptop, a small laptop, and a tablet in portrait.
  const VIEWPORTS = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const viewport of VIEWPORTS) {
    test(`fits the viewport at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto('/login');
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return {
          vertical: el.scrollHeight - el.clientHeight,
          horizontal: el.scrollWidth - el.clientWidth,
        };
      });

      // A login screen should never scroll, in either direction.
      expect(overflow.vertical, 'page scrolls vertically').toBeLessThanOrEqual(1);
      expect(overflow.horizontal, 'page scrolls horizontally').toBeLessThanOrEqual(1);

      // The submit button must be reachable, not clipped by the no-scroll rule.
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();

      await page.screenshot({
        path: path.join(dirname, 'screenshots', `login-${viewport.name}.png`),
        fullPage: false,
      });
    });
  }
});

test.describe('motion preferences', () => {
  test('holds the decorative shapes still when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();

    // The global `prefers-reduced-motion` block collapses animation duration to
    // 0.01ms. Verifying the computed style is what proves the mitigation is
    // real rather than merely declared.
    //
    // Compared numerically, not as a string: Chromium serialises the same value
    // as "1e-05s" while the stylesheet declares "0.01ms".
    const durationsMs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-hidden="true"] span'))
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => d !== '0s' && d !== '')
        .map((d) => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)),
    );

    // There must BE animated shapes, or this test would pass vacuously on a
    // page that simply has none.
    expect(durationsMs.length).toBeGreaterThan(0);
    for (const ms of durationsMs) {
      expect(ms).toBeLessThan(1);
    }
  });

  test('animates the decorative shapes when motion is allowed', async ({ page }) => {
    // The negative control for the test above: with no reduced-motion
    // preference the shapes must genuinely be animating, otherwise the
    // reduced-motion assertion proves nothing.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();

    const durationsMs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-hidden="true"] span'))
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => d !== '0s' && d !== '')
        .map((d) => (d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000)),
    );

    expect(durationsMs.length).toBeGreaterThan(0);
    // Slow by design: nothing under ten seconds belongs behind a login form.
    for (const ms of durationsMs) {
      expect(ms).toBeGreaterThan(10_000);
    }
  });
});
