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

/** Where the checklist screen keeps what the admin has arranged but not saved. */
const VIEW_KEY = 'sdp.checklistAdminView';

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

  test('offers Delete on a draft but not on a task under review', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin');

    const draft = await taskRow(page, 'AASL-014');
    await expect(draft.getByRole('button', { name: /delete AASL-014/i })).toBeVisible();

    // The control. A task in review carries cycles and findings that Reports
    // counts, so it may be cancelled but never destroyed.
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
    await page.getByRole('searchbox', { name: /search questions/i }).fill('Reservation');
    await page.getByRole('table').waitFor();

    const questionCells = page.getByRole('table').locator('tbody tr td:nth-child(2)');
    await expect(questionCells).toHaveCount(3);
    const before = await questionCells.allTextContents();

    const handles = page.getByRole('button', { name: /reorder question/i });
    await expect(handles).toHaveCount(3);

    /*
     * Let the filtered rows settle before measuring them.
     *
     * `<tbody>` is keyed on the visible row set, so typing in the search box
     * remounts it and re-runs the fade. A `boundingBox()` taken while that is in
     * flight is a position the row is about to leave, and `mouse.down` then
     * lands beside the handle rather than on it — which looks exactly like a
     * drag that silently did nothing.
     */
    await page.waitForTimeout(500);

    /*
     * Both ends scrolled into view BEFORE measuring.
     *
     *  reports viewport coordinates and does not scroll to get
     * them, so on a short window the third row's box is a position off the
     * bottom of the screen —  then goes somewhere the row is not,
     * the press lands on nothing, and the whole drag silently no-ops. It looks
     * identical to a broken feature, and it cost an afternoon to tell apart.
     */
    await handles.nth(2).scrollIntoViewIfNeeded();
    await page.getByRole('table').locator('tbody tr').first().scrollIntoViewIfNeeded();

    // Drag the last row onto the top edge of the first.
    const source = await handles.nth(2).boundingBox();
    const target = await page.getByRole('table').locator('tbody tr').first().boundingBox();
    if (!source || !target) throw new Error('could not measure the drag');

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();

    /*
     * `steps` is load-bearing, and 25 is not decoration.
     *
     * NATIVE drag-and-drop starts on movement, not on the button press: a single
     * jump from `mouse.down` to the target is delivered as a click and nothing
     * moves at all. The intermediate positions are also what produce the
     * `dragover` events that decide which edge of the target is closest — with
     * one jump the drop can arrive with no edge resolved.
     */
    await page.mouse.move(target.x + target.width / 2, target.y + 4, {
      steps: 25,
    });

    /*
     * A real sleep, and the one place in this suite that earns one.
     *
     * Chromium enters a nested message loop while a native drag is in flight, so
     * JS evaluation over CDP does not run — every auto-retrying assertion
     * (`toHaveClass`, `toBeVisible`) hangs until it times out, no matter what the
     * DOM says. `waitForTimeout` is driven by Playwright rather than the page, so
     * it is the only wait available between the last `dragover` and the drop.
     *
     * The drag FEEDBACK is therefore asserted after the fact, from the outcome,
     * and covered visually in the component tests instead.
     */
    await page.waitForTimeout(300);
    await page.mouse.up();

    await expect(questionCells.first()).toHaveText(before[2] ?? '');

    /*
     * Nothing has been written yet, and that is the whole design: the admin
     * arranges the final state first and persists it once. A request here would
     * mean a write per drop.
     */
    expect(saves).toHaveLength(0);
    await expect(page.getByText(/unsaved order/i)).toBeVisible();

    await page.getByRole('button', { name: /save order/i }).click();
    await expect(page.getByText(/unsaved order/i)).toBeHidden({
      timeout: 15_000,
    });

    // One request, carrying the whole category in its final sequence.
    expect(saves).toHaveLength(1);
    expect(JSON.parse(saves[0] ?? '{}')).toEqual({
      ids: ['q-reservation-3', 'q-reservation-1', 'q-reservation-2'],
    });

    /*
     * The saved order survives leaving the tab and coming back.
     *
     * In-app navigation, never `page.goto` — a reload rebuilds the MSW store
     * from seed, so a refresh-and-assert here would compare against a fresh
     * database and pass while proving nothing. `docs/testing.md` records that
     * trap; durable-across-reload persistence is a Phase 2 property.
     */
    await page.getByRole('tab', { name: /categories/i }).click();
    await page.getByRole('tab', { name: /^questions$/i }).click();
    await page.getByRole('searchbox', { name: /search questions/i }).fill('Reservation');

    await expect(questionCells.first()).toHaveText(before[2] ?? '');
    // Still a dense 1…n sequence after the move, not a gapped or duplicated one.
    await expect(page.getByRole('table').locator('tbody tr td:nth-child(5)')).toHaveText([
      '1',
      '2',
      '3',
    ]);
  });

  /**
   * The same drag on the second consumer of the prop.
   *
   * Categories is a flat list with no `canDrop`, where the question bank is
   * grouped and refuses a cross-category drop — so this is the case the optional
   * refusal callback leaves alone, and the one that would break first if
   * `DataTable` ever started assuming grouping. Every mechanical note about the
   * drag itself lives on the question test above; only the differences are
   * commented here.
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
    await page.getByRole('tab', { name: /categories/i }).click();
    await page.getByRole('table').waitFor();

    // Column 1 is the drag handle, so the name is the second cell and the order
    // number the fourth.
    const names = page.getByRole('table').locator('tbody tr td:nth-child(2)');
    const orders = page.getByRole('table').locator('tbody tr td:nth-child(4)');
    await expect(names).toHaveCount(9);
    const before = await names.allTextContents();

    const handles = page.getByRole('button', { name: /reorder category/i });
    await expect(handles).toHaveCount(9);

    await page.waitForTimeout(500);
    await handles.nth(2).scrollIntoViewIfNeeded();
    await page.getByRole('table').locator('tbody tr').first().scrollIntoViewIfNeeded();

    const source = await handles.nth(2).boundingBox();
    const target = await page.getByRole('table').locator('tbody tr').first().boundingBox();
    if (!source || !target) throw new Error('could not measure the drag');

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 4, {
      steps: 25,
    });
    await page.waitForTimeout(300);
    await page.mouse.up();

    await expect(names.first()).toHaveText(before[2] ?? '');
    expect(saves).toHaveLength(0);
    await expect(page.getByText(/unsaved order/i)).toBeVisible();

    await page.getByRole('button', { name: /save order/i }).click();
    await expect(page.getByText(/unsaved order/i)).toBeHidden({
      timeout: 15_000,
    });

    /*
     * One request carrying ALL NINE ids — not the three that moved, and not the
     * page. The server derives every order value from array position, so a
     * payload that covered part of the list would renumber a subset and leave
     * the rest on their old values.
     */
    expect(saves).toHaveLength(1);
    const body = JSON.parse(saves[0] ?? '{}') as { ids: string[] };
    expect(body.ids).toHaveLength(9);

    // Dense 1…9 afterwards: no gap, no duplicate, and no page starting again
    // at 1.
    await expect(orders).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9']);

    // And it survives leaving the tab — in-app, never `page.goto`, which would
    // rebuild the mock store from seed and prove nothing.
    await page.getByRole('tab', { name: /^questions$/i }).click();
    await page.getByRole('tab', { name: /categories/i }).click();
    await expect(names.first()).toHaveText(before[2] ?? '');
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
    await page.getByRole('tab', { name: /categories/i }).click();

    const row = page.getByRole('row').filter({ hasText: 'Completion' }).first();
    await row.getByRole('button', { name: /delete category: completion/i }).click();

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
    await expect(page.getByRole('table').getByText('Completion', { exact: true })).toBeVisible();
  });

  /**
   * An unsaved arrangement outliving the tab strip, the route and a reload.
   *
   * A real browser is the only place the reload half can be tested: the jsdom
   * suite can remount a route, but only Chromium can throw the whole document
   * away and prove the arrangement came back from `sessionStorage`.
   *
   * A reload also rebuilds the MSW store from seed, so the SAVED order is gone
   * afterwards — which is precisely why the assertion here is about the draft
   * and the banner, not about anything persisted server-side.
   */
  test('keeps an unsaved order across tabs, navigation and a reload', async ({ page }) => {
    await signIn(page);

    const saves: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') saves.push(request.url());
    });

    await page.goto('/crp/admin/checklist');
    await page.getByRole('tab', { name: /categories/i }).click();
    await page.getByRole('table').waitFor();

    const names = page.getByRole('table').locator('tbody tr td:nth-child(2)');
    await expect(names).toHaveCount(9);
    const seeded = await names.allTextContents();

    // Arrow keys rather than a drag: this test is about what happens AFTER the
    // move, and the pointer path has its own test above.
    await page
      .getByRole('button', { name: /reorder category/i })
      .nth(2)
      .focus();
    await page.keyboard.press('ArrowUp');

    const arranged = await names.allTextContents();
    expect(arranged).not.toEqual(seeded);
    await expect(page.getByText(/unsaved order/i)).toBeVisible();

    // 1 — another tab, which unmounts the panel.
    await page.getByRole('tab', { name: /^questions$/i }).click();
    await page.getByRole('table').waitFor();
    await page.getByRole('tab', { name: /categories/i }).click();
    await expect(page.getByText(/unsaved order/i)).toBeVisible();
    await expect(names).toHaveText(arranged);

    // 2 — another screen entirely, which unmounts the route.
    await page.getByRole('link', { name: /users/i }).first().click();
    await page.waitForURL(/\/admin\/users$/);
    await page.goto('/crp/admin/checklist');
    await expect(page.getByText(/unsaved order/i)).toBeVisible();
    await expect(names).toHaveText(arranged);

    // 3 — a reload, which is the only one `sessionStorage` is needed for. The
    // tab comes back too: a restored arrangement behind an unopened tab hides
    // the banner that says it exists.
    await page.reload();
    await expect(page.getByRole('tab', { name: /categories/i })).toHaveAttribute(
      'data-state',
      'active',
    );
    await expect(page.getByText(/unsaved order/i)).toBeVisible();
    await expect(names).toHaveText(arranged);

    // Through all of that, not one write. The batch save is still the only one.
    expect(saves).toHaveLength(0);
  });

  test('drops the unsaved order when the session ends', async ({ page }) => {
    /*
     * Sign-out clears the live store AND its written copy — `reset()` alone goes
     * through `persist`, which writes the emptied state straight back and
     * re-creates the key `clearUserStorage()` had just removed. Asserted here
     * because the next person to sign in on a shared browser must not inherit a
     * stranger's half-finished reordering.
     */
    await signIn(page);
    await page.goto('/crp/admin/checklist');
    await page.getByRole('tab', { name: /categories/i }).click();
    await page.getByRole('table').waitFor();

    await page
      .getByRole('button', { name: /reorder category/i })
      .nth(1)
      .focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByText(/unsaved order/i)).toBeVisible();
    await expect
      .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), VIEW_KEY))
      .not.toBeNull();

    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/);

    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), VIEW_KEY)).toBeNull();
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
    await page.getByRole('table').waitFor();

    await expect(page.getByText(/have you used views instead/i)).toBeVisible();

    await page.getByRole('tab', { name: /task types/i }).click();
    await expect(page.getByRole('cell', { name: 'Customization', exact: true })).toBeVisible();

    // Deleting a task type that tasks already carry is refused; the row stays.
    const row = page.getByRole('row').filter({ hasText: 'Customization' });
    await row.getByRole('button', { name: /delete task type: customization/i }).click();
    await page.getByRole('button', { name: /^delete task type$/i }).click();
    await expect(page.getByText(/deactivate it instead/i)).toBeVisible();

    // The dialog stays open on failure and Radix marks the rest of the page
    // aria-hidden, so the grid has to be reachable again before asserting the
    // row survived — that assertion is the point of the test.
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^cancel$/i })
      .click();
    await expect(page.getByRole('cell', { name: 'Customization', exact: true })).toBeVisible();
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
    await page.getByRole('link', { name: /^back$/i }).click();

    await page.getByRole('link', { name: /my review tasks/i }).click();
    await waitForToastsToClear(page);
    await page.getByRole('row').filter({ hasText: 'SEMCO-013' }).getByRole('button').last().click();
    await expect(page).toHaveURL(/\/reviewer\/tasks\/[^/]+$/);

    await page.getByRole('button', { name: /hand over/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^reason/i }).fill('Handing back for the e2e run.');
    await dialog.getByRole('button', { name: /^hand over$/i }).click();
    await expect(dialog).toBeHidden();

    // It is now in the admin queue, and NOT back in the open Available list.
    await page.getByRole('link', { name: /^back$/i }).click();
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
