import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import type { z } from 'zod';
import {
  checklistDraftSchema,
  createChecklistCategoryInputSchema,
  createHandoverInputSchema,
  createChecklistQuestionInputSchema,
  createCustomerInputSchema,
  createTaskTypeInputSchema,
  createUserInputSchema,
  issueResponseDraftSchema,
  reviewDraftSchema,
  reviewScopeSchema,
  reassignHandoverInputSchema,
  taskDraftSchema,
  reorderInputSchema,
  updateChecklistCategoryInputSchema,
  updateChecklistQuestionInputSchema,
  updateCustomerInputSchema,
  updateTaskTypeInputSchema,
  updateUserInputSchema,
  type ApiError,
  type ChecklistCategory,
  type ChecklistQuestion,
  type Customer,
  type Handover,
  type Notification,
  type Task,
  type IssueResponseRecord,
  type Review,
  type TaskChecklist,
  type TaskTypeRecord,
  type User,
} from '@sdp/contracts';
import {
  db,
  eventsForTask,
  attachmentsForTask,
  findChecklist,
  findReview,
  responsesForCycle,
  reviewsForTask,
  findCustomer,
  findTask,
  findUser,
  issueTaskCode,
  recordEvent,
  toListItem,
} from './db.ts';
import {
  nextReviewCycle,
  reviewBlockers,
} from '@/portals/code-review/features/reviews/domain/reviewRules.ts';
import {
  isResponseComplete,
  issuesFromReview,
  resubmitReadiness,
} from '@/portals/code-review/features/tasks/domain/responseRules.ts';
import {
  canAssignReviewer,
  canCancelTask,
  canDeleteTask,
  canEditTask,
  canHandOver,
  canRespondToFindings,
} from '@/lib/statusMachine.ts';
import { rejectAttachment } from '@/lib/attachments.ts';
import {
  nextQuestionOrder,
  questionAtOrder,
  resequenceAfterRemoval,
  resequenceRecords,
  shiftOrdersFrom,
} from '@/lib/checklistOrdering.ts';
import credentials from './data/credentials.json';

/** Phase 1 demo credentials. See `data/credentials.json`. */
export const DEMO_PASSWORD = credentials.password;
const DEMO_EMAILS = new Set(credentials.emails.map((e) => e.toLowerCase()));

/**
 * MSW request handlers — the Phase 1 stand-in for the NestJS API.
 *
 * Two rules keep these honest as a rehearsal for the real backend:
 *
 *  1. Authorisation is enforced HERE, not in the UI. The Available Tasks queue
 *     filters out the caller's own submissions server-side (spec section 1.5),
 *     so the frontend cannot accidentally depend on rows it should never have
 *     received. Phase 2 does the same thing in SQL.
 *
 *  2. Every response is shaped exactly like the documented API contract,
 *     including errors, so `apiClient`'s Zod parsing exercises the real path.
 */

/**
 * Simulated latency, so loading and skeleton states are real rather than
 * theoretical.
 *
 * Lowered from 250ms. The point of the delay is that the loading path gets
 * exercised on every screen, and 120ms still does that — while 250ms on top of
 * the tab-switching the app actually does was reading as the product being slow
 * rather than as a realistic network.
 */
const LATENCY_MS = 120;

function errorResponse(status: number, code: string, message: string) {
  const body: ApiError = { statusCode: status, code, message };
  return HttpResponse.json(body, { status });
}

/**
 * Resolves the caller from the header `apiClient` attaches. This stands in for
 * a Bearer token: handlers get an identity the same way the real API will, so
 * the mocks can enforce per-user rules instead of trusting the client.
 */
function currentUser(request: Request) {
  const userId = request.headers.get('X-Mock-User-Id');
  if (userId === null) return undefined;
  return findUser(userId);
}

function toWireNotification(n: Notification & { userId: string }): Notification {
  const { userId, ...rest } = n;
  void userId;
  return rest;
}

/** FL 2.5-01, applied server-side so the stored title cannot be spoofed. */
function deriveTitle(customerName: string, crimId: string, version: string | null): string {
  const base = `${customerName} - ${crimId}`;
  return version === null || version === '' ? base : `${base} ${version}`;
}

/**
 * The review row for a task's current cycle, created empty on first use.
 *
 * Screenshots can be attached before the reviewer has answered anything, so the
 * row has to exist before the decision does.
 */
function ensureReview(task: Task, reviewerId: string, reviewerName: string): Review {
  const existing = findReview(task.id, task.reviewCycle);
  if (existing) return existing;

  const now = new Date().toISOString();
  const review: Review = {
    id: `rev-${task.id}-${String(task.reviewCycle)}`,
    taskId: task.id,
    reviewCycle: task.reviewCycle,
    reviewerId,
    reviewerName,
    generalCheck: [],
    findings: {
      incorrectCode: '',
      incompleteImplementation: '',
      sourceFormatting: '',
    },
    otherRemarks: '',
    feedbackSummary: '',
    rank: null,
    screenshots: [],
    decision: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.reviews.push(review);
  return review;
}

function touch(task: Task): void {
  task.updatedAt = new Date().toISOString();
}

/** The first Zod message, which is what the user needs — not the whole tree. */
function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'That request was not valid.';
}

/**
 * Admin gate for the management endpoints.
 *
 * Returns a response when the caller may NOT proceed, so each handler reads
 * `const denied = requireAdmin(request); if (denied) return denied;` — one line,
 * impossible to write as a no-op by forgetting to negate.
 */
function requireAdmin(request: Request) {
  const user = currentUser(request);
  if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
  if (!user.roles.includes('Admin')) {
    return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
  }
  return undefined;
}

/** Id-safe fragment of a name, so generated ids stay readable in the store. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

/**
 * Appends one past the current highest.
 *
 * The `step` parameter is gone with the last caller that passed one. Categories
 * used to append in tens over a 10/20/30 seed while everything else stepped by
 * one, so the two conventions disagreed about what "next" meant — every
 * administered list is dense 1…n now, and a step would reopen exactly that gap.
 */
function nextOrder(rows: readonly { order: number }[]): number {
  return rows.reduce((highest, row) => Math.max(highest, row.order), 0) + 1;
}

function sortedTemplate(categories: readonly ChecklistCategory[]): ChecklistCategory[] {
  return categories
    .map((category) => ({
      ...category,
      questions: category.questions.slice().sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order);
}

/** Every question in the bank, flattened — the admin grid is question-first. */
function allQuestions(): ChecklistQuestion[] {
  return db.checklistTemplate.flatMap((category) => category.questions);
}

/**
 * True when a stored checklist already carries an answer to this question.
 *
 * The line between deactivate and delete: anything a developer has answered is
 * part of a submitted quality gate, so the row is retired rather than destroyed.
 * The stored answer keeps its own wording snapshot either way — this guard is
 * about not losing the question from the bank, not about the answers.
 */
function questionIsUsed(questionId: string): boolean {
  return db.checklists.some((checklist) =>
    checklist.answers.some((answer) => answer.questionId === questionId),
  );
}

/**
 * The badge prefix, derived from the name rather than typed.
 *
 * It becomes the Task ID prefix for every task this customer ever gets, so it
 * must be unique; a collision appends a digit rather than silently sharing a
 * sequence with another customer.
 */
function nextCustomerCode(name: string): string {
  const base = (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'CUST').toUpperCase();

  let code = base;
  let suffix = 2;
  while (db.customers.some((c) => c.code === code)) {
    code = `${base}${String(suffix)}`;
    suffix += 1;
  }
  return code;
}

export const handlers: HttpHandler[] = [
  /* ------------------------------------------------------------------ auth */

  /**
   * Mock sign-in.
   *
   * Validates against `data/credentials.json`, where every seeded user shares
   * one demo password. The response is the user object, matching what Phase 2's
   * token exchange will ultimately resolve to, so callers do not change.
   */
  http.post('/api/auth/login', async ({ request }) => {
    await delay(LATENCY_MS * 2);

    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const user = db.users.find((u) => u.email.toLowerCase() === email);
    const isKnownEmail = DEMO_EMAILS.has(email);

    // One message for every failure mode. Distinguishing "no such account" from
    // "wrong password" would let anyone enumerate who works here.
    if (!user || !isKnownEmail || password !== DEMO_PASSWORD) {
      return errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (!user.isActive) {
      return errorResponse(
        403,
        'ACCOUNT_INACTIVE',
        'Authentication failed or user account not configured. Please contact your administrator.',
      );
    }

    return HttpResponse.json(user);
  }),

  http.post('/api/auth/logout', async () => {
    await delay(LATENCY_MS);
    return new HttpResponse(null, { status: 204 });
  }),

  /**
   * Phase 2 replaces this with the OIDC-derived principal. The response shape
   * is already what the real endpoint will return.
   */
  http.get('/api/auth/me', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);

    if (!user) {
      // Mirrors spec FL 2.1-01: unauthenticated, or no role configured.
      return errorResponse(
        401,
        'NOT_AUTHENTICATED',
        'Authentication failed or user account not configured. Please contact your administrator.',
      );
    }

    return HttpResponse.json(user);
  }),

  /* ------------------------------------------------------------- customers */

  http.get('/api/customers', async () => {
    await delay(LATENCY_MS);
    return HttpResponse.json(db.customers);
  }),

  /* ----------------------------------------------------------------- tasks */

  /**
   * Scoped by the caller's relationship to the task. `scope=mine` is a
   * developer's own submissions; `scope=all` is the admin view. Enforced here
   * so a Developer cannot widen their view by editing a query string.
   */
  http.get('/api/tasks', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'mine';

    let tasks = db.tasks;

    if (scope === 'mine') {
      tasks = tasks.filter((t) => t.developerId === user.id);
    } else if (scope === 'all') {
      if (!user.roles.includes('Admin')) {
        return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
      }
    } else if (scope === 'available' || scope === 'assigned' || scope === 'history') {
      if (!user.roles.includes('Reviewer')) {
        return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
      }

      if (scope === 'available') {
        /*
         * The self-review bar, enforced HERE (spec section 1.5).
         *
         * `developerId !== user.id` is the control. The UI hiding these rows is
         * a convenience; if it were the only check, a reviewer could reach their
         * own submission by any route that skipped the filter. Phase 2 does this
         * in the SQL `WHERE`.
         */
        tasks = tasks.filter(
          (t) =>
            t.reviewerId === null &&
            t.developerId !== user.id &&
            /*
             * A handed-over task waits for the admin, not for whoever refreshes
             * first. Leaving it in the open queue would let a reviewer pick the
             * same task the admin is reassigning — two claims on one row, and a
             * handover queue listing work already taken.
             */
            !t.isHandedOver &&
            (t.status === 'Submitted' || t.status === 'ReSubmitted'),
        );
      } else if (scope === 'assigned') {
        tasks = tasks.filter((t) => t.reviewerId === user.id && t.status === 'InReview');
      } else {
        /*
         * History: every task this reviewer has actually decided on, matched on
         * the REVIEW's own `reviewerId` rather than the task's.
         *
         * The task's is the wrong key and it was silently losing rows. A Request
         * Changes decision clears `task.reviewerId` (see the review handler), so
         * matching on the task dropped precisely the reviews that found a
         * problem — a reviewer who sent five tasks back saw an empty History tab
         * and a "Changes Requested" counter that decayed to zero. The review row
         * is the durable attribution, which is the same argument `REVIEW_SCOPES`
         * already makes for `scope=reviewer` on `/reviews`.
         *
         * Tasks currently back with this reviewer are excluded: those belong to
         * `assigned`, and listing them in both tabs would double-count the queue.
         */
        const decidedByMe = new Set(
          db.reviews
            .filter((review) => review.reviewerId === user.id && review.decision !== null)
            .map((review) => review.taskId),
        );

        tasks = tasks.filter(
          (t) => decidedByMe.has(t.id) && !(t.reviewerId === user.id && t.status === 'InReview'),
        );
      }
    }

    const items = tasks
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toListItem);

    return HttpResponse.json({
      items,
      pagination: { page: 1, pageSize: items.length || 1, total: items.length },
    });
  }),

  /**
   * Home page workspace summary. Counts are scoped to what the caller can
   * actually see, so the number on the card matches the grid they land on.
   */
  http.get('/api/tasks/summary', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const isAdmin = user.roles.includes('Admin');
    const visible = isAdmin
      ? db.tasks
      : db.tasks.filter((t) => t.developerId === user.id || t.reviewerId === user.id);

    return HttpResponse.json({ total: visible.length });
  }),

  /**
   * One task, with the display fields the detail screens need.
   *
   * Visibility is checked here: a developer sees their own tasks, a reviewer
   * sees tasks they are assigned to or that are waiting in the queue, an admin
   * sees everything. Returning 404 rather than 403 for a task the caller may not
   * see is deliberate — a 403 confirms the task exists.
   */
  http.get('/api/tasks/:taskId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const isAdmin = user.roles.includes('Admin');
    const isReviewer = user.roles.includes('Reviewer');
    const mayView =
      isAdmin ||
      task.developerId === user.id ||
      task.reviewerId === user.id ||
      (isReviewer && task.reviewerId === null && task.status !== 'Draft');

    if (!mayView) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    return HttpResponse.json(toListItem(task));
  }),

  http.get('/api/tasks/:taskId/events', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    return HttpResponse.json(eventsForTask(task.id));
  }),

  /**
   * Create a draft task.
   *
   * The Task ID and the title are both issued HERE, never accepted from the
   * client: the ID comes off a shared per-customer counter (plan risk R2) and
   * the title is derived from customer + CRIM ID (FL 2.5-01). A client that sent
   * either would be ignored.
   */
  http.post('/api/tasks', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
    if (!user.roles.includes('Developer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    const parsed = taskDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    const customer = findCustomer(parsed.data.customerId);
    if (!customer) return errorResponse(422, 'VALIDATION_FAILED', 'Unknown customer.');

    const now = new Date().toISOString();
    const version = parsed.data.version?.trim() ?? '';

    const task: Task = {
      id: `t-${String(Date.now())}`,
      taskCode: issueTaskCode(customer.id),
      title: deriveTitle(customer.name, parsed.data.crimId.trim(), version === '' ? null : version),
      crimId: parsed.data.crimId.trim(),
      version: version === '' ? null : version,
      customerId: customer.id,
      priority: parsed.data.priority,
      status: 'Draft',
      reviewCycle: 1,
      developerId: user.id,
      reviewerId: null,
      taskTypeIds: [],
      isChecklistComplete: false,
      isHandedOver: false,
      noteToReviewer: null,
      createdAt: now,
      submittedAt: null,
      updatedAt: now,
    };

    db.tasks.push(task);
    recordEvent({
      taskId: task.id,
      kind: 'Created',
      reviewCycle: 1,
      actorId: user.id,
      note: null,
      occurredAt: now,
    });

    return HttpResponse.json(toListItem(task), { status: 201 });
  }),

  /** Edit a draft. The status machine decides whether editing is still open. */
  http.patch('/api/tasks/:taskId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (task.developerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the owning developer may edit this task.');
    }
    if (task.status !== 'Draft' && task.status !== 'ChangesRequested') {
      return errorResponse(409, 'INVALID_STATE', 'This task can no longer be edited.');
    }

    const parsed = taskDraftSchema.partial().safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    if (parsed.data.customerId !== undefined) task.customerId = parsed.data.customerId;
    if (parsed.data.crimId !== undefined) task.crimId = parsed.data.crimId.trim();
    if (parsed.data.priority !== undefined) task.priority = parsed.data.priority;
    if (parsed.data.noteToReviewer !== undefined) {
      const note = parsed.data.noteToReviewer.trim();
      task.noteToReviewer = note === '' ? null : note;
    }
    if (parsed.data.version !== undefined) {
      const trimmed = parsed.data.version.trim();
      task.version = trimmed === '' ? null : trimmed;
    }

    // The title follows its inputs rather than being stored independently, so a
    // customer change cannot leave a stale name in the grid.
    task.title = deriveTitle(
      findCustomer(task.customerId)?.name ?? 'Unknown',
      task.crimId,
      task.version,
    );
    touch(task);

    return HttpResponse.json(toListItem(task));
  }),

  /* ------------------------------------------------------------ checklists */

  /**
   * The administered task type list.
   *
   * `?scope=all` returns retired rows too, exactly as `/checklist-template` does
   * and for the same two reasons: the admin maintains them, and the Task Types
   * tab could not otherwise offer Restore — the action existed but was
   * unreachable, because a retired row never reached the grid.
   *
   * It is also what makes a reorder possible there. The batch endpoint requires
   * the WHOLE set, and a grid that can only see the active rows can only ever
   * send a partial one.
   *
   * Everything else keeps the active-only default: this list feeds the wizard's
   * task-type checkboxes, which must not start offering retired work types.
   */
  http.get('/api/task-types', async ({ request }) => {
    await delay(LATENCY_MS);

    const byOrder = (a: TaskTypeRecord, b: TaskTypeRecord) => a.order - b.order;

    if (new URL(request.url).searchParams.get('scope') === 'all') {
      const denied = requireAdmin(request);
      if (denied) return denied;
      return HttpResponse.json(db.taskTypes.slice().sort(byOrder));
    }

    return HttpResponse.json(db.taskTypes.filter((type) => type.isActive).sort(byOrder));
  }),

  /**
   * The question bank, active rows only.
   *
   * Retired questions are withheld here so they cannot be answered again, but
   * they stay in the store — a checklist already submitted keeps its own
   * snapshot of the wording, so past reviews are unaffected either way.
   */
  http.get('/api/checklist-template', async ({ request }) => {
    await delay(LATENCY_MS);

    /*
     * `?scope=all` returns retired rows too, for the admin's maintenance grid.
     * Admin-only: a developer receiving retired questions could answer one that
     * the business has deliberately withdrawn.
     */
    if (new URL(request.url).searchParams.get('scope') === 'all') {
      const denied = requireAdmin(request);
      if (denied) return denied;
      return HttpResponse.json(sortedTemplate(db.checklistTemplate));
    }

    return HttpResponse.json(
      sortedTemplate(
        db.checklistTemplate
          .filter((category) => category.isActive)
          .map((category) => ({
            ...category,
            questions: category.questions.filter((question) => question.isActive),
          }))
          .filter((category) => category.questions.length > 0),
      ),
    );
  }),

  http.get('/api/tasks/:taskId/checklist', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const checklist = findChecklist(task.id);
    if (!checklist) {
      // 204 rather than 404: the task exists and simply has no checklist yet,
      // which is the normal state of a fresh draft.
      return new HttpResponse(null, { status: 204 });
    }

    return HttpResponse.json(checklist);
  }),

  http.put('/api/tasks/:taskId/checklist', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (task.developerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the owning developer may edit this checklist.');
    }
    if (task.status !== 'Draft' && task.status !== 'ChangesRequested') {
      return errorResponse(409, 'INVALID_STATE', 'This task can no longer be edited.');
    }

    const parsed = checklistDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the checklist data and try again.');
    }

    const activeTaskTypeIds = new Set(
      db.taskTypes.filter((taskType) => taskType.isActive).map((taskType) => taskType.id),
    );
    if (parsed.data.taskTypeIds.some((id) => !activeTaskTypeIds.has(id))) {
      return errorResponse(
        422,
        'VALIDATION_FAILED',
        'The checklist contains an unknown task type.',
      );
    }

    // The applicable set is recomputed from the template rather than trusted
    // from the client — it gates submission, so a client-sent `isComplete` would
    // be a way to bypass FL 2.2-03 entirely. The filter is on QUESTIONS, since
    // that is where task-type applicability lives.
    const applicable = db.checklistTemplate
      .filter((category) => category.isActive)
      .flatMap((category) =>
        category.questions
          .filter(
            (question) =>
              question.isActive &&
              question.appliesTo.some((id) => parsed.data.taskTypeIds.includes(id)),
          )
          .map((question) => ({ question, categoryName: category.name })),
      );

    const answered = new Map(parsed.data.answers.map((entry) => [entry.questionId, entry.answer]));
    const isComplete =
      applicable.length > 0 && applicable.every(({ question }) => answered.has(question.id));

    const now = new Date().toISOString();
    const stored: TaskChecklist = {
      id: findChecklist(task.id)?.id ?? `cl-${task.id}`,
      taskId: task.id,
      taskTypeIds: parsed.data.taskTypeIds,
      /*
       * Built from the APPLICABLE set, not from what the client sent. That does
       * two jobs at once: answers to questions the selected types no longer
       * render are dropped, and the stored wording is the server's copy of the
       * question rather than the client's — a developer cannot record having
       * answered a different question from the one they were shown.
       */
      answers: applicable
        .filter(({ question }) => answered.has(question.id))
        .map(({ question, categoryName }, index) => ({
          questionId: question.id,
          answer: answered.get(question.id) ?? 'NA',
          questionText: question.text,
          categoryName,
          order: index,
        })),
      remarks: parsed.data.remarks,
      isComplete,
      checkedDate: now,
      developerId: user.id,
    };

    const index = db.checklists.findIndex((c) => c.taskId === task.id);
    if (index === -1) db.checklists.push(stored);
    else db.checklists[index] = stored;

    task.taskTypeIds = parsed.data.taskTypeIds;
    task.isChecklistComplete = isComplete;
    touch(task);

    return HttpResponse.json(stored);
  }),

  /**
   * Submit or resubmit for review (FL 2.2-03).
   *
   * The checklist gate is enforced here, not only by a disabled button: the
   * button is a courtesy, this is the control.
   */
  http.post('/api/tasks/:taskId/submit', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (task.developerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the owning developer may submit this task.');
    }

    const isResubmission = task.status === 'ChangesRequested';
    if (task.status !== 'Draft' && !isResubmission) {
      return errorResponse(409, 'INVALID_STATE', 'This task has already been submitted.');
    }
    if (!task.isChecklistComplete) {
      return errorResponse(
        422,
        'CHECKLIST_INCOMPLETE',
        'Complete the quality checklist before submitting for review.',
      );
    }

    /*
     * A RESUBMISSION carries an extra gate: every finding from the last cycle
     * must have been answered, and every rejection justified (FL 2.11.2.3-01).
     * Checked here as well as in the UI — resubmitting without engaging with the
     * feedback is exactly the failure this rule exists to prevent.
     */
    if (isResubmission) {
      const lastReview = reviewsForTask(task.id).find(
        (candidate) => candidate.decision === 'ChangesRequested',
      );
      const readiness = resubmitReadiness(
        issuesFromReview(lastReview ?? null),
        responsesForCycle(task.id, task.reviewCycle),
      );

      if (!readiness.canResubmit) {
        return errorResponse(
          422,
          'RESPONSES_INCOMPLETE',
          readiness.unjustified > 0
            ? 'Provide a reason when rejecting a review finding.'
            : 'Respond to every review finding before resubmitting.',
        );
      }
    }

    const now = new Date().toISOString();
    task.status = isResubmission ? 'ReSubmitted' : 'Submitted';
    task.submittedAt = now;
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: isResubmission ? 'Resubmitted' : 'Submitted',
      reviewCycle: task.reviewCycle,
      actorId: user.id,
      note: null,
      occurredAt: now,
    });

    return HttpResponse.json(toListItem(task));
  }),

  /* --------------------------------------------------------------- reviews */

  /** The 13 General Check questions (spec §3.1). */
  http.get('/api/general-check', async () => {
    await delay(LATENCY_MS);
    return HttpResponse.json(db.generalCheck.slice().sort((a, b) => a.order - b.order));
  }),

  /**
   * Pick a task off the Available queue (FL 3.3-02).
   *
   * The guard and the write are one step, and the guard re-reads the CURRENT
   * state rather than trusting anything the client sent. Two reviewers clicking
   * Pick at the same moment therefore produce exactly one winner; the loser gets
   * a 409 naming who took it, not a silent overwrite.
   *
   * Phase 2 is the same shape as one statement:
   *   UPDATE tasks SET reviewer_id = :me, status = 'InReview'
   *   WHERE id = :id AND status IN ('Submitted','ReSubmitted') AND reviewer_id IS NULL
   * — rowcount 0 means someone else won.
   */
  http.post('/api/tasks/:taskId/pick', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
    if (!user.roles.includes('Reviewer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // Server-side self-review bar. A reviewer must never review their own work,
    // whatever the queue happened to show them.
    if (task.developerId === user.id) {
      return errorResponse(403, 'FORBIDDEN', 'You cannot review a task you submitted.');
    }

    if (
      task.reviewerId !== null ||
      (task.status !== 'Submitted' && task.status !== 'ReSubmitted')
    ) {
      const holder = task.reviewerId === null ? null : findUser(task.reviewerId);
      return errorResponse(
        409,
        'ALREADY_PICKED',
        holder
          ? `${holder.name} has already picked up this task.`
          : 'This task is no longer available.',
      );
    }

    const now = new Date().toISOString();
    task.reviewerId = user.id;
    task.status = 'InReview';
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: 'Picked',
      reviewCycle: task.reviewCycle,
      actorId: user.id,
      note: null,
      occurredAt: now,
    });

    return HttpResponse.json(toListItem(task));
  }),

  /** The review for the task's current cycle, or 204 when none has been started. */
  http.get('/api/tasks/:taskId/review', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const review = findReview(task.id, task.reviewCycle);
    if (!review) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(review);
  }),

  /** Every past cycle, newest first (spec section 1.5 p.11). */
  http.get('/api/tasks/:taskId/reviews', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    return HttpResponse.json(
      reviewsForTask(task.id).map((review) => ({ ...review, responses: [] })),
    );
  }),

  /**
   * Attach a screenshot to the current cycle's review (spec §2.9.2.6).
   *
   * Phase 1 accepts a data URL in JSON and keeps it in memory. Phase 2 replaces
   * this with a multipart POST that streams browser → NestJS → SharePoint via
   * Graph, stores only the `graph_item_id`, and sniffs magic bytes rather than
   * trusting the declared type (plan §2.8). The caps are re-checked here because
   * the client's check is a courtesy.
   */
  http.post('/api/tasks/:taskId/review/screenshots', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (task.reviewerId !== user.id || task.status !== 'InReview') {
      return errorResponse(403, 'FORBIDDEN', 'Only the assigned reviewer may attach screenshots.');
    }

    const body = (await request.json()) as {
      fileName?: unknown;
      sizeBytes?: unknown;
      mimeType?: unknown;
      dataUrl?: unknown;
    };

    const candidate = {
      name: typeof body.fileName === 'string' ? body.fileName : '',
      sizeBytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : 0,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : '',
    };

    const review = ensureReview(task, user.id, user.name);
    const rejection = rejectAttachment(candidate, review.screenshots.length);
    if (rejection !== null) {
      return errorResponse(422, 'SCREENSHOT_REJECTED', rejection);
    }

    const now = new Date().toISOString();
    review.screenshots.push({
      id: `shot-${task.id}-${String(review.screenshots.length + 1)}-${String(Date.now())}`,
      fileName: candidate.name,
      sizeBytes: candidate.sizeBytes,
      mimeType: candidate.mimeType,
      storageRef: typeof body.dataUrl === 'string' ? body.dataUrl : '',
      comment: '',
      uploadedAt: now,
    });
    review.updatedAt = now;

    return HttpResponse.json(review);
  }),

  /** Annotate or remove one screenshot. */
  http.patch('/api/tasks/:taskId/review/screenshots/:screenshotId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (task.reviewerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the assigned reviewer may edit screenshots.');
    }

    const review = findReview(task.id, task.reviewCycle);
    const shot = review?.screenshots.find((s) => s.id === String(params['screenshotId']));
    if (!review || !shot) return errorResponse(404, 'NOT_FOUND', 'Screenshot not found.');

    const body = (await request.json()) as { comment?: unknown };
    if (typeof body.comment === 'string') shot.comment = body.comment;
    review.updatedAt = new Date().toISOString();

    return HttpResponse.json(review);
  }),

  http.delete(
    '/api/tasks/:taskId/review/screenshots/:screenshotId',
    async ({ request, params }) => {
      await delay(LATENCY_MS);
      const user = currentUser(request);
      if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

      const task = findTask(String(params['taskId']));
      if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
      if (task.reviewerId !== user.id) {
        return errorResponse(
          403,
          'FORBIDDEN',
          'Only the assigned reviewer may remove screenshots.',
        );
      }

      const review = findReview(task.id, task.reviewCycle);
      if (!review) return errorResponse(404, 'NOT_FOUND', 'Review not found.');

      review.screenshots = review.screenshots.filter(
        (s) => s.id !== String(params['screenshotId']),
      );
      review.updatedAt = new Date().toISOString();

      return HttpResponse.json(review);
    },
  ),

  /**
   * Save the reviewer's work in progress, WITHOUT deciding it (spec p.10, which
   * describes the review as an auto-saved draft).
   *
   * Until this existed the draft lived only in `ReviewFormSection`'s `useState`
   * and there was no endpoint that could store it: the only write was the POST
   * below, which decides. A reviewer who answered ten of the thirteen General
   * Check questions and then opened the task list lost all ten.
   *
   * Deliberately NOT gated by `reviewBlockers`. A draft is by definition
   * incomplete — that is what makes it a draft — so the completeness rules apply
   * at the decision, and only there. `decision` and `decidedAt` stay null, which
   * is what keeps a saved draft out of every metric (`decidedReviews`).
   */
  http.put('/api/tasks/:taskId/review', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // Same ownership gate as the decision: only the assigned reviewer writes to
    // this review, and only while the task is actually under review.
    if (task.reviewerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the assigned reviewer may edit this review.');
    }
    if (task.status !== 'InReview') {
      return errorResponse(409, 'INVALID_STATE', 'This review has already been decided.');
    }

    const parsed = reviewDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    // `ensureReview` so screenshots attached before any answer keep their row.
    const review = ensureReview(task, user.id, user.name);
    review.generalCheck = parsed.data.generalCheck;
    review.findings = parsed.data.findings;
    review.otherRemarks = parsed.data.otherRemarks;
    review.feedbackSummary = parsed.data.feedbackSummary;
    review.rank = parsed.data.rank;
    review.updatedAt = new Date().toISOString();

    return HttpResponse.json(review);
  }),

  /**
   * Decide a review — Approve, or Request Changes.
   *
   * Every gate the UI applies is re-applied here, because the UI's copy is a
   * courtesy. In particular FL 2.9.2.5-01: a Rank 2/3 approval is refused
   * outright, whatever the client believes.
   */
  http.post('/api/tasks/:taskId/review', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // Only the ASSIGNED reviewer decides — a second reviewer cannot decide for
    // them, and the task must actually be under review.
    if (task.reviewerId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'Only the assigned reviewer may decide this review.');
    }
    if (task.status !== 'InReview') {
      return errorResponse(409, 'INVALID_STATE', 'This review has already been decided.');
    }

    const body = (await request.json()) as {
      decision?: unknown;
      draft?: unknown;
    };
    const decision = body.decision === 'Approved' ? 'Approved' : 'ChangesRequested';
    const parsed = reviewDraftSchema.safeParse(body.draft);
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    const existing = findReview(task.id, task.reviewCycle);
    const screenshots = existing?.screenshots ?? [];

    const blockers = reviewBlockers(
      {
        draft: parsed.data,
        questions: db.generalCheck,
        screenshotCount: screenshots.length,
      },
      decision,
    );

    if (blockers.length > 0) {
      return errorResponse(
        422,
        blockers[0] === 'approveBlockedByRank' ? 'APPROVE_BLOCKED' : 'REVIEW_INCOMPLETE',
        blockers[0] === 'approveBlockedByRank'
          ? 'A Rank 2 or Rank 3 review cannot be approved. Request changes instead.'
          : 'Complete the review before submitting it.',
      );
    }

    const now = new Date().toISOString();
    const review: Review = {
      id: existing?.id ?? `rev-${task.id}-${String(task.reviewCycle)}`,
      taskId: task.id,
      reviewCycle: task.reviewCycle,
      reviewerId: user.id,
      reviewerName: user.name,
      generalCheck: parsed.data.generalCheck,
      findings: parsed.data.findings,
      otherRemarks: parsed.data.otherRemarks,
      feedbackSummary: parsed.data.feedbackSummary,
      rank: parsed.data.rank,
      screenshots,
      decision,
      decidedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const index = db.reviews.findIndex((r) => r.id === review.id);
    if (index === -1) db.reviews.push(review);
    else db.reviews[index] = review;

    if (decision === 'Approved') {
      task.status = 'Approved';
    } else {
      task.status = 'ChangesRequested';
      // The cycle advances here and nowhere else — see `nextReviewCycle` for the
      // contradiction between spec p.10 and FL 2.11.2.3-02 (plan risk R3).
      task.reviewCycle = nextReviewCycle(task.reviewCycle, decision);
      // Requesting changes returns the task to its developer, so the queue is
      // clear for whoever picks up the resubmission.
      task.reviewerId = null;
    }
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: decision === 'Approved' ? 'Approved' : 'ChangesRequested',
      reviewCycle: review.reviewCycle,
      actorId: user.id,
      note: parsed.data.feedbackSummary === '' ? null : parsed.data.feedbackSummary,
      occurredAt: now,
    });

    return HttpResponse.json(toListItem(task));
  }),

  /* ------------------------------------------------------------ attachments */

  /**
   * Supporting images the developer attached to a submission.
   *
   * Readable by anyone who can see the task — the point of attaching them is
   * that the reviewer sees them, so this deliberately does not restrict to the
   * owning developer.
   */
  http.get('/api/tasks/:taskId/attachments', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    return HttpResponse.json(attachmentsForTask(task.id));
  }),

  /**
   * Attach an image to a task.
   *
   * Optional by design: nothing about the submit gate consults this collection,
   * so a task with no attachments submits perfectly well.
   *
   * Phase 1 accepts a data URL and holds it in memory. Phase 2 streams the file
   * browser → NestJS → the customer's SharePoint document library via Graph,
   * stores only the item id, and sniffs magic bytes rather than trusting the
   * declared type (plan §2.8).
   */
  http.post('/api/tasks/:taskId/attachments', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // Only the owning developer attaches, and only while the task is theirs to
    // change — the same window in which they may edit anything else.
    if (!canEditTask({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(403, 'FORBIDDEN', 'This task can no longer be edited.');
    }

    const body = (await request.json()) as {
      fileName?: unknown;
      sizeBytes?: unknown;
      mimeType?: unknown;
      dataUrl?: unknown;
    };

    const candidate = {
      name: typeof body.fileName === 'string' ? body.fileName : '',
      sizeBytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : 0,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : '',
    };

    const existing = attachmentsForTask(task.id);
    const rejection = rejectAttachment(candidate, existing.length);
    if (rejection !== null) {
      return errorResponse(422, 'ATTACHMENT_REJECTED', rejection);
    }

    db.attachments.push({
      id: `att-${task.id}-${String(existing.length + 1)}-${String(Date.now())}`,
      taskId: task.id,
      fileName: candidate.name,
      sizeBytes: candidate.sizeBytes,
      mimeType: candidate.mimeType,
      storageRef: typeof body.dataUrl === 'string' ? body.dataUrl : '',
      caption: '',
      uploadedById: user.id,
      uploadedAt: new Date().toISOString(),
    });

    return HttpResponse.json(attachmentsForTask(task.id));
  }),

  http.patch('/api/tasks/:taskId/attachments/:attachmentId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (!canEditTask({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(403, 'FORBIDDEN', 'This task can no longer be edited.');
    }

    const attachment = db.attachments.find((a) => a.id === String(params['attachmentId']));
    if (!attachment) return errorResponse(404, 'NOT_FOUND', 'Attachment not found.');

    const body = (await request.json()) as { caption?: unknown };
    if (typeof body.caption === 'string') attachment.caption = body.caption;

    return HttpResponse.json(attachmentsForTask(task.id));
  }),

  http.delete('/api/tasks/:taskId/attachments/:attachmentId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (!canEditTask({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(403, 'FORBIDDEN', 'This task can no longer be edited.');
    }

    db.attachments = db.attachments.filter((a) => a.id !== String(params['attachmentId']));
    return HttpResponse.json(attachmentsForTask(task.id));
  }),

  /* ------------------------------------------------- developer responses */

  /** This cycle's responses, so the form can resume where the developer left it. */
  http.get('/api/tasks/:taskId/responses', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    return HttpResponse.json(responsesForCycle(task.id, task.reviewCycle));
  }),

  /**
   * Record the developer's answer to one finding (FL 2.11.2.3-01).
   *
   * A rejection without a written reason is refused here, not just disabled in
   * the UI. The reviewer's verdict on that rejection starts `Pending` — they
   * rule on it in the next cycle (FL 2.11.2.3-02).
   */
  http.post('/api/tasks/:taskId/responses', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (!canRespondToFindings({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(403, 'FORBIDDEN', 'You cannot respond to this feedback.');
    }

    const parsed = issueResponseDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    if (!isResponseComplete(parsed.data)) {
      return errorResponse(
        422,
        'REJECTION_REASON_REQUIRED',
        'Provide a reason when rejecting a review finding.',
      );
    }

    const reason = (parsed.data.rejectionReason ?? '').trim();
    const record: IssueResponseRecord = {
      id: `resp-${task.id}-${String(task.reviewCycle)}-${parsed.data.screenshotId ?? 'overall'}`,
      taskId: task.id,
      reviewCycle: task.reviewCycle,
      screenshotId: parsed.data.screenshotId,
      kind: parsed.data.kind,
      rejectionReason: reason === '' ? null : reason,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    };

    // Upsert: changing your mind about a finding replaces the answer rather than
    // stacking a second one.
    const index = db.issueResponses.findIndex((r) => r.id === record.id);
    if (index === -1) db.issueResponses.push(record);
    else db.issueResponses[index] = record;

    return HttpResponse.json(responsesForCycle(task.id, task.reviewCycle));
  }),

  /* ----------------------------------------------------------------- admin */

  /**
   * Every endpoint below requires the Admin role, checked here.
   *
   * The tab strip hiding the Admin workspace from a non-admin is navigation, not
   * authorisation — the URL is guessable and `RequireWorkspace` runs in the
   * browser. `requireAdmin` is the control.
   */

  http.get('/api/users', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    return HttpResponse.json(db.users.slice().sort((a, b) => a.name.localeCompare(b.name)));
  }),

  http.post('/api/users', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = createUserInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));
    }

    const email = parsed.data.email.toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return errorResponse(409, 'EMAIL_TAKEN', 'A user with that email address already exists.');
    }

    const user: User = {
      id: `u-${email.split('@')[0] ?? 'user'}-${String(db.users.length + 1)}`,
      name: parsed.data.name,
      email: parsed.data.email,
      roles: parsed.data.roles,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);

    return HttpResponse.json(user, { status: 201 });
  }),

  http.patch('/api/users/:userId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const user = findUser(String(params['userId']));
    if (!user) return errorResponse(404, 'NOT_FOUND', 'User not found.');

    const parsed = updateUserInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));
    }

    // An admin must not be able to lock themselves out, which would leave the
    // system with one fewer administrator and no way back in through the UI.
    const actor = currentUser(request);
    const removesOwnAdmin =
      actor?.id === user.id &&
      ((parsed.data.roles !== undefined && !parsed.data.roles.includes('Admin')) ||
        parsed.data.isActive === false);
    if (removesOwnAdmin) {
      return errorResponse(422, 'SELF_LOCKOUT', 'You cannot remove your own admin access.');
    }

    if (parsed.data.name !== undefined) user.name = parsed.data.name;
    if (parsed.data.email !== undefined) user.email = parsed.data.email;
    if (parsed.data.roles !== undefined) user.roles = parsed.data.roles;
    if (parsed.data.isActive !== undefined) user.isActive = parsed.data.isActive;

    return HttpResponse.json(user);
  }),

  /**
   * Hard delete, permitted only for a user with no history.
   *
   * Anyone who has raised or reviewed a task is referenced by task rows, events
   * and reviews; deleting them would blank the Developer and Reviewer columns
   * across the audit trail. Those users are deactivated instead — the `isActive`
   * flag and the power-icon row action already exist for exactly this.
   */
  http.delete('/api/users/:userId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const user = findUser(String(params['userId']));
    if (!user) return errorResponse(404, 'NOT_FOUND', 'User not found.');

    const actor = currentUser(request);
    if (actor?.id === user.id) {
      return errorResponse(422, 'SELF_DELETE', 'You cannot delete your own account.');
    }

    const referenced = db.tasks.some((t) => t.developerId === user.id || t.reviewerId === user.id);
    if (referenced) {
      return errorResponse(
        409,
        'USER_IN_USE',
        'This user appears on existing tasks. Deactivate them instead.',
      );
    }

    db.users = db.users.filter((u) => u.id !== user.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/customers', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = createCustomerInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));
    }

    if (db.customers.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return errorResponse(409, 'NAME_TAKEN', 'A customer with that name already exists.');
    }

    const customer: Customer = {
      id: `cust-${String(db.customers.length + 1)}-${String(Date.now())}`,
      name: parsed.data.name,
      code: nextCustomerCode(parsed.data.name),
      description: parsed.data.description,
      color: parsed.data.color,
      isActive: true,
    };
    db.customers.push(customer);

    return HttpResponse.json(customer, { status: 201 });
  }),

  http.patch('/api/customers/:customerId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const customer = findCustomer(String(params['customerId']));
    if (!customer) return errorResponse(404, 'NOT_FOUND', 'Customer not found.');

    const parsed = updateCustomerInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));
    }

    /*
     * `code` is deliberately NOT editable.
     *
     * It is the prefix of every Task ID already issued for this customer
     * (AASL-019). Changing it would either rewrite historical identifiers or
     * leave the grid showing two prefixes for one customer.
     */
    if (parsed.data.name !== undefined) customer.name = parsed.data.name;
    if (parsed.data.description !== undefined) customer.description = parsed.data.description;
    if (parsed.data.color !== undefined) customer.color = parsed.data.color;
    if (parsed.data.isActive !== undefined) customer.isActive = parsed.data.isActive;

    return HttpResponse.json(customer);
  }),

  http.delete('/api/customers/:customerId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const customer = findCustomer(String(params['customerId']));
    if (!customer) return errorResponse(404, 'NOT_FOUND', 'Customer not found.');

    if (db.tasks.some((t) => t.customerId === customer.id)) {
      return errorResponse(
        409,
        'CUSTOMER_IN_USE',
        'This customer has tasks. Deactivate them instead.',
      );
    }

    db.customers = db.customers.filter((c) => c.id !== customer.id);
    return new HttpResponse(null, { status: 204 });
  }),

  /** Assign or reassign a reviewer (screen 01, the person-plus row action). */
  http.post('/api/tasks/:taskId/assign', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (!canAssignReviewer({ userId: actor.id, roles: actor.roles }, task)) {
      return errorResponse(422, 'INVALID_STATE', 'This task cannot be assigned a reviewer.');
    }

    const body = (await request.json()) as { reviewerId?: unknown };
    const reviewer = findUser(typeof body.reviewerId === 'string' ? body.reviewerId : '');
    if (!reviewer || !reviewer.roles.includes('Reviewer') || !reviewer.isActive) {
      return errorResponse(422, 'INVALID_REVIEWER', 'Select an active reviewer.');
    }

    // The self-review bar again (spec section 1.5). An admin route to it would
    // be the same defect by another door.
    if (reviewer.id === task.developerId) {
      return errorResponse(
        422,
        'SELF_REVIEW',
        'A developer cannot be assigned to review their own task.',
      );
    }

    const wasUnassigned = task.reviewerId === null;
    task.reviewerId = reviewer.id;
    // Assigning takes the task out of the open queue: it is now someone's.
    if (task.status === 'Submitted' || task.status === 'ReSubmitted') task.status = 'InReview';
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: wasUnassigned ? 'ReviewerAssigned' : 'Reassigned',
      reviewCycle: task.reviewCycle,
      actorId: actor.id,
      note: reviewer.name,
      occurredAt: new Date().toISOString(),
    });

    return HttpResponse.json(toListItem(task));
  }),

  http.post('/api/tasks/:taskId/cancel', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (!canCancelTask({ userId: actor.id, roles: actor.roles }, task)) {
      return errorResponse(422, 'INVALID_STATE', 'This task can no longer be cancelled.');
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: unknown;
    };
    task.status = 'Cancelled';
    touch(task);
    recordEvent({
      taskId: task.id,
      kind: 'Cancelled',
      reviewCycle: task.reviewCycle,
      actorId: actor.id,
      note: typeof body.reason === 'string' ? body.reason : null,
      occurredAt: new Date().toISOString(),
    });

    return HttpResponse.json(toListItem(task));
  }),

  http.delete('/api/tasks/:taskId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (!canDeleteTask({ userId: actor.id, roles: actor.roles }, task)) {
      return errorResponse(
        422,
        'INVALID_STATE',
        'Only a draft or cancelled task can be deleted. Cancel it instead.',
      );
    }

    // Everything hanging off the task goes with it, so no orphan rows are left
    // to be counted by Reports.
    db.tasks = db.tasks.filter((t) => t.id !== task.id);
    db.checklists = db.checklists.filter((c) => c.taskId !== task.id);
    db.reviews = db.reviews.filter((r) => r.taskId !== task.id);
    db.issueResponses = db.issueResponses.filter((r) => r.taskId !== task.id);
    db.attachments = db.attachments.filter((a) => a.taskId !== task.id);
    db.events = db.events.filter((e) => e.taskId !== task.id);

    return new HttpResponse(null, { status: 204 });
  }),

  /* -------------------------------------------- admin ▸ quality checklist */

  /**
   * Task types, categories and questions, administered.
   *
   * The rule running through all nine handlers: **hard-delete only what was
   * never used; deactivate everything else.** A task type appears on submitted
   * tasks, a question on submitted checklists, and a category names the group a
   * past reviewer saw. Destroying any of those rewrites history that Reports
   * counts and that a completed review still renders.
   */

  http.post('/api/task-types', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = createTaskTypeInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    if (db.taskTypes.some((t) => t.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return errorResponse(409, 'NAME_TAKEN', 'A task type with that name already exists.');
    }

    const record: TaskTypeRecord = {
      id: `tt-${slug(parsed.data.name)}-${String(Date.now())}`,
      name: parsed.data.name,
      order: parsed.data.order ?? nextOrder(db.taskTypes),
      isActive: true,
    };
    db.taskTypes.push(record);

    return HttpResponse.json(record, { status: 201 });
  }),

  /**
   * Reorder the task types.
   *
   * DECLARED BEFORE `/api/task-types/:taskTypeId`, and that is load-bearing:
   * MSW resolves handlers in array order, and `:taskTypeId` matches the literal
   * segment `order` just as happily. Registered the other way round, a reorder
   * is silently handled as "rename the task type whose id is `order`" — a 404,
   * with nothing to suggest the route was the problem.
   *
   * `?scope=all` above is what makes this reachable: the payload must carry
   * every task type, retired ones included, and a grid that could only see the
   * active rows could only ever send a partial set.
   */
  http.patch('/api/task-types/order', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = reorderInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const resequenced = resequenceRecords(db.taskTypes, parsed.data.ids);
    if (resequenced === null) {
      return errorResponse(
        422,
        'ORDER_INCOMPLETE',
        'The new order must list every task type exactly once.',
      );
    }

    // One assignment, so a rejected payload leaves the list exactly as it was
    // rather than half-renumbered.
    db.taskTypes = resequenced;
    return HttpResponse.json(resequenced);
  }),

  http.patch('/api/task-types/:taskTypeId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const record = db.taskTypes.find((t) => t.id === String(params['taskTypeId']));
    if (!record) return errorResponse(404, 'NOT_FOUND', 'Task type not found.');

    const parsed = updateTaskTypeInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    if (parsed.data.name !== undefined) record.name = parsed.data.name;
    if (parsed.data.order !== undefined) record.order = parsed.data.order;
    if (parsed.data.isActive !== undefined) record.isActive = parsed.data.isActive;

    return HttpResponse.json(record);
  }),

  http.delete('/api/task-types/:taskTypeId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const id = String(params['taskTypeId']);
    const record = db.taskTypes.find((t) => t.id === id);
    if (!record) return errorResponse(404, 'NOT_FOUND', 'Task type not found.');

    if (db.tasks.some((task) => task.taskTypeIds.includes(id))) {
      return errorResponse(
        409,
        'TASK_TYPE_IN_USE',
        'This task type is used by existing tasks. Deactivate it instead.',
      );
    }
    if (allQuestions().some((question) => question.appliesTo.includes(id))) {
      return errorResponse(
        409,
        'TASK_TYPE_IN_USE',
        'Checklist questions still target this task type. Remove it from them first.',
      );
    }

    /*
     * Renumbered, not just removed.
     *
     * Deleting the third of five would otherwise leave 1, 2, 4, 5, and nothing
     * would repair it until an admin happened to drag something. Sorting first
     * because the store is not kept in order — the GET sorts on read.
     */
    db.taskTypes = resequenceAfterRemoval(
      db.taskTypes.filter((t) => t.id !== id).sort((a, b) => a.order - b.order),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/checklist-categories', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = createChecklistCategoryInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    if (db.checklistTemplate.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return errorResponse(409, 'NAME_TAKEN', 'A category with that name already exists.');
    }

    const category: ChecklistCategory = {
      id: `cat-${slug(parsed.data.name)}-${String(Date.now())}`,
      name: parsed.data.name,
      order: parsed.data.order ?? nextOrder(db.checklistTemplate),
      isActive: true,
      questions: [],
    };
    db.checklistTemplate.push(category);

    return HttpResponse.json(category, { status: 201 });
  }),

  /**
   * Reorder the categories themselves.
   *
   * DECLARED BEFORE `/api/checklist-categories/:categoryId` — see the note on
   * the task-type equivalent. `:categoryId` matches the literal segment `order`,
   * so the wrong registration order turns a reorder into a rename of a category
   * that does not exist.
   *
   * Distinct from `/:categoryId/question-order` below, which reorders the
   * questions INSIDE one category. Two different collections, two endpoints,
   * one schema.
   */
  http.patch('/api/checklist-categories/order', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = reorderInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const resequenced = resequenceRecords(db.checklistTemplate, parsed.data.ids);
    if (resequenced === null) {
      return errorResponse(
        422,
        'ORDER_INCOMPLETE',
        'The new order must list every category exactly once.',
      );
    }

    db.checklistTemplate = resequenced;
    return HttpResponse.json(sortedTemplate(resequenced));
  }),

  http.patch('/api/checklist-categories/:categoryId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const category = db.checklistTemplate.find((c) => c.id === String(params['categoryId']));
    if (!category) return errorResponse(404, 'NOT_FOUND', 'Category not found.');

    const parsed = updateChecklistCategoryInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    if (parsed.data.name !== undefined) category.name = parsed.data.name;
    if (parsed.data.order !== undefined) category.order = parsed.data.order;
    if (parsed.data.isActive !== undefined) category.isActive = parsed.data.isActive;

    return HttpResponse.json(category);
  }),

  /**
   * The batch reorder: one category's questions, in their final sequence.
   *
   * Scoped to a category because `order` is — see the note on
   * `DUPLICATE_ORDER_STRATEGIES`. A global endpoint would invite a payload that
   * renumbers across categories, which has no meaning here.
   *
   * `resequenceRecords` is the SAME function the client calls before it sends,
   * so the two cannot disagree about what a valid payload is, and it returns a
   * complete new array rather than mutating in place — the assignment below is a
   * single statement, so a rejected payload leaves the category exactly as it
   * was rather than half-renumbered.
   */
  http.patch(
    '/api/checklist-categories/:categoryId/question-order',
    async ({ request, params }) => {
      await delay(LATENCY_MS);
      const denied = requireAdmin(request);
      if (denied) return denied;

      const category = db.checklistTemplate.find((c) => c.id === String(params['categoryId']));
      if (!category) return errorResponse(404, 'NOT_FOUND', 'Category not found.');

      const parsed = reorderInputSchema.safeParse(await request.json());
      if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

      const resequenced = resequenceRecords(category.questions, parsed.data.ids);
      if (resequenced === null) {
        return errorResponse(
          422,
          'ORDER_INCOMPLETE',
          'The new order must list every question in this category exactly once.',
        );
      }

      category.questions = resequenced;
      return HttpResponse.json(sortedTemplate([category])[0]);
    },
  ),

  http.delete('/api/checklist-categories/:categoryId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const id = String(params['categoryId']);
    const category = db.checklistTemplate.find((c) => c.id === id);
    if (!category) return errorResponse(404, 'NOT_FOUND', 'Category not found.');

    // A category is a container: emptying it is the admin's decision to make
    // question by question, not something a single Delete should do for them.
    if (category.questions.length > 0) {
      return errorResponse(
        409,
        'CATEGORY_NOT_EMPTY',
        'This category still has questions. Move or delete them first.',
      );
    }

    // Renumbered for the same reason as the task types above.
    db.checklistTemplate = resequenceAfterRemoval(
      db.checklistTemplate.filter((c) => c.id !== id).sort((a, b) => a.order - b.order),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/checklist-questions', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const parsed = createChecklistQuestionInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const category = db.checklistTemplate.find((c) => c.id === parsed.data.categoryId);
    if (!category) return errorResponse(422, 'INVALID_CATEGORY', 'That category does not exist.');

    const unknown = parsed.data.appliesTo.filter(
      (id) => !db.taskTypes.some((type) => type.id === id),
    );
    if (unknown.length > 0) {
      return errorResponse(422, 'INVALID_TASK_TYPE', 'One of those task types does not exist.');
    }

    /*
      Order collisions.

      Without an explicit `order` the question appends, which is the behaviour
      that has always been here. WITH one, the slot may already be taken — and
      `order` is unique only by convention, so nothing stopped a second row
      claiming it and leaving the category with two 3s and a sort that fell back
      to insertion order.

      The strategy is required rather than assumed. Guessing either way is wrong:
      silently shifting renumbers rows the admin never looked at, and silently
      replacing destroys one. So an unaccompanied collision is a 409 the client
      turns into a question — the same gate-in-two-places rule as
      `statusMachine`, and it holds even for a caller that is not our own UI.
    */
    const requestedOrder = parsed.data.order;
    const occupant =
      requestedOrder === undefined
        ? undefined
        : questionAtOrder(category.questions, requestedOrder);

    if (occupant !== undefined && requestedOrder !== undefined) {
      if (parsed.data.onDuplicateOrder === undefined) {
        return errorResponse(
          409,
          'ORDER_TAKEN',
          `Order ${String(requestedOrder)} is already used by a question in ${category.name}.`,
        );
      }

      if (parsed.data.onDuplicateOrder === 'replace') {
        // ADR-0006: a question a developer has answered is part of a submitted
        // quality gate and cannot be destroyed, however it is being destroyed.
        // Replace is a delete with extra steps, so it answers to the same guard
        // the DELETE route does — otherwise this route would be the way around
        // it.
        if (questionIsUsed(occupant.id)) {
          return errorResponse(
            409,
            'QUESTION_IN_USE',
            'Developers have already answered the question at that order, so it cannot be replaced. Keep both records instead, or retire it.',
          );
        }
        category.questions = category.questions.filter((q) => q.id !== occupant.id);
      } else {
        category.questions = shiftOrdersFrom(category.questions, requestedOrder);
      }
    }

    const question: ChecklistQuestion = {
      id: `q-${slug(category.name)}-${String(category.questions.length + 1)}-${String(Date.now())}`,
      categoryId: category.id,
      text: parsed.data.text,
      order: requestedOrder ?? nextQuestionOrder(category.questions),
      appliesTo: parsed.data.appliesTo,
      isActive: true,
    };
    category.questions.push(question);

    return HttpResponse.json(question, { status: 201 });
  }),

  http.patch('/api/checklist-questions/:questionId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const id = String(params['questionId']);
    const owner = db.checklistTemplate.find((c) => c.questions.some((q) => q.id === id));
    const question = owner?.questions.find((q) => q.id === id);
    if (!owner || !question) return errorResponse(404, 'NOT_FOUND', 'Question not found.');

    const parsed = updateChecklistQuestionInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    if (parsed.data.text !== undefined) question.text = parsed.data.text;
    if (parsed.data.appliesTo !== undefined) question.appliesTo = parsed.data.appliesTo;
    if (parsed.data.isActive !== undefined) question.isActive = parsed.data.isActive;

    /*
      Moving a question to an occupied slot shifts the occupant, exactly as
      creating one into an occupied slot does.

      This used to assign `order` blindly, which left the EDIT path as the way
      around the collision handling the CREATE path was hardened with: set an
      existing question's order to 3 and the category had two 3s and a sort that
      fell back to array order. There is no 409 / "which did you mean" here
      because a move has no second reading — the row already exists and keeps its
      identity, so shifting is the only sensible outcome. Insertion is the case
      with a genuine fork, and it keeps the strategy prompt.
    */
    if (parsed.data.order !== undefined && parsed.data.order !== question.order) {
      const requested = parsed.data.order;
      // The question being moved is excluded, or it would shift itself.
      const siblings = owner.questions.filter((q) => q.id !== id);

      if (questionAtOrder(siblings, requested) !== undefined) {
        const shifted = shiftOrdersFrom(siblings, requested);
        owner.questions = owner.questions.map((q) => shifted.find((s) => s.id === q.id) ?? q);
      }

      question.order = requested;
    }

    // Moving a question between categories moves the row, so `categoryId` and
    // the containing array can never disagree.
    if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== owner.id) {
      const target = db.checklistTemplate.find((c) => c.id === parsed.data.categoryId);
      if (!target) return errorResponse(422, 'INVALID_CATEGORY', 'That category does not exist.');

      owner.questions = owner.questions.filter((q) => q.id !== id);
      question.categoryId = target.id;
      target.questions.push(question);
    }

    return HttpResponse.json(question);
  }),

  http.delete('/api/checklist-questions/:questionId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const id = String(params['questionId']);
    const owner = db.checklistTemplate.find((c) => c.questions.some((q) => q.id === id));
    if (!owner) return errorResponse(404, 'NOT_FOUND', 'Question not found.');

    if (questionIsUsed(id)) {
      return errorResponse(
        409,
        'QUESTION_IN_USE',
        'Developers have already answered this question. Deactivate it instead.',
      );
    }

    // Renumbered within its own category, matching the two administered lists.
    // `order` is category-scoped, so only this category's questions move.
    owner.questions = resequenceAfterRemoval(
      owner.questions.filter((q) => q.id !== id).sort((a, b) => a.order - b.order),
    );
    return new HttpResponse(null, { status: 204 });
  }),

  /**
   * Reviews in bulk, for the metrics screens.
   *
   * Returns reviews rather than pre-computed numbers on purpose: the aggregation
   * lives in the `domain/` folders, where it is unit-tested against the
   * business's own figures and can be ported to SQL in Phase 2. A handler that
   * returned finished numbers would put that logic somewhere no test could reach.
   *
   * TWO SCOPES, and the scope decides the authorisation:
   *
   * - `all` (the default) is the admin Reports tab, and stays admin-only.
   * - `mine` is the developer's own Analytics tab, which needs review RANKS to
   *   draw its quality chart. It returns reviews of tasks the caller developed,
   *   and nothing else — so a developer reading it learns only what they are
   *   already entitled to see on each of their own task pages.
   *
   * Enforced HERE, not by the caller passing the right scope: `scope=all` from a
   * developer is refused rather than quietly narrowed, because a client that can
   * widen its own view by editing a query string is not an authorisation model.
   *
   * Findings and screenshots are stripped either way — the metrics need
   * decisions, ranks and cycles, and reviewer prose is not for browsing in bulk.
   */
  http.get('/api/reviews', async ({ request }) => {
    await delay(LATENCY_MS);

    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const parsedScope = reviewScopeSchema.safeParse(
      new URL(request.url).searchParams.get('scope') ?? 'all',
    );
    if (!parsedScope.success) {
      return errorResponse(422, 'INVALID_SCOPE', 'That is not a review scope.');
    }
    const scope = parsedScope.data;

    /*
     * Each scope is gated on the role it belongs to, HERE rather than in the UI
     * (standard §13). `reviewer` is as privileged as `all` — it is one person's
     * whole review history — so a developer-only account is refused rather than
     * handed an empty array, which would read as "you have reviewed nothing"
     * instead of "this is not yours to read".
     */
    if (scope === 'all') {
      const denied = requireAdmin(request);
      if (denied) return denied;
    }
    if (scope === 'reviewer' && !user.roles.includes('Reviewer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    /*
     * `mine` and `reviewer` point in opposite directions — see `REVIEW_SCOPES`.
     * `mine` matches the TASK's developer; `reviewer` matches the REVIEW's own
     * reviewer, because a Request Changes decision clears `task.reviewerId` and
     * anything counting a reviewer's work off the task would lose every review
     * that found a problem.
     */
    let visible = db.reviews;
    if (scope === 'mine') {
      const ownTaskIds = new Set(
        db.tasks.filter((task) => task.developerId === user.id).map((task) => task.id),
      );
      visible = db.reviews.filter((review) => ownTaskIds.has(review.taskId));
    } else if (scope === 'reviewer') {
      visible = db.reviews.filter((review) => review.reviewerId === user.id);
    }

    return HttpResponse.json(
      visible.map((review) => ({
        ...review,
        findings: {
          incorrectCode: '',
          incompleteImplementation: '',
          sourceFormatting: '',
        },
        otherRemarks: '',
        feedbackSummary: '',
        screenshots: [],
      })),
    );
  }),

  /* ------------------------------------------------------------- handovers */

  /**
   * A reviewer hands a task back (spec p.12).
   *
   * ⚠️ No Figma screen and no development-spec section exist for this; the flow
   * below is our design (plan §1.3).
   *
   * What it does: clears the reviewer, returns the task to its pre-review status
   * and raises a Pending handover for the admin. `isHandedOver` is what keeps it
   * out of the open Available queue in the meantime — the task is waiting for a
   * decision, not for whoever refreshes first.
   *
   * What it deliberately does NOT do: touch `reviewCycle`. A cycle counts a
   * completed review round (spec p.10), and handing over is the absence of one.
   * Incrementing here would inflate every cycle metric in Reports whenever a
   * reviewer went on leave.
   */
  http.post('/api/tasks/:taskId/handover', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // Only the ASSIGNED reviewer may hand over — a second reviewer cannot push
    // someone else's work back to the admin.
    if (!canHandOver({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(422, 'INVALID_STATE', 'This task is not yours to hand over.');
    }

    const parsed = createHandoverInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const now = new Date().toISOString();
    const handover: Handover = {
      id: `ho-${task.id}-${String(db.handovers.length + 1)}`,
      taskId: task.id,
      fromReviewerId: user.id,
      fromReviewerName: user.name,
      reason: parsed.data.reason,
      status: 'Pending',
      reassignedToId: null,
      reassignedToName: null,
      reassignedById: null,
      createdAt: now,
      resolvedAt: null,
    };
    db.handovers.push(handover);

    task.reviewerId = null;
    task.isHandedOver = true;
    // Back to where it was before this reviewer picked it up. A first-cycle task
    // returns to Submitted; one that has been round returns to Re-Submitted.
    task.status = task.reviewCycle > 1 ? 'ReSubmitted' : 'Submitted';
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: 'HandedOver',
      reviewCycle: task.reviewCycle,
      actorId: user.id,
      note: parsed.data.reason,
      occurredAt: now,
    });

    return HttpResponse.json(toListItem(task));
  }),

  /** The admin's handover queue. Pending first — those are the ones to action. */
  http.get('/api/handovers', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const rank = { Pending: 0, Reassigned: 1, Cancelled: 2 };

    return HttpResponse.json(
      db.handovers
        .slice()
        .sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt)),
    );
  }),

  /** Reassign a handed-over task to another reviewer. */
  http.post('/api/handovers/:handoverId/reassign', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    const handover = db.handovers.find((h) => h.id === String(params['handoverId']));
    if (!handover || !actor) return errorResponse(404, 'NOT_FOUND', 'Handover not found.');
    if (handover.status !== 'Pending') {
      return errorResponse(422, 'ALREADY_RESOLVED', 'This handover has already been resolved.');
    }

    const task = findTask(handover.taskId);
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const parsed = reassignHandoverInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const reviewer = findUser(parsed.data.reviewerId);
    if (!reviewer || !reviewer.roles.includes('Reviewer') || !reviewer.isActive) {
      return errorResponse(422, 'INVALID_REVIEWER', 'Select an active reviewer.');
    }
    // Handing back to the person who handed over defeats the purpose.
    if (reviewer.id === handover.fromReviewerId) {
      return errorResponse(
        422,
        'SAME_REVIEWER',
        'Choose someone other than the reviewer who handed the task over.',
      );
    }
    // The self-review bar holds on this path too.
    if (reviewer.id === task.developerId) {
      return errorResponse(
        422,
        'SELF_REVIEW',
        'A developer cannot be assigned to review their own task.',
      );
    }

    const now = new Date().toISOString();
    task.reviewerId = reviewer.id;
    task.isHandedOver = false;
    task.status = 'InReview';
    touch(task);

    handover.status = 'Reassigned';
    handover.reassignedToId = reviewer.id;
    handover.reassignedToName = reviewer.name;
    handover.reassignedById = actor.id;
    handover.resolvedAt = now;

    recordEvent({
      taskId: task.id,
      kind: 'Reassigned',
      reviewCycle: task.reviewCycle,
      actorId: actor.id,
      note: reviewer.name,
      occurredAt: now,
    });

    return HttpResponse.json(handover);
  }),

  /**
   * Return a handed-over task to the open queue instead of naming a reviewer.
   *
   * The other half of the admin's decision, and the reason handover is not just
   * "unassign": sometimes the right answer is "anyone may take this", and
   * without this action the admin would have to pick a name they do not have.
   */
  http.post('/api/handovers/:handoverId/return', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    const handover = db.handovers.find((h) => h.id === String(params['handoverId']));
    if (!handover || !actor) return errorResponse(404, 'NOT_FOUND', 'Handover not found.');
    if (handover.status !== 'Pending') {
      return errorResponse(422, 'ALREADY_RESOLVED', 'This handover has already been resolved.');
    }

    const task = findTask(handover.taskId);
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    task.isHandedOver = false;
    touch(task);

    handover.status = 'Cancelled';
    handover.resolvedAt = new Date().toISOString();
    handover.reassignedById = actor.id;

    return HttpResponse.json(handover);
  }),

  /* --------------------------------------------------------- notifications */

  http.get('/api/notifications', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const mine = db.notifications
      .filter((n) => n.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toWireNotification);

    return HttpResponse.json(mine);
  }),

  http.post('/api/notifications/:id/read', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const notification = db.notifications.find((n) => n.id === params['id']);
    if (!notification) return errorResponse(404, 'NOT_FOUND', 'Notification not found.');

    // A user may only mark their OWN notification read — checked server-side.
    if (notification.userId !== user.id) {
      return errorResponse(403, 'FORBIDDEN', 'You cannot modify this notification.');
    }

    notification.isRead = true;
    return HttpResponse.json(toWireNotification(notification));
  }),

  http.post('/api/notifications/read-all', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    for (const n of db.notifications) {
      if (n.userId === user.id) n.isRead = true;
    }
    return new HttpResponse(null, { status: 204 });
  }),
];
