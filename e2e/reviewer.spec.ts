import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './settleAnimations';
import { scrollUntilTabIsTheLowestReachablePoint } from './tabScroll';
import { expect, test, type Page } from '@playwright/test';

/**
 * The reviewer workspace, in a real browser.
 *
 * The rank gate (FL 2.9.2.5-01) is the most consequential rule in the product,
 * so it is verified here as well as in the unit tests — a disabled button is a
 * claim about the DOM, and only a browser can confirm it.
 */

const REVIEWER_EMAIL = 'pinsara.chandika@sebsaworld.com';
const PASSWORD = 'Sebsa@2026';

const BLOCKING_IMPACTS = ['critical', 'serious'];

async function signIn(page: Page, email = REVIEWER_EMAIL) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

/** Picks the first available task and lands on its review form. */
async function pickFirstTask(page: Page) {
  await page.goto('/crp/reviewer');
  await page.getByRole('table').waitFor();
  await page
    .getByRole('button', { name: /pick .* for review/i })
    .first()
    .click();
  await page.waitForURL(/\/reviewer\/tasks\//);
}

async function answerAllGeneralCheck(page: Page, answer: string) {
  const groups = page.locator('[role="radiogroup"]').filter({ hasText: 'Partially OK' });
  // `toHaveCount` auto-retries; `locator.count()` is a one-shot snapshot and
  // races the fetch that loads the questions.
  await expect(groups).toHaveCount(13);
  for (let i = 0; i < 13; i += 1) {
    await groups.nth(i).getByRole('radio', { name: answer, exact: true }).click();
  }
}

test.describe('reviewer queues', () => {
  test('shows the three tabs and the available queue', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/reviewer');

    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Reviewer Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: /my review tasks/i })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('picking a task moves it out of Available and into My Review Tasks', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();

    /*
     * Wait for the cell to have TEXT. `waitFor()` above resolves as soon as the
     * <table> exists, and `DataTable` renders its skeleton rows inside the real
     * table — so reading straight away can capture '' from a skeleton, and
     * `not.toContainText('')` at the end of this test can never pass because
     * every string contains the empty string.
     */
    const firstCell = page.getByRole('row').nth(1).locator('td').first();
    await expect(firstCell).not.toBeEmpty();
    const firstId = await firstCell.textContent();
    await page
      .getByRole('button', { name: /pick .* for review/i })
      .first()
      .click();
    await page.waitForURL(/\/reviewer\/tasks\//);

    /*
     * Navigate by clicking, not . A full page load re-imports the
     * mocks module and rebuilds the in-memory db from seed, so a  here
     * would silently discard the pick we just made and test nothing. Phase 2's
     * real API has no such constraint; this is a property of the Phase 1 mock.
     */
    await page.getByRole('link', { name: /back/i }).click();
    await page.getByRole('link', { name: /my review tasks/i }).click();
    await page.getByRole('table').waitFor();
    await expect(page.getByRole('table')).toContainText((firstId ?? '').trim());

    await page.getByRole('link', { name: /available tasks/i }).click();
    await page.getByRole('table').waitFor();
    await expect(page.getByRole('table')).not.toContainText((firstId ?? '').trim());
  });
});

test.describe('reviewer workspace navigation', () => {
  test('moving between reviewer tabs keeps the reader where they were', async ({ page }) => {
    // The third workspace on the shared `RouteTabs` mechanism. Developer covers
    // the other half of the rule — entering a workspace still opens at the top.
    await page.setViewportSize({ width: 1280, height: 700 });
    await signIn(page);
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();

    const history = page.getByRole('link', { name: /review history/i });
    const before = await scrollUntilTabIsTheLowestReachablePoint(page, history);

    await history.click();
    await page.waitForURL(/\/reviewer\/history$/);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'a reviewer tab change must not throw the reader back to the top',
      })
      .toBe(before);
  });
});

test.describe('the code review form', () => {
  test('renders all 13 General Check questions and the developer checklist', async ({ page }) => {
    await signIn(page);
    await pickFirstTask(page);

    await expect(page.getByText(/3\.1 general check/i)).toBeVisible();
    await expect(page.getByText('Answered 0/13')).toBeVisible();
    await expect(page.getByText(/developer quality checklist/i)).toBeVisible();
  });

  test('BLOCKS Approve at Rank 2 even when everything else is complete', async ({ page }) => {
    await signIn(page);
    await pickFirstTask(page);

    await answerAllGeneralCheck(page, 'OK');
    await page.getByLabel(/incorrect code and performance/i).fill('A real problem was found.');

    // Rank 1 first: Approve is available.
    await page.getByRole('radio', { name: /rank 1/i }).click();
    await expect(page.getByRole('button', { name: /approve task/i })).toBeEnabled();

    // Switching to Rank 2 must take Approve away, and say why in words —
    // a silently disabled button reads as a bug.
    await page.getByRole('radio', { name: /rank 2/i }).click();
    await expect(page.getByRole('button', { name: /approve task/i })).toBeDisabled();
    await expect(page.getByText(/approve is not available at rank 2 or rank 3/i)).toBeVisible();

    // And Request Changes still wants a screenshot at a defect rank.
    await expect(page.getByRole('button', { name: /request changes/i })).toBeDisabled();
    await expect(page.getByText(/attach at least one screenshot/i)).toBeVisible();
  });

  test('approves a clean review and returns to the queue', async ({ page }) => {
    await signIn(page);
    await pickFirstTask(page);

    await answerAllGeneralCheck(page, 'OK');
    await page.getByRole('radio', { name: /rank 1/i }).click();
    await page.getByLabel(/summary comments/i).fill('No issues found.');

    await page.getByRole('button', { name: /approve task/i }).click();

    await expect(page).toHaveURL(/\/reviewer$/);
    await page.goto('/crp/reviewer/history');
    await page.getByRole('table').waitFor();
    await expect(page.getByRole('table')).toContainText('Approved');
  });

  test('a defect answer demands written findings before either decision', async ({ page }) => {
    await signIn(page);
    await pickFirstTask(page);

    await answerAllGeneralCheck(page, 'OK');
    // Flip one to Not OK — FL 2.9.2.4-02 now requires findings.
    const groups = page.locator('[role="radiogroup"]').filter({ hasText: 'Partially OK' });
    await groups.first().getByRole('radio', { name: 'Not OK', exact: true }).click();
    await page.getByRole('radio', { name: /rank 1/i }).click();

    await expect(page.getByText(/describe the issues in detailed review findings/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /approve task/i })).toBeDisabled();

    await page.getByLabel(/incorrect code and performance/i).fill('Cursor selects the wrong view.');
    await expect(page.getByRole('button', { name: /approve task/i })).toBeEnabled();
  });
});

test.describe('reviewer accessibility and layout', () => {
  for (const width of [320, 768, 1024, 1440]) {
    test(`has no horizontal overflow at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page);
      await page.goto('/crp/reviewer');
      await page.getByRole('table').waitFor();

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return el === null ? 0 : el.scrollWidth - el.clientWidth;
      });
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1);
    });
  }

  for (const target of [
    { name: 'Available Tasks', path: '/crp/reviewer' },
    { name: 'Review History', path: '/crp/reviewer/history' },
  ]) {
    test(`${target.name} has no critical or serious violations`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page);
      await page.goto(target.path);
      await page.getByRole('table').waitFor();

      await settleAnimations(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));
      const report = blocking.map((v) => `[${v.impact ?? '?'}] ${v.id}: ${v.help}`).join('\n');

      expect(blocking, `\n${report}`).toEqual([]);
    });
  }

  test('Analytics has no critical or serious violations, contrast included', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/crp/reviewer/analytics');
    await page.getByRole('heading', { name: /my review analytics/i }).waitFor();

    /*
     * THE negative control for the chart accessibility contract.
     *
     * Every chart hides its SVG from assistive tech and keeps it out of the tab
     * order with an explicit `tabIndex={-1}`. That replaced `inert`, which did
     * the same job but also killed pointer events and made tooltips impossible.
     * If the replacement is ever weakened — a chart loses its `tabIndex`, or a
     * Recharts upgrade changes how the accessibility layer emits `tabindex` —
     * `aria-hidden-focus` fires here, which is exactly how the original defect
     * was found.
     */
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));
    const report = blocking.map((v) => `[${v.impact ?? '?'}] ${v.id}: ${v.help}`).join('\n');

    expect(blocking, `\n${report}`).toEqual([]);
  });

  test('no chart puts a focusable element inside a hidden subtree', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/crp/reviewer/analytics');
    await page.getByRole('heading', { name: /my review analytics/i }).waitFor();

    /*
     * Asserted directly as well as through axe, because this is the one
     * attribute the whole contract rests on and `0` is what the library does by
     * default.
     *
     * Every `[tabindex]` inside a hidden subtree, not just the root `<svg>`:
     * `Pie` emits a SECOND tabindex on its own `<g class="recharts-pie">` layer
     * from a separate `rootTabIndex` prop, so the surface being right said
     * nothing about the ring. That gap shipped and axe caught it; this is the
     * cheaper, more specific guard on the same rule.
     */
    const tabIndexes = await page
      .locator('[aria-hidden="true"] [tabindex]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('tabindex')));

    expect(tabIndexes.length).toBeGreaterThan(0);
    expect(tabIndexes.every((value) => value === '-1')).toBe(true);
  });

  test('the review form has no critical or serious violations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await pickFirstTask(page);

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

    expect(blocking, `\n${report}`).toEqual([]);
  });
});
