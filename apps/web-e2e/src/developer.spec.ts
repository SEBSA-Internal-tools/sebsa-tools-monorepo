import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './settleAnimations';
import { scrollUntilTabIsTheLowestReachablePoint } from './tabScroll';
import { expect, test, type Page } from '@playwright/test';

/**
 * The developer workspace, in a real browser.
 *
 * jsdom has now twice passed a build that a browser rejected — a heading
 * rendered navy-on-purple, and ink tokens that failed WCAG AA app-wide. Neither
 * was visible to a runner that does not compute colour or layout. So every
 * screen gets a pass here too: contrast, no horizontal overflow at four widths,
 * and the full create-to-submit journey.
 */

const EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Sebsa@2026';

const VIEWPORTS = [
  { name: 'mobile', width: 320, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

const BLOCKING_IMPACTS = ['critical', 'serious'];

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

async function openFreshChecklist(page: Page, crimId: string) {
  await page.goto('/crp/developer/tasks/new/details');
  await page.getByRole('combobox', { name: /customer/i }).click();
  await page.getByRole('option', { name: 'AASL' }).click();
  await page.getByLabel(/crim id/i).fill(crimId);
  await page.getByRole('button', { name: /next: quality checklist/i }).click();
  await page.waitForURL(/\/developer\/tasks\/new\/checklist$/);
}

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

test.describe('developer workspace', () => {
  test('My Tasks renders the grid with real data', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/developer');

    // Scoped to the main region: the header bar and the page both name the
    // workspace, exactly as the wireframe draws it.
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: 'Developer Dashboard' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    /*
     * The count line must describe WHICH rows are rendered — a range, not the
     * size of the dataset behind them and not the configured page size. It read
     * "Showing 47 of 47 tasks" above a fifteen-row page once; this is what stops
     * that coming back.
     */
    const countLine = page.getByText(/showing \d+ to \d+ of \d+ tasks/i);
    await expect(countLine).toBeVisible();

    // And it agrees with the DOM. jsdom cannot check "the range matches what is
    // on screen" against a real layout; this can.
    const text = (await countLine.textContent()) ?? '';
    const [, from, to] = /showing (\d+) to (\d+) of/i.exec(text) ?? [];
    const rendered = await page.getByRole('table').locator('tbody tr').count();
    expect(Number(to) - Number(from) + 1).toBe(rendered);
  });

  test('filtering narrows the grid and the count line follows it', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/developer');
    await page.getByRole('table').waitFor();

    const countLine = page.getByText(/showing \d+ to \d+ of \d+ tasks/i);
    const before = await countLine.textContent();

    await page.getByLabel(/search tasks/i).fill('BLOM');
    await expect(countLine).not.toHaveText(before ?? '');

    // The range and the total both moved, and the range still matches the rows on
    // screen — the grid re-renders through a keyed `<tbody>` when a filter
    // changes, so this also proves the fade left no stale count behind it.
    const after = (await countLine.textContent()) ?? '';
    const [, from, to] = /showing (\d+) to (\d+) of/i.exec(after) ?? [];
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(
      Number(to) - Number(from) + 1,
    );
  });

  test('analytics is a real route, reachable and bookmarkable', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/developer');

    await page.getByRole('link', { name: /analytics/i }).click();
    await expect(page).toHaveURL(/\/developer\/analytics$/);

    // Every panel the Power App reference carries, so a missing one is a failure
    // rather than something nobody notices until it is reported.
    await expect(page.getByRole('heading', { name: /my analytics/i })).toBeVisible();
    for (const card of [
      /total submitted/i,
      /^approved$/i,
      /changes requested/i,
      /avg quality rank/i,
      /avg review cycles/i,
      /approval rate/i,
    ]) {
      await expect(page.getByText(card).first()).toBeVisible();
    }
    await expect(page.getByText(/my quality ranking/i)).toBeVisible();
    await expect(page.getByText(/my review cycles/i)).toBeVisible();
    await expect(page.getByText(/my tasks by status/i)).toBeVisible();
    await expect(page.getByText(/my performance by customer/i)).toBeVisible();

    // Back returns to the grid rather than leaving the workspace.
    await page.goBack();
    await expect(page).toHaveURL(/\/developer$/);
  });

  test('the wizard gates each step, then creates, submits and confirms', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/developer/tasks/new');
    await expect(page).toHaveURL(/\/developer\/tasks\/new\/details$/);

    // Step gating (acceptance scenario 1): the requirement panel is persistent
    // and Next is disabled until the step is satisfied.
    await expect(page.getByText(/before you can continue/i)).toBeVisible();
    const nextToChecklist = page.getByRole('button', {
      name: /next: quality checklist/i,
    });
    await expect(nextToChecklist).toBeDisabled();

    await page.getByRole('combobox', { name: /customer/i }).click();
    await page.getByRole('option', { name: 'AASL' }).click();
    await page.getByLabel(/crim id/i).fill('CRIM-E2E');

    // The derived title (FL 2.5-01) previews live in its read-only field.
    await expect(page.getByLabel(/^title/i)).toHaveValue('AASL - CRIM-E2E');

    await expect(nextToChecklist).toBeEnabled();
    await nextToChecklist.click();
    await expect(page).toHaveURL(/\/checklist$/);

    // No task type selected means no questions, not every question. The prompt
    // appears twice — in the questions card and in the progress panel — so this
    // asserts presence rather than uniqueness.
    await expect(page.getByText(/select at least one task type/i).first()).toBeVisible();

    const nextToReview = page.getByRole('button', {
      name: /next: review & submit/i,
    });
    await expect(nextToReview).toBeDisabled();

    // The checkbox itself is visually hidden inside its card, so the click
    // target is the label — which is what a real user clicks too.
    await page.getByRole('checkbox', { name: 'Quick Report' }).click({ force: true });
    await expect(page.getByRole('checkbox', { name: 'Quick Report' })).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Quick Reports' })).toBeVisible();
    await expect(page.getByText(/questions still unanswered/i)).toBeVisible();

    // Answer everything the selected type renders. One "No" so the flagged
    // treatment on the review step is exercised rather than assumed.
    const groups = page.getByRole('radiogroup');
    const count = await groups.count();
    for (let i = 0; i < count; i += 1) {
      await groups
        .nth(i)
        .getByRole('radio', { name: i === 0 ? 'No' : 'Yes' })
        .click();
    }

    await expect(nextToReview).toBeEnabled();
    await nextToReview.click();
    await expect(page).toHaveURL(/\/review$/);

    await expect(page.getByText(/ready to submit/i)).toBeVisible();
    await expect(page.getByText(/all requirements met/i)).toBeVisible();
    await expect(page.getByText(/1 issue in this section/i)).toBeVisible();

    await page.getByLabel(/note to reviewer/i).fill('Flagged intentionally.');

    /*
     * The review step used to carry a "Supporting Screenshots" dropzone, and
     * this test attached two files here.
     *
     * It was withdrawn at the business's request: the specification's screenshot
     * feature is the REVIEWER's Issue Screenshot Feedback (§2.9.2.6), covered in
     * `reviewer.spec.ts`, and a second upload surface on the developer's side
     * was scope the flow never asked for. Asserted as absent rather than simply
     * deleted, so it cannot quietly return.
     */
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByText(/screenshots added/i)).toHaveCount(0);

    await page.getByRole('button', { name: /submit for review/i }).click();

    // Screen 25.
    await expect(page).toHaveURL(/\/developer\/tasks\/new\/confirmed$/);
    await expect(page.getByRole('heading', { name: /submitted for review/i })).toBeVisible();
    await expect(page.getByText(/is now in the reviewer queue/i)).toBeVisible();

    await page.getByRole('link', { name: /view task/i }).click();
    await expect(page).toHaveURL(/\/developer\/tasks\/[^/]+$/);
    await expect(page.getByText('Submitted').first()).toBeVisible();

    // The task has left the developer's hands, so nothing on this screen is
    // editable — including any upload control.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  /**
   * The defect this whole model change fixes.
   *
   * The old seed mapped Reservation, Code, Security and Translations to every
   * task type, so a Configuration task rendered 24 questions instead of 8. These
   * counts come from the business's own document, so this test is an external
   * oracle, not a restatement of the implementation.
   */
  test('each task type renders exactly the questions the specification lists', async ({ page }) => {
    await signIn(page);
    await openFreshChecklist(page, 'CRIM-TYPE-MAPPING');

    const cases = [
      {
        taskType: 'Configuration',
        questions: 8,
        categories: ['Configurations', 'Unit Testing', 'Completion'],
      },
      {
        taskType: 'Quick Report',
        questions: 9,
        categories: ['Quick Reports', 'Unit Testing', 'Completion'],
      },
      {
        taskType: 'Upgrade Service',
        questions: 10,
        categories: ['Upgrade Quality', 'Unit Testing', 'Completion'],
      },
      {
        taskType: 'Customization',
        questions: 23,
        categories: [
          'Reservation',
          'Code',
          'Security',
          'Translations',
          'Unit Testing',
          'Completion',
        ],
      },
    ];

    for (const { taskType, questions, categories } of cases) {
      const checkbox = page.getByRole('checkbox', {
        name: taskType,
        exact: true,
      });
      await checkbox.click({ force: true });
      await expect(checkbox).toBeChecked();

      await expect(page.getByRole('radiogroup')).toHaveCount(questions);
      for (const category of categories) {
        await expect(page.getByRole('heading', { name: category, exact: true })).toBeVisible();
      }

      // Deselect before the next case so the counts are per-type, not cumulative.
      await checkbox.click({ force: true });
      await expect(checkbox).not.toBeChecked();
    }
  });

  test('Clear All confirms, clears the answers, and keeps the task types', async ({ page }) => {
    await signIn(page);
    await openFreshChecklist(page, 'CRIM-CLEAR-ALL');

    const taskType = page.getByRole('checkbox', {
      name: 'Quick Report',
      exact: true,
    });
    await taskType.click({ force: true });

    const firstAnswer = page.getByRole('radiogroup').first().getByRole('radio', { name: 'Yes' });
    await firstAnswer.click();
    await expect(firstAnswer).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: /clear all/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancelling leaves everything alone.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('radiogroup')).toHaveCount(9);
    await expect(firstAnswer).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: /clear all/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /clear all/i })
      .click();

    /*
     * The answer goes; the task type stays.
     *
     * Clearing the types as well used to leave the step showing "select at least
     * one task type" — the user asked to redo their answers and lost the whole
     * form. The nine questions still being on screen is the assertion that
     * matters, and it is what this test previously asserted the opposite of.
     */
    await expect(firstAnswer).toHaveAttribute('aria-checked', 'false');
    await expect(taskType).toBeChecked();
    await expect(page.getByRole('radiogroup')).toHaveCount(9);
    await expect(page.getByText(/select at least one task type/i)).toHaveCount(0);
  });

  test('the confirmation page cannot be reached directly', async ({ page }) => {
    await signIn(page);
    // No navigation state means no submission happened on this visit; showing a
    // confirmation for one would be a lie.
    await page.goto('/crp/developer/tasks/new/confirmed');
    await expect(page).toHaveURL(/\/developer$/);
  });

  test('a task detail page opens from the grid', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/developer');
    await page.getByRole('table').waitFor();

    await page.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(/\/developer\/tasks\/[^/]+$/);
    await expect(page.getByText(/task information/i)).toBeVisible();
    await expect(page.getByText(/task history/i)).toBeVisible();
  });

  test('a workspace card opens its dashboard at the top, and Back returns you', async ({
    page,
  }) => {
    /*
     * A data router does not reset scroll by itself — the document never
     * unloads, so `window.scrollY` persists across a client navigation. Home is
     * tall enough that its workspace cards sit below the fold, so before
     * `<ScrollRestoration />` every dashboard opened mid-page.
     *
     * 700px tall on purpose: at 900 the Home cards are already in view and the
     * test would prove nothing.
     */
    await page.setViewportSize({ width: 1280, height: 700 });
    await signIn(page);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const homeY = await page.evaluate(() => window.scrollY);
    expect(homeY, 'Home must be scrollable for this test to mean anything').toBeGreaterThan(0);

    await page
      .getByRole('link', { name: /Developer/ })
      .first()
      .click();
    await page.waitForURL(/\/developer$/);
    await page.getByRole('table').waitFor();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'the dashboard must open at the top',
      })
      .toBe(0);

    // Back restores where you were, rather than also snapping to the top — the
    // reason for `<ScrollRestoration />` over a hand-rolled `scrollTo(0, 0)`.
    await page.goBack();
    await page.waitForURL(/\/crp$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('a workspace tab keeps your place, unlike entering the workspace', async ({ page }) => {
    /*
     * The other half of the rule above, and the reason it needs its own test.
     *
     * Entering a workspace is a change of place and belongs at the top. Moving
     * between the tabs INSIDE one is not — the reader is comparing two panels of
     * the same dashboard, and sending them back to the header every time is the
     * behaviour this pair of tests pins down.
     *
     * `preventScrollReset` alone does not achieve it: measured here, the opt-out
     * on its own still landed at y=0, because the incoming panel is lazy and the
     * document is briefly shorter than the viewport. The offset is captured on
     * click and re-applied once the page has its height back — see
     * `app/useTabScrollPreservation.ts`.
     *
     * The offset is derived rather than picked — see the helper for why that
     * matters more than it looks like it should.
     */
    await page.setViewportSize({ width: 1280, height: 700 });
    await signIn(page);
    await page.goto('/crp/developer');
    await page.getByRole('table').waitFor();

    const analytics = page.getByRole('link', { name: /analytics/i });
    const before = await scrollUntilTabIsTheLowestReachablePoint(page, analytics);

    await analytics.click();
    await page.waitForURL(/\/developer\/analytics$/);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'a tab change must not throw the reader back to the top',
      })
      .toBe(before);

    // And Back is still React Router's, landing on the offset it remembered for
    // that entry rather than on the one we just restored.
    await page.goBack();
    await page.waitForURL(/\/developer$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test('a donut tooltip tracks the pointer and sits on the popover tier', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/crp/developer/analytics');
    await page.getByText(/my tasks by status/i).waitFor();

    /*
     * The only ring on the page with a centre label — "My Tasks by Status".
     * Selected structurally rather than by heading text, because the label and
     * the tooltip are siblings inside this exact `relative` box and that
     * relationship is the whole subject of the test.
     */
    const ring = page.locator('div.relative.shrink-0:has(p.font-display)').first();
    await ring.scrollIntoViewIfNeeded();
    await expect(ring).toHaveCount(1);

    // The arcs are still growing into place for ~420ms, and a bounding box read
    // mid-animation points the mouse at where a sector WAS. Settling first is
    // what makes the hover land.
    await settleAnimations(page);
    await expect(ring.locator('.recharts-pie-sector').first()).toBeVisible();

    const tooltip = ring.locator('.recharts-tooltip-wrapper').first();

    /** Hovers one arc and returns where the tooltip landed. */
    async function hoverArc(index: number) {
      const arc = ring.locator('.recharts-pie-sector').nth(index);
      await arc.hover({ force: true });
      await expect(tooltip).toBeVisible();
      return tooltip.boundingBox();
    }

    const first = await hoverArc(0);
    const second = await hoverArc(2);

    /*
     * TWO separate defects were fixed, so two separate assertions.
     *
     * 1. POSITION — `allowEscapeViewBox`. It defaults to false, which clamps the
     *    tooltip inside the chart's view box. The ring box is 168px and the
     *    tooltip card is 176px, so the clamp could never be satisfied:
     *    `getTooltipTranslateXY` fell through to `Math.max(negative, 0)` and
     *    pinned the tooltip to the box's top-left corner — over the centre
     *    number — no matter where the pointer was. Asserting it TRACKS THE
     *    POINTER is the precise negative control: before the fix both hovers
     *    produced the identical origin.
     */
    expect(first?.width ?? 0).toBeGreaterThan(0);
    expect(second?.width ?? 0).toBeGreaterThan(0);

    /*
     * HORIZONTAL movement, and only horizontal. This is the whole assertion, and
     * the looser version of it does not work.
     *
     * Clamped, `getTooltipTranslateXY` fell through to
     * `Math.max(coordinate.x - tooltipWidth - offset, viewBox.x)`, which on a
     * ring this small is `viewBox.x` for every arc — measured at a constant
     * `translateX: 5px` (PieChart's default margin) whichever sector you point
     * at. `translateY` meanwhile still varied with the pointer, so asserting
     * merely that the tooltip "moved" passes with the bug fully present; that
     * version was written first and its negative control stayed green.
     *
     * With the escape granted the same two hovers measured 72px and 35px.
     */
    expect(
      first?.x,
      'the tooltip has the same horizontal origin on two different arcs, so it is still clamped',
    ).not.toBe(second?.x);

    /*
     * 2. LAYERING — `wrapperStyle`. The tooltip wrapper and the centre-label
     *    overlay are positioned siblings at `z-index: auto`, so paint order
     *    followed the DOM and the label, being the later child, showed through
     *    the tooltip. It may still pass OVER the ring when you hover the far
     *    side — that is ordinary cursor-following behaviour — but it must be on
     *    top and opaque when it does, never merged with what is underneath.
     */
    await expect(tooltip).toHaveCSS('z-index', '50');
  });
});

test.describe('developer workspace layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`has no horizontal overflow at ${viewport.name} (${String(viewport.width)}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await signIn(page);
      await page.goto('/crp/developer');
      await page.getByRole('table').waitFor();

      // The grid itself scrolls inside its own container; the PAGE must not.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return el === null ? 0 : el.scrollWidth - el.clientWidth;
      });
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1);
    });
  }
});

test.describe('developer workspace accessibility', () => {
  const PAGES = [
    { name: 'My Tasks', path: '/crp/developer', ready: 'table' as const },
    {
      name: 'Analytics',
      path: '/crp/developer/analytics',
      ready: 'heading' as const,
    },
    {
      name: 'New Task wizard',
      path: '/crp/developer/tasks/new/details',
      ready: 'heading' as const,
    },
  ];

  for (const target of PAGES) {
    test(`${target.name} has no critical or serious violations, contrast included`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page);
      await page.goto(target.path);

      if (target.ready === 'table') await page.getByRole('table').waitFor();
      else await page.getByRole('heading').first().waitFor();

      const { blocking, report } = await scan(page);
      expect(blocking, `\n${report}`).toEqual([]);
    });
  }
});
