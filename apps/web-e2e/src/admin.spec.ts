import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './settleAnimations';
import { scrollUntilTabIsTheLowestReachablePoint } from './tabScroll';
import { expect, test, type Page } from '@playwright/test';

/**
 * The admin workspace, in a real browser.
 *
 * jsdom has now several times passed a build a browser rejected — a heading
 * rendered navy-on-purple, ink tokens failing WCAG AA, a Recharts SVG that took
 * focus while hidden from screen readers. None of those are visible to a runner
 * that computes neither colour nor layout, so every admin tab gets a pass here
 * too: contrast, no horizontal overflow at four widths, and the real journeys.
 */

const EMAIL = 'charith.widanapathirana@sebsaworld.com';
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

/**
 * Wait until no toast is on screen.
 *
 * Sonner renders bottom-right, over the last rows of every grid, and it stays
 * for a few seconds after a successful mutation. A click aimed at a row action
 * underneath it is intercepted rather than delivered — which surfaces as a
 * baffling "element is visible, enabled and stable" timeout naming the toast as
 * the thing that swallowed it.
 *
 * Waiting is right here rather than dismissing: the toast disappearing is part
 * of the behaviour under test, and clicking it away would hide a toast that
 * never left.
 */
async function waitForToastsToClear(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, {
    timeout: 15_000,
  });
}

/* ------------------------------------------- the unified checklist editor */

/** A category card; `last()` is the innermost section holding its own handle. */
function categoryCard(page: Page, name: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('button', { name: `Reorder category: ${name}`, exact: true }) })
    .last();
}

async function openCategory(page: Page, name: string) {
  await page.getByRole('button', { name: `Reorder category: ${name}`, exact: true }).waitFor();
  const expand = page.getByRole('button', { name: `Expand ${name}`, exact: true });
  if ((await expand.count()) > 0) await expand.click();
  await expect(page.getByRole('button', { name: `Collapse ${name}`, exact: true })).toBeVisible();
}

function questionHandles(page: Page, category: string) {
  return categoryCard(page, category).getByRole('button', { name: /^Reorder question \d+: / });
}

/** Question texts in rendered order, read from the handles' labels. */
async function questionOrder(page: Page, category: string): Promise<string[]> {
  const labels = await questionHandles(page, category).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? ''),
  );
  return labels.map((label) => label.replace(/^Reorder question \d+: /, ''));
}

/** Category names in rendered order. */
async function categoryOrder(page: Page): Promise<string[]> {
  const labels = await page
    .getByRole('button', { name: /^Reorder category: / })
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''));
  return labels.map((label) => label.replace(/^Reorder category: /, ''));
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

test.describe('admin workspace', () => {
  test('the tab strip deep-links each section', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin');
    await page.getByRole('table').waitFor();

    // Each tab is a real route, not a panel — that is what makes browser Back
    // and a pasted link work.
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText('dheliya.kankanamge@sebsaworld.com')).toBeVisible();

    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/users$/);
  });

  /**
   * Filters the admin task grid down to one code and returns its row.
   *
   * The grid pages at 15 over a seed with more tasks than that, sorted newest
   * first — so whether a given row is on page 1 is a property of the fixture
   * dates, not of the app. Reading rows off the first page broke these tests the
   * day tasks were added to `tasks.json`, for no reason connected to what they
   * assert.
   */
  async function taskRow(page: Page, taskCode: string) {
    await page.getByRole('table').waitFor();
    const search = page.getByRole('searchbox', { name: /search tasks/i });
    await search.fill(taskCode);
    return page.getByRole('row').filter({ hasText: taskCode });
  }

  test('assigns a reviewer and the task moves into review', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin');

    const row = await taskRow(page, 'BLOM-009');
    await row.getByRole('button', { name: /assign a reviewer to BLOM-009/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: /reviewer/i }).click();
    // BLOM-009 belongs to Hiruni, so the self-review bar must exclude them.
    await expect(page.getByRole('option', { name: 'Hiruni Wijethilaka' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Pinsara Chandika' }).click();
    await dialog.getByRole('button', { name: /^assign reviewer$/i }).click();

    await expect(dialog).toBeHidden();
    await expect(row.getByText('In Review')).toBeVisible();
  });

  test('keeps drafts private and never offers Delete on a task under review', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin');

    // Drafts are the developer's private work and are not in the admin grid.
    await taskRow(page, 'AASL-014');
    await expect(page.getByText(/no matching records/i)).toBeVisible();

    // A task in review carries cycles and findings that Reports counts, so it
    // may be cancelled but never destroyed.
    const inReview = await taskRow(page, 'BLOM-010');
    await expect(inReview.getByRole('button', { name: /cancel BLOM-010/i })).toBeVisible();
    await expect(inReview.getByRole('button', { name: /delete BLOM-010/i })).toHaveCount(0);
  });

  test('creates a customer with a chosen colour', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin/customers');
    await page.getByRole('table').waitFor();

    await page.getByRole('button', { name: /add customer/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name/i).fill('Northwind Traders');
    await dialog.getByRole('button', { name: /use teal/i }).click();
    await dialog.getByRole('button', { name: /^create customer$/i }).click();

    await expect(dialog).toBeHidden();
    // Scoped to the grid: the success toast says "Northwind Traders added.", so
    // an unscoped match resolves to one element or two depending purely on
    // whether the toast has faded yet.
    // `exact` on both: `getByText` matches substrings case-insensitively, so a
    // bare "NORTHW" also matches "Northwind Traders" in the neighbouring cell.
    const grid = page.getByRole('table');
    await expect(grid.getByText('Northwind Traders', { exact: true })).toBeVisible();
    // The code is derived from the name, never typed.
    await expect(grid.getByText('NORTHW', { exact: true })).toBeVisible();
  });

  /**
   * The drag itself, which only a real browser can drive.
   *
   * Native HTML5 drag-and-drop needs a `DataTransfer`, and jsdom has none — so
   * the jsdom suite covers the arrow-key route to the same `onDrop`, and the
   * pointer route is covered here. Between them both entry points are exercised.
   *
   * Scoped to Reservation, which holds three questions: one category, one page,
   * one sequence, and small enough that the assertion names the rows rather than
   * counting them.
   */
  test('reorders the question bank by dragging, and saves it once', async ({ page }) => {
    await signIn(page);

    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes('question-order')) {
        saves.push(request.postData() ?? '');
      }
    });

    await page.goto('/crp/admin/checklist');
    await openCategory(page, 'Reservation');

    const handles = questionHandles(page, 'Reservation');
    await expect(handles).toHaveCount(3);
    const before = await questionOrder(page, 'Reservation');

    /*
     * Native drag-and-drop: scroll both ends into view before measuring, move in
     * steps so `dragover` resolves an edge, and sleep before the drop because
     * Chromium runs a nested message loop while a native drag is in flight and
     * no auto-retrying assertion can run until it ends.
     */
    await handles.nth(2).scrollIntoViewIfNeeded();
    await handles.nth(0).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const source = await handles.nth(2).boundingBox();
    const target = await handles.nth(0).boundingBox();
    if (!source || !target) throw new Error('could not measure the drag');

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 25 });
    await page.waitForTimeout(300);
    await page.mouse.up();

    await expect
      .poll(() => questionOrder(page, 'Reservation'))
      .toEqual([before[2], before[0], before[1]]);

    // Nothing is written until the admin saves: arrange first, persist once.
    expect(saves).toHaveLength(0);
    const banner = page.getByRole('complementary', { name: /unsaved ordering changes/i });
    await expect(banner).toBeVisible();

    await banner.getByRole('button', { name: 'Save Changes' }).click();
    await expect(banner).toBeHidden({ timeout: 15_000 });

    // One request, carrying the whole category in its final sequence.
    expect(saves).toHaveLength(1);
    expect(JSON.parse(saves[0] ?? '{}')).toEqual({
      ids: ['q-reservation-3', 'q-reservation-1', 'q-reservation-2'],
    });

    // The saved order survives leaving the screen and coming back in-app.
    await page.getByRole('link', { name: 'Users' }).click();
    await page.waitForURL(/\/admin\/users$/);
    await page.getByRole('link', { name: 'Quality Checklist' }).click();
    await openCategory(page, 'Reservation');
    await expect
      .poll(() => questionOrder(page, 'Reservation'))
      .toEqual([before[2], before[0], before[1]]);
  });

  /**
   * The same drag on the category list, which moves whole cards and is saved by
   * a separate endpoint. The mechanical notes on the drag live on the question
   * test above.
   */
  test('reorders the categories by dragging, and saves the whole list once', async ({ page }) => {
    await signIn(page);

    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().endsWith('/checklist-categories/order')) {
        saves.push(request.postData() ?? '');
      }
    });

    await page.goto('/crp/admin/checklist');
    const handles = page.getByRole('button', { name: /^Reorder category: / });
    await handles.first().waitFor();
    const before = await categoryOrder(page);
    expect(before.length).toBeGreaterThanOrEqual(3);

    // The first category opens on arrival; collapsed cards keep both ends of
    // the drag on screen at once.
    await page.getByRole('button', { name: 'Collapse All' }).click();
    await handles.nth(2).scrollIntoViewIfNeeded();
    await handles.nth(0).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const source = await handles.nth(2).boundingBox();
    const target = await handles.nth(0).boundingBox();
    if (!source || !target) throw new Error('could not measure the drag');

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 25 });
    await page.waitForTimeout(300);
    await page.mouse.up();

    const arranged = [before[2], before[0], before[1], ...before.slice(3)];
    await expect.poll(() => categoryOrder(page)).toEqual(arranged);
    expect(saves).toHaveLength(0);

    const banner = page.getByRole('complementary', { name: /unsaved ordering changes/i });
    await banner.getByRole('button', { name: 'Save Changes' }).click();
    await expect(banner).toBeHidden({ timeout: 15_000 });

    /*
     * One request carrying EVERY id — not the three that moved. The server
     * derives every order value from array position, so a partial payload would
     * renumber a subset and leave the rest on their old values.
     */
    expect(saves).toHaveLength(1);
    const body = JSON.parse(saves[0] ?? '{}') as { ids: string[] };
    expect(body.ids).toHaveLength(before.length);

    // And it survives leaving the screen in-app.
    await page.getByRole('link', { name: 'Users' }).click();
    await page.waitForURL(/\/admin\/users$/);
    await page.getByRole('link', { name: 'Quality Checklist' }).click();
    await handles.first().waitFor();
    await expect.poll(() => categoryOrder(page)).toEqual(arranged);
  });

  /**
   * A blocked delete has to explain itself where the admin is looking.
   *
   * The refusal used to be a toast beside a still-open dialog, so it faded after
   * four seconds and left a Delete button that appeared to do nothing. Asserted
   * in a real browser because the jsdom harness mounts the route table without
   * `App`, and `Toaster` lives in `App` — so only here can "in the dialog, not in
   * a toast" actually be told apart.
   */
  test('says why a category holding questions cannot be deleted', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin/checklist');

    await categoryCard(page, 'Completion')
      .getByRole('button', { name: /delete category: completion/i })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^delete category$/i }).click();

    await expect(dialog.getByText(/still has questions/i)).toBeVisible();
    // Still open and still refusing, rather than closing on a failure as if it
    // had worked.
    await expect(dialog).toBeVisible();

    /*
     * The row is checked AFTER the dialog closes, not underneath it. Radix marks
     * the rest of the page `aria-hidden` while a modal is open, so a role-based
     * query for the grid behind it matches nothing — a failure that reads as
     * "the category was deleted" when the category is right there.
     */
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Reorder category: Completion', exact: true }),
    ).toBeVisible();
  });

  test('guards an unsaved order instead of persisting it', async ({ page }) => {
    await signIn(page);

    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') saves.push(request.url());
    });

    await page.goto('/crp/admin/checklist');
    const handles = page.getByRole('button', { name: /^Reorder category: / });
    await handles.first().waitFor();
    await page.getByRole('button', { name: 'Collapse All' }).click();
    const seeded = await categoryOrder(page);

    // Arrow keys rather than a drag: this test is about what happens AFTER the
    // move, and the pointer path has its own test above.
    await handles.nth(2).focus();
    await page.keyboard.press('ArrowUp');
    const arranged = await categoryOrder(page);
    expect(arranged).not.toEqual(seeded);
    const banner = page.getByRole('complementary', { name: /unsaved ordering changes/i });
    await expect(banner).toBeVisible();

    // 1 — leaving in-app is intercepted, and staying keeps the arrangement.
    await page.getByRole('link', { name: 'Users' }).click();
    const blocker = page.getByRole('dialog', { name: /discard unsaved changes/i });
    await blocker.getByRole('button', { name: 'Stay on Page' }).click();
    await expect(blocker).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/checklist$/);
    await expect(banner).toBeVisible();
    expect(await categoryOrder(page)).toEqual(arranged);

    // 2 — leaving the document (reload, close) raises the browser's own prompt.
    const prompt = new Promise<string>((resolve) => {
      page.once('dialog', (dialog) => {
        resolve(dialog.type());
        void dialog.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await prompt).toBe('beforeunload');

    // Through all of that, not one write. Saving is the only way to persist.
    expect(saves).toHaveLength(0);
  });

  test('drops the unsaved order when the session ends', async ({ page }) => {
    await signIn(page);

    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') saves.push(request.url());
    });

    await page.goto('/crp/admin/checklist');
    const handles = page.getByRole('button', { name: /^Reorder category: / });
    await handles.first().waitFor();
    await page.getByRole('button', { name: 'Collapse All' }).click();
    const seeded = await categoryOrder(page);

    await handles.nth(1).focus();
    await page.keyboard.press('ArrowUp');
    await expect(
      page.getByRole('complementary', { name: /unsaved ordering changes/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /account menu/i }).click();
    // Ending the session is not a navigation the editor can hold back.
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);

    // Signing back in shows the saved order; the arrangement went with the session.
    await page.getByLabel(/work email/i).fill(EMAIL);
    await page.getByLabel(/^password/i).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'));
    await page.getByRole('link', { name: /go to home/i }).click();
    await page.getByRole('link', { name: /admin/i }).first().click();
    await page
      .getByRole('navigation', { name: 'Admin Dashboard' })
      .getByRole('link', { name: 'Quality Checklist' })
      .click();
    await handles.first().waitFor();
    await expect.poll(() => categoryOrder(page)).toEqual(seeded);
    await expect(
      page.getByRole('complementary', { name: /unsaved ordering changes/i }),
    ).toHaveCount(0);
    expect(saves).toHaveLength(0);
  });

  test('offers no reorder handle on a grid that has not opted in', async ({ page }) => {
    /*
     * The other half of "optional". Users is the same `DataTable`, one tab away,
     * and must be untouched by the feature — a handle appearing here would mean
     * the prop had become a default.
     */
    await signIn(page);
    await page.goto('/crp/admin/users');
    await page.getByRole('table').waitFor();

    await expect(page.getByRole('button', { name: /reorder/i })).toHaveCount(0);
  });

  test('administers the quality checklist', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin/checklist');

    // Searching opens the categories that hold a match.
    await page.getByLabel('Search categories or questions').fill('views instead');
    await expect(page.getByText(/have you used views instead/i).first()).toBeVisible();

    await page.getByRole('button', { name: /manage task types/i }).click();
    const manager = page.getByRole('dialog', { name: 'Manage Task Types' });
    await expect(manager.getByText('Customization', { exact: true })).toBeVisible();

    // Deleting a task type that tasks already carry is refused, in the dialog.
    await manager.getByRole('button', { name: /delete task type: customization/i }).click();
    const confirm = page.getByRole('dialog', { name: /delete this task type/i });
    await confirm.getByRole('button', { name: /^delete task type$/i }).click();
    await expect(confirm.getByText(/deactivate it instead/i)).toBeVisible();

    // And the task type survives once the refusal is dismissed.
    await confirm.getByRole('button', { name: /^cancel$/i }).click();
    await expect(confirm).toBeHidden();
    await expect(manager.getByText('Customization', { exact: true })).toBeVisible();
  });

  test('handover: reviewer hands back, admin reassigns', async ({ page }) => {
    // Signed in as Charith, who holds all three roles — the reviewer half and
    // the admin half of this journey are the same person here, which is exactly
    // how the wireframes show one user wearing several hats.
    await signIn(page);

    /*
     * Everything after the first load is IN-APP navigation.
     *
     * `page.goto()` reloads the SPA, which rebuilds the in-memory MSW store from
     * seed — the pick and the handover would both be erased between steps and
     * the test would assert against a fresh database while appearing to pass
     * through a journey. Clicking links is the only way this flow tests anything.
     */
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();
    const available = page.getByRole('row').filter({ hasText: 'SEMCO-013' });
    await available.getByRole('button', { name: /pick/i }).click();

    /*
     * Picking navigates straight to the review page (FL 3.3), and waiting for
     * THAT is what makes the next step deterministic.
     *
     * Clicking "My review tasks" immediately raced the pick mutation two ways
     * at once: the tab changed while the button was still `aria-busy`, so the
     * row re-rendered under the next locator, and the success toast — bottom
     * right, exactly over the last row — intercepted the click that followed.
     */
    await expect(page).toHaveURL(/\/reviewer\/tasks\/[^/]+$/);
    await page.getByRole('link', { name: /^back to /i }).click();

    await page.getByRole('link', { name: /my review tasks/i }).click();
    await waitForToastsToClear(page);
    await page.getByRole('row').filter({ hasText: 'SEMCO-013' }).getByRole('button').last().click();
    await expect(page).toHaveURL(/\/reviewer\/tasks\/[^/]+$/);

    await page.getByRole('button', { name: /hand over/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^reason/i }).fill('Handing back for the e2e run.');
    await dialog.getByRole('button', { name: /^hand over review$/i }).click();
    await expect(dialog.getByText('Review Handed Over')).toBeVisible();

    // It is now in the admin queue, and NOT back in the open Available list,
    // which the page returns to on its own once the handover lands.
    await page.waitForURL(/\/crp\/reviewer$/);
    await expect(dialog).toBeHidden();
    await page.getByRole('table').waitFor();
    await expect(page.getByText('SEMCO-013')).toHaveCount(0);

    await page.getByRole('link', { name: /go to home/i }).click();
    await page.getByRole('link', { name: /admin/i }).first().click();
    await page.getByRole('link', { name: 'Handovers' }).click();

    await expect(page.getByText('SEMCO-013')).toBeVisible();
    await expect(page.getByText(/handing back for the e2e run/i)).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: 'SEMCO-013' });
    // The hand-over toast is still fading, and it sits over this row.
    await waitForToastsToClear(page);
    await row.getByRole('button', { name: /reassign SEMCO-013/i }).click();
    const reassign = page.getByRole('dialog');
    await reassign.getByRole('combobox', { name: /reviewer/i }).click();
    await page.getByRole('option', { name: 'Kavidu Dilshan' }).click();
    await reassign.getByRole('button', { name: /^reassign$/i }).click();

    await expect(reassign).toBeHidden();
    // Scoped to the grid: the success toast says almost the same words, so an
    // unscoped match resolves to two elements or one, depending on whether the
    // toast has faded — a race that made this pass for the wrong reason once.
    await expect(page.getByRole('table').getByText(/reassigned to kavidu dilshan/i)).toBeVisible();
  });

  test('reports the same numbers the metrics module computes', async ({ page }) => {
    // Reports is code-split (Recharts), and it waits on four queries before it
    // renders anything. Under four-worker contention the chunk fetch plus those
    // queries can exceed the 5s default assertion timeout — the page is correct,
    // it is simply the slowest route in the app to become interactive.
    test.slow();
    await signIn(page);
    await page.goto('/crp/admin/reports');
    await expect(page.getByRole('heading', { name: /reports & analytics/i })).toBeVisible({
      timeout: 20_000,
    });

    // Three donuts, eight KPI cards, three sub-tabs — the wireframe's shape.
    await expect(page.getByText('Task Status Distribution')).toBeVisible();
    await expect(page.getByText('Quality Ranking Distribution')).toBeVisible();
    await expect(page.getByText('Review Cycle Distribution')).toBeVisible();
    // Eight KPI cards, one of which is Approval Rate. Scoped to the first
    // because the sub-tab rows repeat the label per person.
    await expect(page.getByText('Approval Rate', { exact: true }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Reviewers' }).click();
    await expect(page.getByText(/reviewer activity/i)).toBeVisible();

    await page.getByRole('tab', { name: 'Customers' }).click();
    await expect(page.getByText(/customer overview/i)).toBeVisible();
  });
});

test.describe('admin workspace navigation', () => {
  test('moving between admin tabs keeps the reader where they were', async ({ page }) => {
    /*
     * Six tabs is the widest strip in the product, so this is the workspace
     * where being thrown back to the header on every tab click cost the most.
     * Entering the workspace still opens at the top — that half is covered in
     * `developer.spec.ts`; the mechanism is shared (`components/ui/Tabs.tsx`).
     */
    await page.setViewportSize({ width: 1280, height: 700 });
    await signIn(page);
    await page.goto('/crp/admin');
    await page.getByRole('table').waitFor();

    const users = page.getByRole('link', { name: /^users/i });
    const before = await scrollUntilTabIsTheLowestReachablePoint(page, users);

    await users.click();
    await page.waitForURL(/\/admin\/users$/);

    await expect
      .poll(() => page.evaluate(() => window.scrollY), {
        message: 'an admin tab change must not throw the reader back to the top',
      })
      .toBe(before);

    // Consecutive hops, because the offset is remembered per click rather than
    // once per workspace — a second tab change must capture its own.
    const checklist = page.getByRole('link', { name: /quality checklist/i });
    const beforeSecondHop = await scrollUntilTabIsTheLowestReachablePoint(page, checklist);

    await checklist.click();
    await page.waitForURL(/\/admin\/checklist$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(beforeSecondHop);
  });
});

test.describe('admin workspace layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`has no horizontal overflow at ${viewport.name} (${String(viewport.width)}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await signIn(page);
      await page.goto('/crp/admin');
      await page.getByRole('table').waitFor();

      // The ten-column grid scrolls inside its own container; the PAGE must not.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return el === null ? 0 : el.scrollWidth - el.clientWidth;
      });
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1);
    });
  }
});

test.describe('admin workspace accessibility', () => {
  const PAGES = [
    { name: 'Tasks', path: '/crp/admin' },
    { name: 'Users', path: '/crp/admin/users' },
    { name: 'Customers', path: '/crp/admin/customers' },
    { name: 'Quality Checklist', path: '/crp/admin/checklist' },
    { name: 'Handovers', path: '/crp/admin/handovers' },
    { name: 'Reports', path: '/crp/admin/reports' },
  ];

  for (const target of PAGES) {
    test(`${target.name} has no critical or serious violations, contrast included`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page);
      await page.goto(target.path);
      await page.getByRole('heading').first().waitFor();

      const { blocking, report } = await scan(page);
      expect(blocking, `\n${report}`).toEqual([]);
    });
  }
});
