import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './settleAnimations';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 acceptance suite — the sign-off gate (plan §8).
 *
 * The workspace specs test each screen. This file walks the JOURNEYS the
 * business signs off on, end to end, and each test is numbered to the scenario
 * it discharges. It is deliberately redundant with those specs: a screen that
 * works in isolation and a hand-off that works across three roles are different
 * claims, and only the second one is what SEBSA is buying.
 *
 * **Scenario 2 is dropped.** It asserted that the single-page create form and
 * the wizard produce identical records; the single-page form was removed in
 * favour of the wizard alone, so there is no second flow to diverge. Scenario 1
 * carries that weight now.
 *
 * ## The rule that shapes every test here
 *
 * `page.goto()` reloads the SPA, and the MSW store rebuilds from seed on load.
 * Any journey that spans a `goto` is asserting against a fresh database while
 * appearing to walk a flow — it passes, and proves nothing. So each scenario
 * loads once and then moves through the app by clicking, including when it
 * changes user: sign-out and sign-in are client-side navigations and preserve
 * the store.
 */

const PASSWORD = 'Sebsa@2026';

const DEVELOPER = {
  email: 'hiruni.wijethilaka@sebsaworld.com',
  name: 'Hiruni Wijethilaka',
};
const REVIEWER = {
  email: 'pinsara.chandika@sebsaworld.com',
  name: 'Pinsara Chandika',
};
const ADMIN = {
  email: 'charith.widanapathirana@sebsaworld.com',
  name: 'Charith Widanapathirana',
};

const BLOCKING_IMPACTS = ['critical', 'serious'];

/** A real 1×1 PNG, so the size and type checks see an actual image. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** First sign-in of a test. The only place a full page load is allowed. */
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

/**
 * Changes user WITHOUT reloading, so the mock store survives.
 *
 * This is what makes a cross-role scenario possible at all: a developer submits,
 * a reviewer decides, the developer responds — three identities, one database.
 */
async function switchUser(page: Page, from: { name: string }, to: { email: string }) {
  await page
    .getByRole('button', {
      name: new RegExp(`${from.name} — account menu`, 'i'),
    })
    .click();
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/\/login$/);

  await page.getByLabel(/work email/i).fill(to.email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // NOT `waitForURL('/')`. Sign-in resumes the deep link the user was on before
  // being sent to /login, which is the behaviour the login work deliberately
  // added — so the only thing that is certain here is that /login is behind us.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

/** Enters a workspace from the home page — in-app, so no reload. */
async function openWorkspace(page: Page, workspace: 'Developer' | 'Reviewer' | 'Admin') {
  await page.getByRole('link', { name: /go to home/i }).click();
  await page
    .getByRole('link', { name: new RegExp(workspace, 'i') })
    .first()
    .click();
}

/** Adds one review comment on the reviewer assessment. */
async function addComment(page: Page, text: string) {
  await page
    .getByRole('button', { name: /add comment/i })
    .first()
    .click();
  await page
    .getByPlaceholder(/describe the actionable issue/i)
    .last()
    .fill(text);
}

/** Opens the decision, confirms it in the dialog, and waits for the success state. */
async function confirmDecision(page: Page, action: RegExp, outcome: string) {
  await page.getByRole('button', { name: action }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: action }).click();
  await expect(dialog.getByText(outcome, { exact: true })).toBeVisible();
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

test.describe('Phase 1 acceptance', () => {
  /**
   * Scenario 1 — create a task through the wizard, with step gating enforced at
   * every step. Carries the weight of the dropped scenario 2.
   */
  test('1 · the wizard gates each step and produces a real task', async ({ page }) => {
    await signIn(page, DEVELOPER.email);
    await page.goto('/crp/developer/tasks/new/details');

    const next = page.getByRole('button', { name: /next: quality checklist/i });
    await expect(next).toBeDisabled();

    await page.getByRole('combobox', { name: /customer/i }).click();
    await page.getByRole('option', { name: 'AASL' }).click();
    await page.getByLabel(/crim id/i).fill('CRIM-ACCEPT-1');
    // FL 2.5-01: the title is derived (customer-CRIM-version), never typed.
    const title = page.getByLabel('Generated Title');
    await expect(title).toHaveValue(/^AASL-CRIM-ACCEPT-1-\d+$/);
    await expect(title).not.toBeEditable();

    await expect(next).toBeEnabled();
    await next.click();

    // Step 2 gate: no task type means no questions, and Next stays shut.
    const toReview = page.getByRole('button', {
      name: /next: review & submit/i,
    });
    await expect(toReview).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Quick Report' }).click({ force: true });
    await expect(toReview).toBeDisabled();

    const groups = page.getByRole('radiogroup');
    await expect(groups).toHaveCount(9);
    for (let i = 0; i < 9; i += 1) {
      await groups.nth(i).getByRole('radio', { name: 'Yes' }).click();
    }

    await expect(toReview).toBeEnabled();
    await toReview.click();

    await page.getByRole('button', { name: /submit for review/i }).click();
    await expect(page).toHaveURL(/\/developer\/tasks\/new\/confirmed$/);
    await expect(page.getByRole('heading', { name: /submitted for review/i })).toBeVisible();
  });

  /**
   * Scenario 3 — a reviewer picks from Available; the task leaves that queue and
   * appears in My Review Tasks.
   */
  test('3 · picking moves a task from Available into My Review Tasks', async ({ page }) => {
    await signIn(page, REVIEWER.email);
    await page.goto('/crp/reviewer');
    const rows = page.getByRole('row');
    await expect.poll(() => rows.count()).toBeGreaterThan(1);

    /*
     * Wait for the cell to have TEXT, not just for the row to exist.
     * `DataTable` renders its skeleton rows inside the real <table>, so a row
     * count above 1 is satisfied while the grid is still loading. Reading here
     * without this returned '', and `getByText('')` then matches every node on
     * the page — the failure reads "expected 0, received 228", which points
     * nowhere near the actual cause.
     */
    const firstCell = rows.nth(1).locator('td').first();
    await expect(firstCell).not.toBeEmpty();
    const firstCode = (await firstCell.innerText()).trim();
    await page
      .getByRole('button', { name: /pick .* for review/i })
      .first()
      .click();
    await page.waitForURL(/\/reviewer\/tasks\//);

    // Once picked, the task is the reviewer's, so Back returns to where it now lives.
    await page.getByRole('link', { name: /^back to my review tasks$/i }).click();
    await page.waitForURL(/\/reviewer\/my-tasks/);
    await expect(page.getByRole('cell', { name: firstCode, exact: true })).toBeVisible();

    await page.getByRole('link', { name: /^available tasks/i }).click();
    await page.getByRole('table').waitFor();
    await expect(page.getByRole('cell', { name: firstCode, exact: true })).toHaveCount(0);
  });

  /**
   * Scenario 4 — the rank gate (FL 2.9.2.5-01) and the evidence rule
   * (FL 2.9.2.6-01), then Request Changes, then the cycle increment.
   */
  test('4 · Rank 2 blocks Approve, and Request Changes increments the cycle', async ({ page }) => {
    // A review, a screenshot and a confirmed decision under four parallel
    // workers; `slow()` triples the budget for this test only.
    test.slow();
    await signIn(page, REVIEWER.email);
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();

    // A clean cycle-1 task raised by someone else, so the outcome is predictable.
    const code = 'AIM-004';
    await page.getByRole('searchbox', { name: /search/i }).fill(code);
    await page
      .getByRole('row')
      .filter({ hasText: code })
      .getByRole('button', { name: /pick .* for review/i })
      .click();
    await page.waitForURL(/\/reviewer\/tasks\//);
    await page.getByRole('heading', { name: /reviewer assessment/i }).waitFor();

    await page.getByRole('radio', { name: /rank 2/i }).click();

    // Approve is gone at a defect rank.
    await expect(page.getByRole('button', { name: /approve task/i })).toBeDisabled();

    // Request Changes wants evidence: at least one written review comment, and
    // the screen says so rather than leaving a silently disabled button.
    const requestChanges = page.getByRole('button', { name: /request changes/i });
    await expect(requestChanges).toBeDisabled();
    await expect(page.getByText(/review comments required/i)).toBeVisible();

    await addComment(page, 'Cancellation path is missing.');
    // A screenshot is optional supporting evidence on a comment.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'defect.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });

    await expect(requestChanges).toBeEnabled();
    await confirmDecision(page, /request changes/i, 'Changes Requested');
    // The success state moves to Review History on its own (850ms); clicking its
    // button races that redirect, so wait for the destination instead.
    await page.waitForURL(/\/reviewer\/history/);

    // The cycle incremented — the one thing Request Changes does that Approve
    // does not (spec p.10).
    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row).toContainText('Changes Requested');
    await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  });

  /**
   * Scenario 5 — the full cross-role loop. Reviewer requests changes, the
   * DEVELOPER responds, and rejecting a finding without a reason is refused
   * (FL 2.11.2.3-01).
   */
  test('5 · a rejected finding demands a written reason before resubmission', async ({ page }) => {
    // The longest journey in the suite: a full review, a role switch, then the
    // developer's response — three identities against one database. See the
    // note on scenario 4.
    test.slow();
    await signIn(page, REVIEWER.email);
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();

    /*
     * Pick a task this scenario's DEVELOPER actually raised, rather than
     * whatever happens to be in row 1.
     *
     * The journey hands the task back to Hiruni halfway through and looks for it
     * in Hiruni's own grid, so picking the first available row only worked while
     * that row happened to be theirs. It stopped being theirs the moment other
     * developers' submitted tasks were added to the seed, and the failure
     * surfaced two steps later as "no such row" rather than as a bad pick.
     */
    const code = 'BLOM-009';
    await page.getByRole('searchbox', { name: /search tasks/i }).fill(code);
    await page
      .getByRole('row')
      .filter({ hasText: code })
      .getByRole('button', { name: /pick .* for review/i })
      .click();
    await page.waitForURL(/\/reviewer\/tasks\//);

    const findingText = 'The rollback branch is wrong.';
    await page.getByRole('heading', { name: /reviewer assessment/i }).waitFor();
    await page.getByRole('radio', { name: /rank 2/i }).click();
    await addComment(page, findingText);
    await confirmDecision(page, /request changes/i, 'Changes Requested');
    await page.waitForURL(/\/reviewer\/history/);

    // Hand over to the developer who raised it — no reload, so the review the
    // reviewer just submitted is still in the store.
    await switchUser(page, REVIEWER, DEVELOPER);
    await openWorkspace(page, 'Developer');
    await page.getByRole('table').waitFor();

    await page.getByRole('row').filter({ hasText: code }).getByRole('button').last().click();
    await expect(page).toHaveURL(/\/developer\/tasks\/[^/]+$/);
    await expect(page.getByText(/changes requested/i).first()).toBeVisible();

    // Reject without a reason: refused, in the words the spec mandates
    // (FL 2.11.2.3-01).
    // The finding card is the innermost block holding both the reviewer's text and its Reject action.
    const finding = page
      .locator('div')
      .filter({ hasText: findingText })
      .filter({ has: page.getByRole('button', { name: /^reject$/i }) })
      .last();
    await finding.getByRole('button', { name: /^reject$/i }).click();
    await finding.getByRole('button', { name: /save rejection/i }).click();

    await expect(page.getByText(/provide a reason when rejecting a review finding/i)).toBeVisible();

    // And resubmission stays shut while a rejection has no reason behind it.
    const resubmit = page.getByRole('button', { name: /resubmit for review/i });
    await expect(resubmit).toBeDisabled();

    await finding
      .getByRole('textbox', { name: /why are you rejecting/i })
      .fill('The rollback branch is intentional — see CRIM-118.');
    await finding.getByRole('button', { name: /save rejection/i }).click();

    await expect(page.getByText(/provide a reason when rejecting a review finding/i)).toHaveCount(
      0,
    );
  });

  /** Scenario 6 — a reviewer never sees their own submission in Available. */
  test('6 · a reviewer cannot pick up their own submission', async ({ page }) => {
    await signIn(page, REVIEWER.email);
    await page.goto('/crp/reviewer');
    await page.getByRole('table').waitFor();

    // Every row in Available must name someone else as the developer. Enforced
    // server-side; this asserts the consequence a user would actually see.
    const developerNames = await page.getByRole('row').locator('td:nth-child(5)').allTextContents();
    expect(developerNames).not.toContain(REVIEWER.name);
  });

  /** Scenario 7 — an admin cancels a task and the grid follows. */
  test('7 · an admin cancels a task and the grid updates', async ({ page }) => {
    await signIn(page, ADMIN.email);
    await page.goto('/crp/admin');
    await page.getByRole('table').waitFor();

    // Search first: the grid pages at 15 rows and there are 30-odd tasks, so a
    // bare row lookup depends on which page the fixture happens to land on.
    // This is also what an admin looking for one task actually does.
    await page
      .getByLabel(/search/i)
      .first()
      .fill('SEMCO-012');

    const row = page.getByRole('row').filter({ hasText: 'SEMCO-012' });
    await row.getByRole('button', { name: /cancel SEMCO-012/i }).click();

    // Nothing changes until the confirmation is answered, with a reason.
    await expect(page.getByText(/cancel this task\?/i)).toBeVisible();
    const confirm = page.getByRole('button', { name: /^cancel task$/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/reason for cancellation/i).fill('Withdrawn by the customer.');
    await confirm.click();

    await expect(row.getByText('Cancelled')).toBeVisible();
    // And a cancelled task can no longer be cancelled again.
    await expect(row.getByRole('button', { name: /cancel SEMCO-012/i })).toHaveCount(0);
  });

  /**
   * Scenario 8 — the wizard is completable by keyboard alone, and axe finds
   * nothing critical or serious.
   */
  test('8 · the wizard is keyboard-traversable and axe-clean', async ({ page }) => {
    await signIn(page, DEVELOPER.email);
    await page.goto('/crp/developer/tasks/new/details');
    await page.getByRole('heading').first().waitFor();

    // Drive the customer picker entirely from the keyboard.
    const customer = page.getByRole('combobox', { name: /customer/i });
    await customer.focus();
    await page.keyboard.press('Enter');

    /*
     * Wait for the listbox rather than firing keys into the opening animation:
     * Radix moves focus into a portal, and keystrokes sent before it lands go
     * nowhere. Waiting for it to close again is what proves a selection was
     * made.
     *
     * Visible is not the same as ready. `ArrowDown` sent between the listbox
     * painting and Radix highlighting an option is swallowed, so `Enter` then
     * arrives with nothing to commit and the menu simply stays open — which is
     * how this failed under parallel load. `data-highlighted` is Radix's own
     * marker for "keyboard navigation has landed", and it is precisely what
     * this test exists to prove.
     */
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="option"][data-highlighted]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(listbox).toBeHidden();

    await expect(customer).not.toHaveText(/select a customer/i);

    const crimId = page.getByLabel(/crim id/i);
    await crimId.focus();
    await page.keyboard.type('CRIM-KEYS');

    const next = page.getByRole('button', { name: /next: quality checklist/i });
    await expect(next).toBeEnabled();
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/checklist$/);

    // A task type is a checkbox in a card; Space must toggle it.
    const quickReport = page.getByRole('checkbox', { name: 'Quick Report' });
    await quickReport.focus();
    await page.keyboard.press('Space');
    await expect(quickReport).toBeChecked();

    // The three answers are one radio group: one Tab stop, arrow keys move the
    // choice, and the newly focused option is selected immediately.
    const firstAnswers = page.getByRole('radiogroup').first();
    const yes = firstAnswers.getByRole('radio', { name: 'Yes' });
    await yes.focus();
    await page.keyboard.press('Space');
    await expect(yes).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(firstAnswers.getByRole('radio', { name: 'No' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const { blocking, report } = await scan(page);
    expect(blocking, `\n${report}`).toEqual([]);
  });
});
