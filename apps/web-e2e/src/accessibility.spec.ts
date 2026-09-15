import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './settleAnimations';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility checked in a real browser.
 *
 * This complements the jsdom axe suite rather than duplicating it. jsdom does
 * not compute layout or colour, so `color-contrast` is silently skipped there —
 * which is how the login heading shipped as navy-on-purple past a green test
 * run. Only a real rendering engine can catch that class of defect.
 */

const BLOCKING_IMPACTS = ['critical', 'serious'];

async function scan(page: Page) {
  await settleAnimations(page);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));

  const report = blocking
    .map(
      (v) =>
        `[${v.impact ?? '?'}] ${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.html}`).join('\n'),
    )
    .join('\n\n');

  return { blocking, report };
}

test.describe('login page accessibility', () => {
  test('has no critical or serious violations, contrast included', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();

    const { blocking, report } = await scan(page);
    expect(blocking, `\n${report}`).toEqual([]);
  });

  test('stays clean in its error state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Enter your email address').waitFor();

    const { blocking, report } = await scan(page);
    expect(blocking, `\n${report}`).toEqual([]);
  });

  test('stays clean at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();

    const { blocking, report } = await scan(page);
    expect(blocking, `\n${report}`).toEqual([]);
  });
});

test.describe('portal home accessibility', () => {
  test('has no critical or serious violations after signing in', async ({ page }) => {
    // Signs in, then waits out a 4s toast before scanning.
    test.slow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByLabel(/work email/i).fill('hiruni.wijethilaka@sebsaworld.com');
    await page.getByLabel(/^password/i).fill('Sebsa@2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { level: 1 }).waitFor();

    /*
     * Wait for the "Signed in as …" toast to leave before scanning.
     *
     * A toast mid-fade has a fractional opacity, and axe blends that against the
     * background and reports a contrast failure for text that is perfectly legible
     * once the animation settles. The result was an intermittent `color-contrast`
     * violation that depended purely on how fast the machine was.
     *
     * Waiting rather than excluding the region: the toast's contrast IS worth
     * checking, just not while it is half transparent. Fully opaque it measures
     * ~15:1 (ink-900 on white), so a failure here only ever means "mid-fade".
     *
     * Waiting for it to APPEAR first is the load-bearing half — `toHaveCount(0)`
     * on its own passes instantly, before the toast has rendered, and the scan
     * then races it anyway. That is exactly how this flake survived a green run.
     */
    const toasts = page.locator('[data-sonner-toast]');
    // Sign-in ALWAYS raises a toast, so waiting for it is deterministic rather
    // than best-effort. A best-effort wait was not enough: under four-worker
    // contention the toast can take longer than the grace period to appear, the
    // wait gives up, the count is momentarily 0, and the scan then races it.
    await expect(toasts).toHaveCount(1, { timeout: 20_000 });
    await expect(toasts).toHaveCount(0, { timeout: 20_000 });

    const { blocking, report } = await scan(page);
    expect(blocking, `\n${report}`).toEqual([]);
  });
});
