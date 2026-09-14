import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { signInForTest } from '@/test/setup.ts';
import { server } from '@/test/mswServer.ts';
import { routes } from '@/app/routes.tsx';
import { db } from '@/mocks/db.ts';
import {
  CHECKLIST_VIEW_STORAGE_KEY,
  useChecklistAdminView,
} from '../hooks/useChecklistAdminView.ts';

/**
 * Admin ▸ Quality Checklist.
 *
 * The rule under test throughout: **the checklist is the quality gate, so
 * nothing a developer has already answered may be destroyed.** Retiring hides a
 * question from new checklists; deleting is reserved for rows nobody has used.
 * Both halves are asserted, because only the refusal proves the guard exists.
 */

const ADMIN = 'u-charith';

function renderChecklist() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(routes, {
    initialEntries: ['/crp/admin/checklist'],
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...utils, router, user: userEvent.setup({ delay: null }) };
}

/**
 * The Add button is disabled until the bank has loaded — a question needs a
 * category to belong to. Waiting for a real row is what makes that deterministic
 * rather than a race the test sometimes wins.
 */
async function waitForBank() {
  await screen.findByText(/have you reserved the files before starting/i);
}

/**
 * Opens the Add Question form and returns the dialog.
 *
 * Everything inside is queried through it: the grid behind carries a "Question"
 * column header and its own "Add Question" button, so unscoped queries match
 * two elements and pick the wrong one.
 */
async function openQuestionForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add Question' }));
  return screen.findByRole('dialog');
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('tab', { name }));
}

/**
 * The grid `<tr>` holding this question, found the only way that actually works.
 *
 * Two traps, both of which produced tests that passed while asserting nothing:
 *
 * 1. **The form's own `<textarea>` matches the text.** `findByText` resolves
 *    against it the instant it is typed, so an assertion made straight after
 *    Add Question succeeds before the mutation has even been sent — and would go
 *    on succeeding if the create silently failed. Hence waiting for the dialog
 *    to close first: that is the only signal that the server said yes.
 * 2. **The bank pages at 15 over 29 seeded questions.** A question appended to a
 *    late category lands on page 2, so scanning the rendered page finds nothing
 *    even when the create worked perfectly.
 *
 * Filtering to the row settles both.
 */
async function gridRowFor(user: ReturnType<typeof userEvent.setup>, needle: string) {
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  const search = screen.getByRole('searchbox', { name: /search questions/i });
  await user.clear(search);
  await user.type(search, needle);

  // `exact: false`, because the needle is a fragment of a full question and the
  // default string matcher compares the whole normalised text content.
  const cell = await screen.findByText(needle, { exact: false });
  const row = cell.closest('tr');
  if (row === null) throw new Error(`No grid row for "${needle}"`);
  return row;
}

beforeEach(() => {
  signInForTest(ADMIN);

  /*
   * The view store persists, so it leaks between tests.
   *
   * `setup.ts` clears `sessionStorage` after every test, which removes the
   * WRITTEN copy and nothing else — the live Zustand state survives in the
   * module for the whole file. Without this reset, one test's search term
   * filters the next test's grid to nothing and one test's open tab decides
   * where the next one starts, which surfaces as a dozen unrelated timeouts.
   * `editTask.test.tsx` resets the wizard draft for the same reason.
   */
  useChecklistAdminView.getState().reset();
});

describe('quality checklist administration', () => {
  it('lists the question bank with its categories and task types', async () => {
    renderChecklist();

    expect(await screen.findByText(/have you used views instead/i)).toBeInTheDocument();
    // The category and the task types are columns, so a question's applicability
    // is visible without opening it.
    expect(screen.getAllByText('Quick Reports').length).toBeGreaterThan(0);
  });

  it('pages the question bank and follows the row-count control', async () => {
    const { user } = renderChecklist();
    await waitForBank();

    // Twenty-nine seeded questions at fifteen a page. This grid used to be the
    // one call site in the product that passed `rowCountSelector={false}`, which
    // left the LONGEST administered list as the only checklist tab without the
    // control the other two have.
    expect(await screen.findByText('Showing 1 to 15 of 29 questions')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    // The end is clamped to the total: "16 to 29", never "16 to 30".
    expect(await screen.findByText('Showing 16 to 29 of 29 questions')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '50' }));

    /*
     * A larger page recomputes the range AND corrects the page index: page 2 no
     * longer exists at 50 a page, and without that correction the grid would sit
     * on an out-of-range page rendering nothing.
     */
    expect(await screen.findByText('Showing 1 to 29 of 29 questions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();

    // The search filters OUTSIDE the table, so the range has to follow the
    // filtered rows rather than the seeded total.
    await user.type(screen.getByRole('searchbox', { name: /search questions/i }), 'views');
    expect(await screen.findByText('Showing 1 to 1 of 1 questions')).toBeInTheDocument();
  });

  it('adds a question and makes it available to the chosen task types', async () => {
    const { user } = renderChecklist();
    await waitForBank();

    const dialog = await openQuestionForm(user);

    await user.type(
      within(dialog).getByRole('textbox', { name: /^Question/ }),
      'Have you recorded the rollback plan?',
    );
    await user.click(within(dialog).getByRole('combobox', { name: 'Category' }));
    // Radix renders its listbox in a portal, so the option is outside `dialog`.
    await user.click(await screen.findByRole('option', { name: 'Completion' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Quick Report' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add Question' }));

    /*
     * Through `gridRowFor`, not a bare `findByText`.
     *
     * This assertion used to read the form's own `<textarea>` — the text was
     * there the moment it was typed, so it passed before the request was sent
     * and would have kept passing if the create had failed outright. The row is
     * also on page 2 of a 15-row grid, so it was never on screen to be found.
     */
    const row = await gridRowFor(user, 'rollback plan');
    expect(within(row).getByText('Completion')).toBeInTheDocument();
    expect(within(row).getByText('Quick Report')).toBeInTheDocument();
  });

  it('refuses a question that targets no task type', async () => {
    const { user } = renderChecklist();
    await waitForBank();

    const dialog = await openQuestionForm(user);
    await user.type(within(dialog).getByRole('textbox', { name: /^Question/ }), 'Orphan question');
    await user.click(within(dialog).getByRole('button', { name: 'Add Question' }));

    // A question applying to nothing would sit in the bank invisible to every
    // developer — a silent no-op row.
    expect(await screen.findByText(/select at least one task type/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /*
   * Order collisions.
   *
   * `order` is unique only within a category and only by convention, so the
   * interesting cases are all about what happens when the admin asks for a slot
   * that is taken. Quick Reports holds 1 and 2; 2 is `q-quick-reports-2`, which
   * seeded checklists have answers for.
   */
  describe('an order that is already taken', () => {
    async function submitAt(user: ReturnType<typeof userEvent.setup>, order: string) {
      const dialog = await openQuestionForm(user);

      await user.type(
        within(dialog).getByRole('textbox', { name: /^Question/ }),
        'Have you checked the report filters?',
      );
      await user.click(within(dialog).getByRole('combobox', { name: 'Category' }));
      await user.click(await screen.findByRole('option', { name: 'Quick Reports' }));
      await user.click(within(dialog).getByRole('checkbox', { name: 'Quick Report' }));
      await user.clear(within(dialog).getByRole('spinbutton', { name: /order/i }));
      await user.type(within(dialog).getByRole('spinbutton', { name: /order/i }), order);
      await user.click(within(dialog).getByRole('button', { name: 'Add Question' }));
    }

    it('asks which placement was meant, naming the category and the occupant', async () => {
      const { user } = renderChecklist();
      await waitForBank();

      await submitAt(user, '2');

      // Neither outcome is guessable from "order 2 is taken", so the modal has to
      // say which question is in the way and which category it is in.
      expect(await screen.findByText(/order 2 is already in use/i)).toBeInTheDocument();
      expect(screen.getByText(/another question in quick reports/i)).toBeInTheDocument();
      expect(
        screen.getByText(/have you used &AO\. prefix in all method calls and view calls\?/i),
      ).toBeInTheDocument();
    });

    it('keeps both and pushes the occupant one place later', async () => {
      const { user } = renderChecklist();
      await waitForBank();

      await submitAt(user, '2');
      await user.click(await screen.findByRole('button', { name: /keep both/i }));

      const addedRow = await gridRowFor(user, 'report filters');
      expect(within(addedRow).getByText('2')).toBeInTheDocument();

      // The occupant moved 2 → 3 rather than being destroyed or left sharing the
      // slot. That renumbering is the whole point of this branch.
      const occupantRow = await gridRowFor(user, 'prefix in all method calls');
      expect(within(occupantRow).getByText('3')).toBeInTheDocument();

      // Only the SELECTED category renumbers. Code has its own question at 2,
      // and `order` is category-scoped, so it must not have moved.
      const untouched = await gridRowFor(user, 'AQS code commenting');
      expect(within(untouched).getByText('2')).toBeInTheDocument();
    });

    it('refuses to replace an occupant developers have already answered', async () => {
      const { user } = renderChecklist();
      await waitForBank();

      await submitAt(user, '2');
      await user.click(await screen.findByRole('button', { name: /replace it/i }));

      /*
       * The guard that makes this branch safe, and the reason it is asserted
       * rather than assumed.
       *
       * Replace is a delete with extra steps, so it answers to ADR-0006's rule:
       * a question inside a submitted quality gate cannot be destroyed, however
       * it is being destroyed. Six seeded checklists carry an answer to this
       * one. Without the guard, the create route would be the way around the
       * check the DELETE route enforces.
       *
       * Asserted through the grid rather than the toast: this harness mounts the
       * route table directly, and sonner's `<Toaster>` lives in `App`, so no
       * toast is rendered here to read.
       */

      // The choice modal closes but the FORM stays open, still holding what was
      // typed, so the admin can pick a different order and try again. Being sent
      // back to an empty form after a refusal would be a second failure.
      await waitFor(() => {
        expect(screen.queryByText(/order 2 is already in use/i)).toBeNull();
      });

      const form = screen.getByRole('dialog');
      expect(within(form).getByRole('textbox', { name: /^Question/ })).toHaveValue(
        'Have you checked the report filters?',
      );
      await user.click(within(form).getByRole('button', { name: /^cancel$/i }));

      const occupantRow = await gridRowFor(user, 'prefix in all method calls');
      expect(within(occupantRow).getByText('2')).toBeInTheDocument();

      // And nothing was created in its place — a refusal that still inserted
      // would be worse than one that silently replaced.
      const search = screen.getByRole('searchbox', {
        name: /search questions/i,
      });
      await user.clear(search);
      await user.type(search, 'report filters');
      expect(screen.queryByText('report filters', { exact: false })).toBeNull();
    });

    it('still appends silently when no order is given', async () => {
      const { user } = renderChecklist();
      await waitForBank();

      // The control. Only an EXPLICIT collision prompts; the ordinary path is
      // unchanged and must not have gained a dialog.
      const dialog = await openQuestionForm(user);
      await user.type(
        within(dialog).getByRole('textbox', { name: /^Question/ }),
        'Have you checked the report filters?',
      );
      await user.click(within(dialog).getByRole('combobox', { name: 'Category' }));
      await user.click(await screen.findByRole('option', { name: 'Quick Reports' }));
      await user.click(within(dialog).getByRole('checkbox', { name: 'Quick Report' }));
      await user.click(within(dialog).getByRole('button', { name: 'Add Question' }));

      const addedRow = await gridRowFor(user, 'report filters');
      // One past the highest in the category, which held 1 and 2.
      expect(within(addedRow).getByText('3')).toBeInTheDocument();
    });
  });

  it('retires an answered question instead of offering to destroy it', async () => {
    const { user } = renderChecklist();

    const cell = await screen.findByText(/have you used views instead/i);
    const row = cell.closest('tr');
    if (row === null) throw new Error('No row for the Quick Reports question');

    await user.click(within(row).getByRole('button', { name: /^retire question/i }));
    await user.click(await screen.findByRole('button', { name: /^retire question$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Retired rows stay listed — this grid is where they are restored from.
    const retired = (await screen.findByText(/have you used views instead/i)).closest('tr');
    if (retired === null) throw new Error('Question vanished from the admin grid');
    await waitFor(() => {
      expect(within(retired).getByText('Inactive')).toBeInTheDocument();
    });
  });

  it('creates a category, then a task type', async () => {
    const { user } = renderChecklist();

    await openTab(user, /categories/i);
    await user.click(await screen.findByRole('button', { name: /add category/i }));
    await user.type(await screen.findByLabelText(/name/i), 'Performance');
    await user.click(screen.getByRole('button', { name: /^add category$/i }));

    expect(await screen.findByText('Performance')).toBeInTheDocument();

    await openTab(user, /task types/i);
    await user.click(await screen.findByRole('button', { name: /add task type/i }));
    await user.type(await screen.findByLabelText(/name/i), 'Data Migration');
    await user.click(screen.getByRole('button', { name: /^add task type$/i }));

    expect(await screen.findByText('Data Migration')).toBeInTheDocument();
  });

  it('refuses to delete a category that still has questions', async () => {
    const { user } = renderChecklist();

    await openTab(user, /categories/i);

    const cell = await screen.findByText('Completion');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No Completion row');

    await user.click(within(row).getByRole('button', { name: /delete category: completion/i }));
    const confirm = await screen.findByRole('button', {
      name: /^delete category$/i,
    });
    await user.click(confirm);

    await waitFor(() => {
      expect(confirm).toHaveAttribute('aria-busy', 'false');
    });

    // Emptying a category is a decision to make question by question, not
    // something one Delete click should do silently.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Completion')).toBeInTheDocument();

    /*
     * And the reason is READABLE, in the dialog that is still open.
     *
     * This is the assertion that would have failed before the refusal moved
     * inline: it used to be a toast that faded after four seconds, leaving an
     * open dialog whose Delete button looked broken. The server's own wording is
     * asserted rather than a generic one because it names the remedy.
     */
    expect(within(dialog).getByText(/still has questions/i)).toBeInTheDocument();
  });

  it('deletes a category once its questions are gone', async () => {
    // The control for the refusal above. Without it, a guard that refused
    // EVERY delete would pass the previous test just as happily.
    db.checklistTemplate = db.checklistTemplate.map((category) =>
      category.id === 'cat-completion' ? { ...category, questions: [] } : category,
    );

    const { user } = renderChecklist();
    await openTab(user, /categories/i);

    const row = (await screen.findByText('Completion')).closest('tr');
    if (row === null) throw new Error('No Completion row');

    await user.click(within(row).getByRole('button', { name: /delete category: completion/i }));
    await user.click(await screen.findByRole('button', { name: /^delete category$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(db.checklistTemplate.some((category) => category.id === 'cat-completion')).toBe(false);
  });

  it('refuses to delete a task type that tasks already use', async () => {
    const { user } = renderChecklist();

    await openTab(user, /task types/i);

    const cell = await screen.findByText('Customization');
    const row = cell.closest('tr');
    if (row === null) throw new Error('No Customization row');

    await user.click(
      within(row).getByRole('button', {
        name: /delete task type: customization/i,
      }),
    );
    const confirm = await screen.findByRole('button', {
      name: /^delete task type$/i,
    });
    await user.click(confirm);

    await waitFor(() => {
      expect(confirm).toHaveAttribute('aria-busy', 'false');
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Customization')).toBeInTheDocument();
    // Named in the dialog, not in a toast — same rule as the category above.
    expect(
      within(dialog).getByText(/used by existing tasks|still target this task type/i),
    ).toBeInTheDocument();
  });

  it('refuses to delete a question developers have already answered, and says so', async () => {
    const { user } = renderChecklist();
    await waitForBank();

    const row = (await screen.findByText(/have you reserved the files/i)).closest('tr');
    if (row === null) throw new Error('No row for the reservation question');

    await user.click(within(row).getByRole('button', { name: /^delete question:/i }));
    const confirm = await screen.findByRole('button', {
      name: /^delete question$/i,
    });
    await user.click(confirm);

    await waitFor(() => {
      expect(confirm).toHaveAttribute('aria-busy', 'false');
    });

    // ADR-0006's rule, stated where the admin is looking. The third tab gets the
    // same inline treatment as the two above; leaving one of the three on a
    // vanishing toast is the inconsistency this pass exists to remove.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/already answered this question/i)).toBeInTheDocument();
    expect(
      db.checklistTemplate.some((category) =>
        category.questions.some((question) => question.id === 'q-reservation-1'),
      ),
    ).toBe(true);
  });
});

/**
 * Drag reordering, minus the drag.
 *
 * The pointer half is native HTML5 drag and jsdom has no `DataTransfer`, so the
 * drop path is covered in `e2e/admin.spec.ts`. The arrow keys reach the SAME
 * `onDrop` a drop does — one code path, two entry points — so everything that
 * matters about the feature is assertable here: that nothing is written until
 * Save, what is written when it is, that a failure keeps the arrangement, and
 * that the server refuses a partial sequence.
 */
describe('reordering the question bank', () => {
  /** The Reservation rows, in the order the grid currently shows them. */
  async function reservationHandles(user: ReturnType<typeof userEvent.setup>) {
    await waitForBank();
    const search = screen.getByRole('searchbox', { name: /search questions/i });

    /*
     * Pasted, not typed.
     *
     * `user.type` delivers eleven keystrokes and each one re-filters 29 rows and
     * remounts the keyed `<tbody>`; a paste is one input event, and is what a
     * real user does with a term they already know.
     *
     * Worth about a second across the file, and no more — measured, because the
     * obvious assumption is that the keystrokes dominate and they do not. This is
     * the slowest file in the suite because each test mounts the entire route
     * tree, which is the cost of testing through the real router and is not
     * something a helper can optimise away.
     */
    await user.click(search);
    await user.paste('Reservation');

    return screen.findAllByRole('button', { name: /reorder question/i });
  }

  /** The persisted order, read straight off the mock store. */
  function orderOf(categoryId: string) {
    const category = db.checklistTemplate.find((entry) => entry.id === categoryId);
    return category?.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((question) => [question.id, question.order]);
  }

  const SEEDED = [
    ['q-reservation-1', 1],
    ['q-reservation-2', 2],
    ['q-reservation-3', 3],
  ];

  it('writes nothing until Save Order, then sends one request for the category', async () => {
    const { user } = renderChecklist();

    const saves: { url: string; body: unknown }[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'PATCH') return;
      const { url } = request;
      void request
        .clone()
        .json()
        .then((body: unknown) => saves.push({ url, body }));
    });

    const handles = await reservationHandles(user);
    handles[2]!.focus();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');

    // Two moves, and the bank is untouched. A request per drop is exactly what
    // this design exists to avoid.
    expect(saves).toHaveLength(0);
    expect(orderOf('cat-reservation')).toEqual(SEEDED);

    await user.click(await screen.findByRole('button', { name: /save order/i }));

    await waitFor(() => {
      expect(orderOf('cat-reservation')).toEqual([
        ['q-reservation-3', 1],
        ['q-reservation-1', 2],
        ['q-reservation-2', 3],
      ]);
    });

    // ONE request, carrying the whole final sequence — not one per move and not
    // one per row. Ids only: the order numbers are the server's to derive, which
    // is what makes a duplicate unrepresentable.
    expect(saves).toHaveLength(1);
    expect(saves[0]?.url).toMatch(/checklist-categories\/cat-reservation\/question-order$/);
    expect(saves[0]?.body).toEqual({
      ids: ['q-reservation-3', 'q-reservation-1', 'q-reservation-2'],
    });
  });

  it('renumbers densely, so the sequence stays 1…n', async () => {
    const { user } = renderChecklist();

    const handles = await reservationHandles(user);
    handles[0]!.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('button', { name: /save order/i }));

    await waitFor(() => {
      expect(orderOf('cat-reservation')?.map(([, order]) => order)).toEqual([1, 2, 3]);
    });
  });

  it('clears the unsaved banner once the server confirms', async () => {
    const { user } = renderChecklist();

    const handles = await reservationHandles(user);
    handles[1]!.focus();
    await user.keyboard('{ArrowUp}');

    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save order/i }));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved order/i)).not.toBeInTheDocument();
    });
  });

  it('restores the persisted order on Cancel, without a request', async () => {
    const { user } = renderChecklist();

    const handles = await reservationHandles(user);
    handles[2]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved order/i)).not.toBeInTheDocument();
    });
    // Cancel is a local discard: nothing was written, so there is nothing to
    // undo server side and nothing to request.
    expect(orderOf('cat-reservation')).toEqual(SEEDED);
  });

  it('keeps the local arrangement when the save fails', async () => {
    const { user } = renderChecklist();

    server.use(
      http.patch('/api/checklist-categories/:categoryId/question-order', () =>
        HttpResponse.json(
          { code: 'SERVER_ERROR', message: 'Could not save the order.' },
          { status: 500 },
        ),
      ),
    );

    const handles = await reservationHandles(user);
    handles[2]!.focus();
    await user.keyboard('{ArrowUp}');

    await user.click(await screen.findByRole('button', { name: /save order/i }));

    /*
     * The banner STAYS, and Save stays available. Treating a failed save as done
     * would tell the admin their order is persisted while the bank still holds
     * the old one, and the arrangement they built would be gone with no way to
     * retry it.
     *
     * Asserted as state rather than as the error toast: this harness mounts
     * `routes`, not `App`, and `Toaster` lives in `App` — so a toast assertion
     * here would match nothing and pass for the wrong reason, which is the trap
     * `docs/testing.md` records under "Toaster lives in App".
     */
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save order/i })).toBeEnabled();
    });
    expect(screen.getByText(/unsaved order/i)).toBeInTheDocument();
    expect(orderOf('cat-reservation')).toEqual(SEEDED);
  });

  it('refuses a sequence that does not cover the whole category', async () => {
    // The server's own guard, reached directly. A client that sent only the rows
    // on its current page would renumber a subset and orphan the rest — this is
    // the check that makes that unrepresentable rather than merely unlikely.
    const response = await fetch('/api/checklist-categories/cat-reservation/question-order', {
      method: 'PATCH',
      headers: {
        'X-Mock-User-Id': ADMIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ['q-reservation-3', 'q-reservation-1'] }),
    });

    expect(response.status).toBe(422);
    expect(orderOf('cat-reservation')).toEqual(SEEDED);
  });
});

/**
 * The other two tabs, which are the same panel twice.
 *
 * Categories and Task Types render one `NamedRecordPanel` with different copy
 * and different mutations, so each behaviour is asserted on whichever tab makes
 * it cheapest to reach, and the wiring that differs — the endpoint, the noun,
 * the store it writes to — is asserted on both.
 */
describe('ordering the administered lists', () => {
  /** Every PATCH the app sends, with its body, in the order it was sent. */
  function recordSaves() {
    const saves: { url: string; body: unknown }[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'PATCH') return;
      const { url } = request;
      void request
        .clone()
        .json()
        .then((body: unknown) => saves.push({ url, body }));
    });
    return saves;
  }

  const categoryOrder = () =>
    db.checklistTemplate
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => [category.id, category.order]);

  const taskTypeOrder = () =>
    db.taskTypes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((type) => [type.id, type.order]);

  /** Drag handles on the open tab, in the order the grid shows them. */
  function handles(noun: RegExp) {
    return screen.findAllByRole('button', { name: noun });
  }

  it('shows the range and the row-count control on the categories tab', async () => {
    // Seeded past one page on purpose: nine categories fit a 15-row page, and a
    // grid that never pages cannot demonstrate that the range follows it.
    db.checklistTemplate = [
      ...db.checklistTemplate,
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `cat-extra-${String(index)}`,
        name: `Extra ${String(index)}`,
        order: 10 + index,
        isActive: true,
        questions: [],
      })),
    ];

    const { user } = renderChecklist();
    await openTab(user, /categories/i);

    // The noun is the entity's, not "rows" — the same line the tasks grid shows.
    expect(await screen.findByText('Showing 1 to 15 of 17 categories')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));
    // The end is clamped to the total: "16 to 17", never "16 to 30".
    expect(await screen.findByText('Showing 16 to 17 of 17 categories')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '25' }));

    /*
     * A larger page recomputes the range AND corrects the page index: page 2 no
     * longer exists at 25 a page, and without that correction the grid would sit
     * on an out-of-range page rendering nothing.
     */
    expect(await screen.findByText('Showing 1 to 17 of 17 categories')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
  });

  it('writes nothing until Save Order, then sends one request for the categories', async () => {
    const { user } = renderChecklist();
    const saves = recordSaves();

    await openTab(user, /categories/i);
    const rows = await handles(/reorder category/i);
    rows[2]!.focus();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');

    expect(saves).toHaveLength(0);
    expect(categoryOrder()[0]).toEqual(['cat-reservation', 1]);

    await user.click(await screen.findByRole('button', { name: /save order/i }));

    await waitFor(() => {
      expect(categoryOrder().slice(0, 3)).toEqual([
        ['cat-configurations', 1],
        ['cat-reservation', 2],
        ['cat-code', 3],
      ]);
    });

    // One request for the whole sequence, ids only, and it covers EVERY
    // category — a payload holding just the current page is what the server's
    // ORDER_INCOMPLETE guard exists to refuse.
    expect(saves).toHaveLength(1);
    expect(saves[0]?.url).toMatch(/checklist-categories\/order$/);
    expect((saves[0]?.body as { ids: string[] }).ids).toHaveLength(9);
    // Dense and gapless afterwards: 1…n, with no page restarting at 1.
    expect(categoryOrder().map(([, order]) => order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('restores the persisted category order on Cancel, without a request', async () => {
    const { user } = renderChecklist();
    const saves = recordSaves();

    await openTab(user, /categories/i);
    const rows = await handles(/reorder category/i);
    rows[1]!.focus();
    await user.keyboard('{ArrowUp}');

    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved order/i)).not.toBeInTheDocument();
    });
    expect(saves).toHaveLength(0);
    expect(categoryOrder()[0]).toEqual(['cat-reservation', 1]);
  });

  it('keeps the local task type arrangement when the save fails', async () => {
    const { user } = renderChecklist();

    server.use(
      http.patch('/api/task-types/order', () =>
        HttpResponse.json(
          { code: 'SERVER_ERROR', message: 'Could not save the order.' },
          { status: 500 },
        ),
      ),
    );

    await openTab(user, /task types/i);
    const rows = await handles(/reorder task type/i);
    rows[1]!.focus();
    await user.keyboard('{ArrowUp}');

    await user.click(await screen.findByRole('button', { name: /save order/i }));

    // The banner stays and Save stays available: treating a failed save as done
    // would lose the arrangement the admin built with no way to retry it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save order/i })).toBeEnabled();
    });
    expect(screen.getByText(/unsaved order/i)).toBeInTheDocument();
    expect(taskTypeOrder()[0]).toEqual(['tt-customization', 1]);
  });

  it('saves the whole task type sequence, renumbered 1…n', async () => {
    const { user } = renderChecklist();
    const saves = recordSaves();

    await openTab(user, /task types/i);
    const rows = await handles(/reorder task type/i);
    rows[0]!.focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('button', { name: /save order/i }));

    await waitFor(() => {
      expect(taskTypeOrder()).toEqual([
        ['tt-configuration', 1],
        ['tt-customization', 2],
        ['tt-lobby', 3],
        ['tt-quick-report', 4],
        ['tt-upgrade-service', 5],
      ]);
    });
    expect(saves).toHaveLength(1);
    expect(saves[0]?.url).toMatch(/task-types\/order$/);
  });

  it('lists a retired task type so it can be restored', async () => {
    /*
     * The reason `useAdminTaskTypes` exists.
     *
     * `GET /api/task-types` serves the wizard, so it filters to active rows; the
     * admin grid asks for `scope=all`. Without that the Restore action was
     * unreachable — the row it acts on never arrived — and reorder could only
     * ever send a partial sequence, which the server refuses.
     */
    db.taskTypes = db.taskTypes.map((type) =>
      type.id === 'tt-lobby' ? { ...type, isActive: false } : type,
    );

    const { user } = renderChecklist();
    await openTab(user, /task types/i);

    const row = (await screen.findByText('Lobby')).closest('tr');
    if (row === null) throw new Error('The retired task type is not in the admin grid');
    expect(within(row).getByText('Inactive')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: /restore task type: lobby/i }));

    await waitFor(() => {
      expect(db.taskTypes.find((type) => type.id === 'tt-lobby')?.isActive).toBe(true);
    });
  });

  it('refuses a sequence that does not cover the whole list', async () => {
    // Both endpoints, reached directly. A client that sent only the rows on its
    // current page would renumber a subset and orphan the rest.
    for (const [path, ids] of [
      ['/api/checklist-categories/order', ['cat-code', 'cat-reservation']],
      ['/api/task-types/order', ['tt-lobby', 'tt-customization']],
    ] as const) {
      const response = await fetch(path, {
        method: 'PATCH',
        headers: {
          'X-Mock-User-Id': ADMIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      });
      expect(response.status).toBe(422);
    }

    expect(categoryOrder()[0]).toEqual(['cat-reservation', 1]);
    expect(taskTypeOrder()[0]).toEqual(['tt-customization', 1]);
  });
});

/**
 * Deleting a row closes the gap it leaves.
 *
 * Reached through `fetch` rather than through the grid because nothing in the
 * seed is deletable — every question has an answer, every category has questions
 * and every task type is in use — so each case has to create its own rows first,
 * and the rule under test is the server's resequencing, not the dialog.
 */
describe('renumbering after a delete', () => {
  const headers = {
    'X-Mock-User-Id': ADMIN,
    'Content-Type': 'application/json',
  };

  async function create(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string };
  }

  it('closes the gap in the categories', async () => {
    const first = await create('/api/checklist-categories', {
      name: 'Performance',
    });
    const second = await create('/api/checklist-categories', {
      name: 'Observability',
    });

    // Appended at 10 and 11 — one past the end, not ten past it.
    expect(db.checklistTemplate.find((category) => category.id === second.id)?.order).toBe(11);

    const response = await fetch(`/api/checklist-categories/${first.id}`, {
      method: 'DELETE',
      headers,
    });
    expect(response.status).toBe(204);

    const orders = db.checklistTemplate
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => category.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // The survivor moved UP into the gap rather than keeping 11 and leaving a
    // hole at 10 — "sequential and deterministic" has to survive a delete.
    expect(db.checklistTemplate.find((category) => category.id === second.id)?.order).toBe(10);
  });

  it('closes the gap in the task types', async () => {
    const first = await create('/api/task-types', { name: 'Data Migration' });
    const second = await create('/api/task-types', { name: 'Hotfix' });

    await fetch(`/api/task-types/${first.id}`, { method: 'DELETE', headers });

    expect(db.taskTypes.map((type) => type.order).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(db.taskTypes.find((type) => type.id === second.id)?.order).toBe(6);
  });

  it("closes the gap within the question's own category", async () => {
    const base = {
      categoryId: 'cat-reservation',
      appliesTo: ['tt-customization'],
    };
    const first = await create('/api/checklist-questions', {
      ...base,
      text: 'Have you noted the rollback plan?',
    });
    const second = await create('/api/checklist-questions', {
      ...base,
      text: 'Have you tagged the release?',
    });

    await fetch(`/api/checklist-questions/${first.id}`, {
      method: 'DELETE',
      headers,
    });

    const reservation = db.checklistTemplate.find((category) => category.id === 'cat-reservation');
    expect(reservation?.questions.map((question) => question.order).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(reservation?.questions.find((question) => question.id === second.id)?.order).toBe(4);

    // `order` is category-scoped, so a delete in Reservation must not touch
    // anybody else's numbering.
    expect(
      db.checklistTemplate
        .find((category) => category.id === 'cat-quick-reports')
        ?.questions.map((question) => question.order),
    ).toEqual([1, 2]);
  });
});

/**
 * An unsaved arrangement outliving the panel that built it.
 *
 * Radix unmounts an inactive tab panel, so every one of these used to be lost
 * the moment the admin glanced at another tab: the drag order, the search term,
 * both filters. The store behind them is unit-tested in
 * `hooks/useChecklistAdminView.test.ts`; what is asserted here is that the
 * SCREEN actually comes back the way it was left.
 */
describe('an unsaved arrangement survives', () => {
  function watchSaves() {
    const saves: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') saves.push(request.url);
    });
    return saves;
  }

  it('a round trip through another tab, on the categories tab', async () => {
    const { user } = renderChecklist();
    const saves = watchSaves();

    await openTab(user, /categories/i);
    const handles = await screen.findAllByRole('button', {
      name: /reorder category/i,
    });
    handles[2]!.focus();
    await user.keyboard('{ArrowUp}');

    const before = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);

    await openTab(user, /^questions$/i);
    await waitForBank();
    await openTab(user, /categories/i);

    // The banner is still there, so the admin is not told their arrangement was
    // saved OR quietly given the server's order back.
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('row')
          .slice(1)
          .map((row) => row.textContent),
      ).toEqual(before);
    });
    // And a tab switch is not a save.
    expect(saves).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /save order/i }));

    // The sequence that reaches the server is the one built BEFORE the switch.
    // Awaited on the STORE, not on `saves`: the recorder fires at request start,
    // which is before the handler has applied anything.
    await waitFor(() => {
      expect(
        db.checklistTemplate
          .slice()
          .sort((a, b) => a.order - b.order)
          .slice(0, 3)
          .map((category) => category.id),
      ).toEqual(['cat-reservation', 'cat-configurations', 'cat-code']);
    });
    expect(saves).toHaveLength(1);
  });

  it('a round trip, carrying the questions toolbar with it', async () => {
    const { user } = renderChecklist();
    await waitForBank();

    const search = screen.getByRole('searchbox', { name: /search questions/i });
    await user.click(search);
    await user.paste('Reservation');

    const handles = await screen.findAllByRole('button', {
      name: /reorder question/i,
    });
    handles[2]!.focus();
    await user.keyboard('{ArrowUp}');

    await openTab(user, /task types/i);
    await screen.findByText('Customization');
    await openTab(user, /^questions$/i);

    // The filter is still applied — retyping a search term after every glance at
    // another tab is its own small tax, and the rows it hides are the context
    // the arrangement was built in.
    expect(await screen.findByRole('searchbox', { name: /search questions/i })).toHaveValue(
      'Reservation',
    );
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toMatch(/reserved the files/i);
  });

  it('the whole screen unmounting and coming back', async () => {
    // The refresh case, minus the browser: leaving `/crp/admin/checklist` for
    // another admin screen tears this route down exactly as a reload does.
    const first = renderChecklist();

    await openTab(first.user, /task types/i);
    const handles = await screen.findAllByRole('button', {
      name: /reorder task type/i,
    });
    handles[0]!.focus();
    await first.user.keyboard('{ArrowDown}');
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();

    first.unmount();
    renderChecklist();

    // The tab comes back with the draft. Restoring the arrangement onto a tab
    // the admin is not looking at would hide the banner behind a tab label,
    // which is barely better than losing it.
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();
    // Awaited: the remount refetches, and the grid renders skeleton rows with no
    // text in them until it lands.
    await waitFor(() => {
      expect(screen.getAllByRole('row')[1]?.textContent).toMatch(/Configuration/);
    });
  });

  it('but is dropped when it no longer fits its rows', async () => {
    /*
     * A restored draft can meet a row set that has changed — a category created
     * and then the page reloaded, or another admin's save landing first. Keeping
     * the banner over the server's own order would claim work that no longer
     * exists, and Save would send ids the server refuses with ORDER_INCOMPLETE.
     */
    useChecklistAdminView.getState().setCategoryDraft(['cat-code', 'cat-gone', 'cat-reservation']);
    useChecklistAdminView.getState().setView('categories');

    const { user } = renderChecklist();
    await screen.findByText('Completion');

    await waitFor(() => {
      expect(screen.queryByText(/unsaved order/i)).not.toBeInTheDocument();
    });
    expect(useChecklistAdminView.getState().categoryDraft).toBeNull();
    // The server's order, intact.
    expect(screen.getAllByRole('row')[1]?.textContent).toMatch(/Reservation/);
    expect(user).toBeDefined();
  });

  it('and is NOT dropped merely because the rows have not arrived yet', async () => {
    /*
     * The negative control for the guard above, and the reason it has one.
     *
     * `rows` is empty for as long as the first fetch takes, so a mismatch check
     * that does not wait for it discards every restored draft on mount — the
     * feature then does nothing at all, and looks broken rather than wrong.
     */
    const order = ['cat-configurations', 'cat-reservation', 'cat-code'];
    useChecklistAdminView
      .getState()
      .setCategoryDraft([
        ...order,
        ...db.checklistTemplate.map((category) => category.id).filter((id) => !order.includes(id)),
      ]);
    useChecklistAdminView.getState().setView('categories');

    renderChecklist();

    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('row')[1]?.textContent).toMatch(/Configurations/);
    });
  });

  it('one stale category at a time, on the questions tab', async () => {
    /*
     * The Questions tab holds a draft PER CATEGORY, so a stale one there must
     * not take the valid ones with it. Reservation's draft names a question that
     * does not exist; Quick Reports' is sound and has to survive.
     */
    useChecklistAdminView.getState().setQuestionDrafts({
      'cat-reservation': ['q-reservation-3', 'q-gone', 'q-reservation-1'],
      'cat-quick-reports': ['q-quick-reports-2', 'q-quick-reports-1'],
    });

    renderChecklist();
    await waitForBank();

    await waitFor(() => {
      expect(Object.keys(useChecklistAdminView.getState().questionDrafts)).toEqual([
        'cat-quick-reports',
      ]);
    });
    // Still dirty, because one real arrangement is still pending — clearing the
    // lot would have thrown away work the admin can still save.
    expect(screen.getByText(/unsaved order/i)).toBeInTheDocument();
  });

  it('until the session ends', async () => {
    const { user } = renderChecklist();

    await openTab(user, /categories/i);
    const handles = await screen.findAllByRole('button', {
      name: /reorder category/i,
    });
    handles[1]!.focus();
    await user.keyboard('{ArrowUp}');
    expect(await screen.findByText(/unsaved order/i)).toBeInTheDocument();

    /*
     * Sign-out has to clear the live store as well as the written copy.
     * `clearUserStorage()` removes the `sdp.` keys, but the Zustand state lives
     * in the module and would hand the next person to sign in on this browser
     * the previous admin's half-finished reordering. `app/useSessionReset.ts`
     * does both, in the order that matters.
     */
    useChecklistAdminView.getState().reset();
    useChecklistAdminView.persist.clearStorage();

    expect(useChecklistAdminView.getState().categoryDraft).toBeNull();
    expect(window.sessionStorage.getItem(CHECKLIST_VIEW_STORAGE_KEY)).toBeNull();
  });
});
