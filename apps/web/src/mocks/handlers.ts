import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import type { z } from 'zod';
import {
  checklistDraftSchema,
  checklistSubmissionSchema,
  createChecklistCategoryInputSchema,
  createHandoverInputSchema,
  createChecklistQuestionInputSchema,
  createCustomerInputSchema,
  createTaskTypeInputSchema,
  createUserInputSchema,
  deriveTaskTitle,
  issueResponseDraftSchema,
  reviewDraftSchema,
  reviewScopeSchema,
  systemAuditEventSchema,
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
  type ReviewComment,
  type TaskChecklist,
  type ChecklistSubmission,
  type TaskTypeRecord,
  type User,
} from '@sdp/contracts';
import {
  db,
  checklistSubmissionsForTask,
  eventsForTask,
  attachmentsForTask,
  findChecklist,
  findReview,
  reviewsForTask,
  findCustomer,
  findTask,
  findUser,
  issueTaskCode,
  issueTaskVersion,
  peekNextTaskVersion,
  taskIdentityKey,
  recordEvent,
  recordSystemAuditEvent,
  toListItem,
} from './db.ts';
import {
  createCycleResponseId,
  nextReviewRound,
  nextCountedCycle,
  resolveActiveReviewRound,
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
  canHandover as canHandOver,
  canPurgeTask,
  canReassignReviewer,
  canRespondToFindings,
  canViewTask,
  isTerminalTask,
  type PurgeEvidenceFlags,
} from '@/lib/taskPolicy.ts';
import { canEditTask } from '@/lib/statusMachine.ts';
import { rejectAttachment } from '@/lib/attachments.ts';
import {
  nextQuestionOrder,
  questionAtOrder,
  resequenceAfterRemoval,
  resequenceRecords,
  shiftOrdersFrom,
} from '@/lib/checklistOrdering.ts';
import credentials from './data/credentials.json';
import { generateHandoverId } from './handoverId.ts';
import {
  canAccessWorkspace,
  hasCapability,
  isPrivilegedRoleSet,
  type Capability,
} from '@/lib/permissions.ts';

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
  const user = findUser(userId);
  return user?.isActive === true ? user : undefined;
}

function toWireNotification(n: Notification & { userId: string }): Notification {
  const { userId: _userId, ...rest } = n;
  return rest;
}

/**
 * The review row for a task's current cycle, created empty on first use.
 *
 * Screenshots can be attached before the reviewer has answered anything, so the
 * row has to exist before the decision does.
 */
export function createReviewSessionId(taskId: string, reviewRound: number): string {
  return `rs-${taskId}-${reviewRound}-${crypto.randomUUID()}`;
}

/**
 * The review row for a task's current cycle, created empty on first use.
 *
 * Screenshots can be attached before the reviewer has answered anything, so the
 * row has to exist before the decision does.
 */
function ensureReview(task: Task, reviewerId: string, reviewerName: string): Review {
  const currentHistoricalRound = task.reviewRound;
  const existing = findReview(task.id, currentHistoricalRound);
  if (existing) {
    if (
      existing.decision === null &&
      existing.reviewerId !== reviewerId &&
      task.reviewerId === reviewerId
    ) {
      existing.reviewerId = reviewerId;
      existing.reviewerName = reviewerName;
      existing.updatedAt = new Date().toISOString();
    }
    if (!existing.currentReviewSessionId && task.currentReviewSessionId) {
      existing.currentReviewSessionId = task.currentReviewSessionId;
    } else if (
      !existing.currentReviewSessionId &&
      !task.currentReviewSessionId &&
      task.status === 'InReview'
    ) {
      const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);
      task.currentReviewSessionId = newSessionId;
      existing.currentReviewSessionId = newSessionId;
    }
    return existing;
  }

  const now = new Date().toISOString();
  if (!task.currentReviewSessionId && task.status === 'InReview') {
    task.currentReviewSessionId = createReviewSessionId(task.id, currentHistoricalRound);
  }
  const review: Review = {
    id: `rev-${task.id}-${String(currentHistoricalRound)}`,
    taskId: task.id,
    reviewRound: currentHistoricalRound,
    reviewerId,
    reviewerName,
    currentReviewSessionId: task.currentReviewSessionId ?? null,
    comments: [],
    generalCheck: [],
    findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
    otherRemarks: '',
    feedbackSummary: '',
    rank: null,
    previousFeedbackReviewNote: null,
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

/**
 * Validates that an incoming set of comments does not delete or modify comments
 * authored in a previous review session (or by another reviewer).
 */
function validateCommentAuthorship(
  existingComments: readonly ReviewComment[],
  incomingComments: readonly ReviewComment[],
  currentUserId: string,
  currentReviewSessionId?: string | null,
): string | null {
  const previousComments = existingComments.filter((c) =>
    currentReviewSessionId
      ? c.reviewSessionId !== currentReviewSessionId
      : Boolean(c.reviewerId && c.reviewerId !== currentUserId),
  );

  for (const prev of previousComments) {
    const incoming = incomingComments.find((c) => c.id === prev.id);
    if (!incoming) {
      return 'You cannot delete comments authored by another reviewer or from a previous review session.';
    }
    if (incoming.text.trim() !== prev.text.trim()) {
      return 'You cannot modify comments authored by another reviewer or from a previous review session.';
    }
    if (incoming.reviewerId !== prev.reviewerId) {
      return 'You cannot modify comment authorship.';
    }
    if (
      incoming.reviewSessionId &&
      prev.reviewSessionId &&
      incoming.reviewSessionId !== prev.reviewSessionId
    ) {
      return 'You cannot modify comment session ownership.';
    }
    if (prev.reviewerName && incoming.reviewerName && incoming.reviewerName !== prev.reviewerName) {
      return 'You cannot modify comment authorship.';
    }
    const prevShots = prev.screenshots ?? [];
    const incomingShots = incoming.screenshots ?? [];
    if (prevShots.length !== incomingShots.length) {
      return 'You cannot modify attachments on comments authored by another reviewer or from a previous review session.';
    }
    for (const ps of prevShots) {
      const is = incomingShots.find((s) => s.id === ps.id);
      if (!is) {
        return 'You cannot modify attachments on comments authored by another reviewer or from a previous review session.';
      }
      if (
        is.fileName !== ps.fileName ||
        (is.comment ?? '') !== (ps.comment ?? '') ||
        (is.storageRef && ps.storageRef && is.storageRef !== ps.storageRef)
      ) {
        return 'You cannot modify attachments on comments authored by another reviewer or from a previous review session.';
      }
    }
  }

  return null;
}

/**
 * Derives whether the task's pre-review queue status was Submitted or ReSubmitted
 * based on the most recent submission lifecycle event, WITHOUT relying on reviewCycle.
 */
function getOriginStatus(taskId: string): 'Submitted' | 'ReSubmitted' {
  const events = db.events
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  for (const e of events) {
    if (e.kind === 'Resubmitted') return 'ReSubmitted';
    if (e.kind === 'Submitted') return 'Submitted';
  }
  return 'Submitted';
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
  return requireCapability(request, 'admin.access');
}

function requireCapability(request: Request, capability: Capability) {
  const user = currentUser(request);
  if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
  if (!hasCapability(user.roles, capability)) {
    return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
  }
  return undefined;
}

function requiredReason(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function activeSuperAdminCountAfter(target: User, roles: User['roles'], isActive: boolean): number {
  return db.users.filter((user) => {
    if (user.id === target.id) return isActive && roles.includes('SuperAdmin');
    return user.isActive && user.roles.includes('SuperAdmin');
  }).length;
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
      questions: category.questions
        .slice()
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id))),
    }))
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)));
}

/** Every question in the bank, flattened — the admin grid is question-first. */
/**
 * True when a stored checklist already carries an answer to this question.
 *
 * The line between deactivate and delete: anything a developer has answered is
 * part of a submitted quality gate, so the row is retired rather than destroyed.
 * The stored answer keeps its own wording snapshot either way — this guard is
 * about not losing the question from the bank, not about the answers.
 */
function questionIsUsed(questionId: string): boolean {
  return (
    db.checklists.some((checklist) =>
      checklist.answers.some((answer) => answer.questionId === questionId),
    ) ||
    db.checklistSubmissions.some((submission) =>
      submission.categories.some((category) =>
        category.questions.some((question) => question.questionId === questionId),
      ),
    )
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

    const body = (await request.json()) as { email?: unknown; password?: unknown };
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
      if (!canAccessWorkspace(user.roles, 'developer')) {
        return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
      }
      tasks = tasks.filter((t) => t.developerId === user.id);
    } else if (scope === 'all') {
      if (!canAccessWorkspace(user.roles, 'admin')) {
        return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
      }
      // Draft tasks are private developer work and are excluded from normal Admin tasks
      tasks = tasks.filter((t) => t.status !== 'Draft');
    } else if (scope === 'available' || scope === 'assigned' || scope === 'history') {
      if (!canAccessWorkspace(user.roles, 'reviewer')) {
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
        const myDecidedReviews = db.reviews.filter(
          (review) => review.reviewerId === user.id && review.decision !== null,
        );
        const decidedByMe = new Set(myDecidedReviews.map((review) => review.taskId));

        tasks = tasks.filter((t) => {
          if (!decidedByMe.has(t.id)) return false;
          if (t.reviewerId === user.id && t.status === 'InReview') return false;
          // For ChangesRequested and Approved states, the reviewer must be the one who issued that decision
          if (t.status === 'ChangesRequested' || t.status === 'Approved') {
            const taskReviews = db.reviews
              .filter((r) => r.taskId === t.id && r.decision !== null)
              .sort((a, b) => b.reviewRound - a.reviewRound);
            const latest = taskReviews[0];
            return latest ? latest.reviewerId === user.id : false;
          }
          return true;
        });
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

    const isAdmin = canAccessWorkspace(user.roles, 'admin');
    const visible = isAdmin
      ? db.tasks.filter((t) => t.status !== 'Draft')
      : db.tasks.filter(
          (t) =>
            (t.developerId === user.id || t.reviewerId === user.id) &&
            (t.developerId === user.id || t.status !== 'Draft'),
        );

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

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    if (task.status === 'InReview' && !task.currentReviewSessionId) {
      const currentHistoricalRound = task.reviewRound;
      task.currentReviewSessionId = createReviewSessionId(task.id, currentHistoricalRound);
    }

    return HttpResponse.json(toListItem(task));
  }),

  http.get('/api/tasks/:taskId/events', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    return HttpResponse.json(eventsForTask(task.id));
  }),

  /**
   * Preview the next version for a new identity. This is advisory: POST repeats
   * the calculation and owns the assignment.
   */
  http.get('/api/task-identities/next-version', async ({ request }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
    if (!canAccessWorkspace(user.roles, 'developer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    const url = new URL(request.url);
    const customerId = url.searchParams.get('customerId')?.trim() ?? '';
    const crimId = url.searchParams.get('crimId')?.trim() ?? '';
    const customer = findCustomer(customerId);
    if (!customer || crimId === '') {
      return errorResponse(422, 'VALIDATION_FAILED', 'Select a customer and enter the CRIM ID.');
    }

    const version = peekNextTaskVersion(customer.id, crimId);
    return HttpResponse.json({
      version,
      title: deriveTaskTitle(customer.code, crimId, version),
    });
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
    if (!canAccessWorkspace(user.roles, 'developer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    const parsed = taskDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    const customer = findCustomer(parsed.data.customerId);
    if (!customer) return errorResponse(422, 'VALIDATION_FAILED', 'Unknown customer.');

    const now = new Date().toISOString();
    // Assignment and insertion are synchronous in the in-memory mock. The real
    // database must lock this identity (plus a unique constraint) in one transaction.
    const version = issueTaskVersion(customer.id, parsed.data.crimId);
    const storedVersion = String(version);

    if (
      db.tasks.some(
        (existing) =>
          taskIdentityKey(existing.customerId, existing.crimId) ===
            taskIdentityKey(customer.id, parsed.data.crimId) && existing.version === storedVersion,
      )
    ) {
      return errorResponse(409, 'VERSION_CONFLICT', 'A task with this version already exists.');
    }

    const task: Task = {
      id: `t-${crypto.randomUUID()}`,
      taskCode: issueTaskCode(customer.id),
      title: deriveTaskTitle(customer.code, parsed.data.crimId, storedVersion),
      crimId: parsed.data.crimId.trim(),
      version: storedVersion,
      customerId: customer.id,
      priority: parsed.data.priority,
      status: 'Draft',
      reviewRound: 1,
      countedCycle: 1,
      adjustedCycles: [],
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
      reviewRound: 1,
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

    if (
      (parsed.data.customerId !== undefined && parsed.data.customerId !== task.customerId) ||
      (parsed.data.crimId !== undefined &&
        taskIdentityKey(task.customerId, parsed.data.crimId) !==
          taskIdentityKey(task.customerId, task.crimId))
    ) {
      return errorResponse(
        409,
        'IMMUTABLE_TASK_IDENTITY',
        'Customer and CRIM ID cannot be changed after the draft is created.',
      );
    }
    if (parsed.data.priority !== undefined) task.priority = parsed.data.priority;
    if (parsed.data.noteToReviewer !== undefined) {
      const note = parsed.data.noteToReviewer.trim();
      task.noteToReviewer = note === '' ? null : note;
    }
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

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    const checklist = findChecklist(task.id);
    if (!checklist) {
      // 204 rather than 404: the task exists and simply has no checklist yet,
      // which is the normal state of a fresh draft.
      return new HttpResponse(null, { status: 204 });
    }

    return HttpResponse.json(checklist);
  }),

  http.get('/api/tasks/:taskId/checklist-submissions', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    return HttpResponse.json(
      checklistSubmissionSchema.array().parse(checklistSubmissionsForTask(task.id)),
    );
  }),

  http.put('/api/tasks/:taskId/checklist', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'This task is terminal and cannot be modified.');
    }
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
      .filter(
        (category) =>
          category.isActive &&
          category.applicableTaskTypeIds.some((id) => parsed.data.taskTypeIds.includes(id)),
      )
      .sort((a, b) => a.order - b.order)
      .flatMap((category) =>
        category.questions
          .filter((question) => question.isActive)
          .sort((a, b) => a.order - b.order)
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
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'Terminal tasks cannot be submitted.');
    }
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

    const checklist = findChecklist(task.id);
    if (!checklist) {
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
      const allTaskReviews = reviewsForTask(task.id);
      const activeRound = resolveActiveReviewRound(task, allTaskReviews);
      const lastReview = allTaskReviews.find(
        (candidate) => candidate.decision === 'ChangesRequested',
      );
      const allTaskResponses = db.issueResponses.filter((r) => r.taskId === task.id);
      const currentCycleResponses = allTaskResponses.filter((r) => r.reviewRound === activeRound);
      const readiness = resubmitReadiness(
        issuesFromReview(lastReview ?? null, allTaskReviews, allTaskResponses),
        currentCycleResponses,
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
    const answers = new Map(checklist.answers.map((entry) => [entry.questionId, entry.answer]));
    const snapshotCategories: ChecklistSubmission['categories'] = db.checklistTemplate
      .filter(
        (category) =>
          category.isActive &&
          category.applicableTaskTypeIds.some((id) => checklist.taskTypeIds.includes(id)),
      )
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)))
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        categoryOrder: category.order,
        questions: category.questions
          .filter((question) => question.isActive && answers.has(question.id))
          .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)))
          .map((question) => ({
            questionId: question.id,
            questionText: question.text,
            questionOrder: question.order,
            answer: answers.get(question.id) ?? 'NA',
          })),
      }))
      .filter((category) => category.questions.length > 0);
    const version = checklistSubmissionsForTask(task.id).length + 1;
    db.checklistSubmissions.push({
      id: `cls-${task.id}-${String(version)}`,
      taskId: task.id,
      version,
      submittedAt: now,
      developerId: user.id,
      taskTypes: checklist.taskTypeIds.map((id) => ({
        id,
        name: db.taskTypes.find((entry) => entry.id === id)?.name ?? id,
      })),
      categories: snapshotCategories,
      remarks: checklist.remarks,
    });
    task.status = isResubmission ? 'ReSubmitted' : 'Submitted';
    task.submittedAt = now;

    if (isResubmission) {
      const allTaskReviews = reviewsForTask(task.id);
      const activeRound = resolveActiveReviewRound(task, allTaskReviews);
      task.reviewRound = activeRound;

      // Ensure active cycle review record exists in db.reviews, preventing duplicate review cycles
      const existingReview = findReview(task.id, activeRound);
      if (!existingReview) {
        db.reviews.push({
          id: `rev-${task.id}-${String(activeRound)}`,
          taskId: task.id,
          reviewRound: activeRound,
          reviewerId: null,
          reviewerName: null,
          currentReviewSessionId: null,
          comments: [],
          generalCheck: [],
          findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
          otherRemarks: '',
          feedbackSummary: '',
          rank: null,
          previousFeedbackReviewNote: null,
          screenshots: [],
          decision: null,
          decidedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      const lastReview = allTaskReviews.find((review) => review.decision !== null);
      if (lastReview?.reviewerId) {
        db.notifications.push({
          id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
          userId: lastReview.reviewerId,
          kind: 'TaskResubmitted',
          title: `${task.taskCode} resubmitted for review`,
          body: `${user.name} responded to review findings and resubmitted (Round ${task.reviewRound}).`,
          href: `/reviewer/tasks/${task.id}`,
          taskId: task.id,
          isRead: false,
          createdAt: now,
        });
      }
    }
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: isResubmission ? 'Resubmitted' : 'Submitted',
      reviewRound: task.reviewRound,
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
    if (!canAccessWorkspace(user.roles, 'reviewer')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to this workspace.');
    }

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'Terminal tasks cannot be picked.');
    }

    if (
      task.isHandedOver ||
      db.handovers.some((h) => h.taskId === task.id && h.status === 'Pending')
    ) {
      return errorResponse(
        409,
        'HANDOVER_REQUIRES_RESOLUTION',
        'This task has an active handover request. Resolve the handover instead.',
      );
    }

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
    const currentHistoricalRound = task.reviewRound;
    const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);
    task.reviewerId = user.id;
    task.status = 'InReview';
    task.currentReviewSessionId = newSessionId;
    touch(task);

    const activeDraft = findReview(task.id, currentHistoricalRound);
    if (activeDraft?.decision === null) {
      activeDraft.reviewerId = user.id;
      activeDraft.reviewerName = user.name;
      activeDraft.currentReviewSessionId = newSessionId;
      activeDraft.rank = null;
      activeDraft.previousFeedbackReviewNote = null;
      activeDraft.updatedAt = now;
    }

    recordEvent({
      taskId: task.id,
      kind: 'Picked',
      reviewRound: task.reviewRound,
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

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    const currentHistoricalRound = task.reviewRound;
    const review = findReview(task.id, currentHistoricalRound);
    if (!review) return new HttpResponse(null, { status: 204 });

    // Defensive fallback: if task was reassigned but review record ownership wasn't updated,
    // project effective ownership in memory without mutating persisted db.reviews.
    if (review.decision === null && task.reviewerId === user.id && review.reviewerId !== user.id) {
      return HttpResponse.json({
        ...review,
        reviewerId: user.id,
        reviewerName: user.name,
      });
    }
    return HttpResponse.json(review);
  }),

  /** Every past cycle, newest first (spec section 1.5 p.11). */
  http.get('/api/tasks/:taskId/reviews', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    const reviews = reviewsForTask(task.id);
    const activeRound = resolveActiveReviewRound(task, reviews);
    const hasActiveReview = reviews.some((r) => r.reviewRound === activeRound);
    const activeRoundResponses = db.issueResponses.filter(
      (r) => r.taskId === task.id && r.reviewRound === activeRound,
    );

    const allReviewsList = [...reviews];
    if (!hasActiveReview && (task.status === 'ReSubmitted' || activeRoundResponses.length > 0)) {
      allReviewsList.unshift({
        id: `rev-${task.id}-${String(activeRound)}`,
        taskId: task.id,
        reviewRound: activeRound,
        reviewerId: task.reviewerId,
        reviewerName: task.reviewerId ? (findUser(task.reviewerId)?.name ?? null) : null,
        currentReviewSessionId: task.currentReviewSessionId ?? null,
        comments: [],
        generalCheck: [],
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
        otherRemarks: '',
        feedbackSummary: '',
        rank: null,
        previousFeedbackReviewNote: null,
        screenshots: [],
        decision: null,
        decidedAt: null,
        createdAt: task.submittedAt ?? new Date().toISOString(),
        updatedAt: task.updatedAt ?? new Date().toISOString(),
      });
    }

    const withResponses = allReviewsList.map((review) => ({
      ...review,
      responses: db.issueResponses.filter(
        (r) => r.taskId === task.id && r.reviewRound === review.reviewRound,
      ),
    }));
    return HttpResponse.json(withResponses);
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

    const review = findReview(task.id, task.reviewRound);
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

      const review = findReview(task.id, task.reviewRound);
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
      return errorResponse(
        422,
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'Check the highlighted fields.',
      );
    }

    // `ensureReview` so screenshots attached before any answer keep their row and session is allocated.
    const review = ensureReview(task, user.id, user.name);
    const existingComments = [...(review.comments ?? [])];
    const incomingComments = parsed.data.comments ?? [];
    const currentSessionId =
      task.currentReviewSessionId ?? review.currentReviewSessionId ?? undefined;
    const authorshipError = validateCommentAuthorship(
      existingComments,
      incomingComments,
      user.id,
      currentSessionId,
    );
    if (authorshipError) {
      return errorResponse(403, 'FORBIDDEN', authorshipError);
    }

    review.reviewerId = user.id;
    review.reviewerName = user.name;
    review.currentReviewSessionId = currentSessionId ?? review.currentReviewSessionId ?? null;
    review.comments = incomingComments.map((c) => {
      const prev = existingComments.find(
        (p) =>
          p.id === c.id &&
          (currentSessionId
            ? p.reviewSessionId !== currentSessionId
            : Boolean(p.reviewerId && p.reviewerId !== user.id)),
      );
      if (prev) {
        return { ...prev };
      }
      return {
        ...c,
        reviewerId: user.id,
        reviewerName: user.name,
        reviewSessionId: c.reviewSessionId ?? currentSessionId,
      };
    });
    review.generalCheck = parsed.data.generalCheck;
    review.findings = parsed.data.findings;
    review.otherRemarks = parsed.data.otherRemarks;
    review.feedbackSummary = parsed.data.feedbackSummary;
    review.rank = parsed.data.rank;
    review.previousFeedbackReviewNote = parsed.data.previousFeedbackReviewNote ?? null;
    review.previousFeedbackAcknowledged = parsed.data.previousFeedbackAcknowledged ?? false;
    review.updatedAt = new Date().toISOString();

    const url = new URL(request.url);
    const isManualSave = url.searchParams.get('source') === 'manual';

    if (isManualSave) {
      recordEvent({
        taskId: task.id,
        kind: 'ReviewDraftSaved',
        reviewRound: task.reviewRound,
        actorId: user.id,
        note: 'Review draft saved',
        occurredAt: new Date().toISOString(),
      });
    }

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

    const body = (await request.json()) as { decision?: unknown; draft?: unknown };
    const decision = body.decision === 'Approved' ? 'Approved' : 'ChangesRequested';
    const parsed = reviewDraftSchema.safeParse(body.draft);
    if (!parsed.success) {
      return errorResponse(422, 'VALIDATION_FAILED', 'Check the highlighted fields.');
    }

    const currentHistoricalRound = task.reviewRound;
    const existingReview = ensureReview(task, user.id, user.name);
    const existingComments = [...(existingReview.comments ?? [])];
    const incomingComments = parsed.data.comments ?? [];
    const currentSessionId =
      task.currentReviewSessionId ?? existingReview.currentReviewSessionId ?? undefined;

    const authorshipError = validateCommentAuthorship(
      existingComments,
      incomingComments,
      user.id,
      currentSessionId,
    );
    if (authorshipError) {
      return errorResponse(403, 'FORBIDDEN', authorshipError);
    }

    const screenshots = existingReview.screenshots ?? [];

    // Check developer responses for the previous review round (if any)
    const lastChangesReview = reviewsForTask(task.id).find(
      (r) => r.decision === 'ChangesRequested',
    );
    const qualifyingCycle = lastChangesReview?.reviewRound;

    let hasPendingAdjudication = false;
    let hasUnresolvedIssues = false;
    let allRejectionsAccepted = false;

    if (qualifyingCycle !== undefined) {
      const qualifyingResponses = db.issueResponses.filter(
        (r) => r.taskId === task.id && r.reviewRound === qualifyingCycle,
      );
      hasPendingAdjudication = qualifyingResponses.some(
        (r) => !r.verdict || r.verdict === 'Pending',
      );
      hasUnresolvedIssues = qualifyingResponses.some((r) => r.verdict === 'Overruled');

      // Qualifying for cycle decrement:
      // All comments from qualifying cycle were Rejected by developer,
      // all rejections were Accepted by reviewer, and zero were Resolved (no developer fix required)
      const hasOnlyRejections =
        qualifyingResponses.length > 0 && qualifyingResponses.every((r) => r.kind === 'Rejected');
      const allAccepted =
        hasOnlyRejections && qualifyingResponses.every((r) => r.verdict === 'Accepted');
      const noneResolved = !qualifyingResponses.some((r) => r.kind === 'Resolved');
      allRejectionsAccepted = allAccepted && noneResolved;
    }

    const normalizedComments = incomingComments.map((c) => {
      const prev = existingComments.find(
        (p) =>
          p.id === c.id &&
          (currentSessionId
            ? p.reviewSessionId !== currentSessionId
            : Boolean(p.reviewerId && p.reviewerId !== user.id)),
      );
      if (prev) {
        return { ...prev };
      }
      return {
        ...c,
        reviewerId: user.id,
        reviewerName: user.name,
        reviewSessionId: c.reviewSessionId ?? currentSessionId,
      };
    });

    const blockers = reviewBlockers(
      {
        draft: {
          ...parsed.data,
          comments: normalizedComments,
        },
        questions: db.generalCheck,
        screenshotCount: screenshots.length,
        hasPendingAdjudication,
        hasUnresolvedIssues,
        currentUserId: user.id,
        currentReviewSessionId: currentSessionId,
      },
      decision,
    );

    if (blockers.length > 0) {
      return errorResponse(
        422,
        blockers[0] === 'approveBlockedByRank'
          ? 'APPROVE_BLOCKED'
          : blockers[0] === 'unresolvedResponsesBlockApproval'
            ? 'UNRESOLVED_RESPONSES'
            : 'REVIEW_INCOMPLETE',
        blockers[0] === 'approveBlockedByRank'
          ? 'A Rank 2 or Rank 3 review cannot be approved. Request changes instead.'
          : blockers[0] === 'unresolvedResponsesBlockApproval'
            ? 'Cannot approve while findings remain unresolved or rejections are not accepted. Request changes instead.'
            : blockers[0] === 'pendingAdjudication' ||
                blockers[0] === 'pendingRejectionAdjudication'
              ? 'Adjudicate all developer responses before submitting the review.'
              : blockers[0] === 'previousFeedbackReviewNoteRequired'
                ? 'Briefly explain why the previous reviewer feedback does not require further changes before approving.'
                : blockers[0] === 'previousFeedbackAcknowledgementRequired'
                  ? 'Please acknowledge previous reviewer feedback before approving this task.'
                  : blockers[0] === 'commentsRequired'
                    ? 'Add at least one review comment before requesting changes.'
                    : blockers[0] === 'emptyComment'
                      ? 'Comments cannot be empty.'
                      : 'Complete the review before submitting it.',
      );
    }

    const now = new Date().toISOString();
    const review: Review = {
      id: existingReview.id,
      taskId: task.id,
      reviewRound: currentHistoricalRound,
      reviewerId: user.id,
      reviewerName: user.name,
      currentReviewSessionId: currentSessionId ?? null,
      comments: normalizedComments,
      generalCheck: parsed.data.generalCheck,
      findings: parsed.data.findings,
      otherRemarks: parsed.data.otherRemarks,
      feedbackSummary: parsed.data.feedbackSummary,
      rank: parsed.data.rank,
      previousFeedbackReviewNote: parsed.data.previousFeedbackReviewNote ?? null,
      previousFeedbackAcknowledged: parsed.data.previousFeedbackAcknowledged ?? false,
      screenshots,
      decision,
      decidedAt: now,
      createdAt: existingReview.createdAt ?? now,
      updatedAt: now,
    };

    const index = db.reviews.findIndex((r) => r.id === review.id);
    if (index === -1) db.reviews.push(review);
    else db.reviews[index] = review;

    if (decision === 'Approved') {
      task.status = 'Approved';
      task.currentReviewSessionId = null;
      // Safe, idempotent cycle decrement:
      if (allRejectionsAccepted && qualifyingCycle !== undefined) {
        if (!task.adjustedCycles) {
          task.adjustedCycles = [];
        }
        if (!task.adjustedCycles.includes(qualifyingCycle)) {
          const previousCountedCycle = task.countedCycle;
          const newCountedCycle = Math.max(1, task.countedCycle - 1);
          if (newCountedCycle < previousCountedCycle) {
            task.countedCycle = newCountedCycle;
            task.adjustedCycles.push(qualifyingCycle);

            const adjustmentTime = new Date(new Date(now).getTime() - 1000).toISOString();
            recordEvent({
              taskId: task.id,
              kind: 'CountedCycleAdjusted',
              reviewRound: currentHistoricalRound,
              actorId: user.id,
              qualifyingReviewRound: qualifyingCycle,
              previousCountedCycle,
              newCountedCycle,
              adjustmentAmount: previousCountedCycle - newCountedCycle,
              reason: 'All developer rejections were accepted and no fixes were required.',
              note: `Review Round ${qualifyingCycle} was excluded from the developer's effective cycle count because all rejected comments were accepted and no fixes were required.`,
              occurredAt: adjustmentTime,
            });
          }
        }
      }
      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
        userId: task.developerId,
        kind: 'TaskApproved',
        title: `${task.taskCode} approved`,
        body: `${user.name} approved your code review task (Round ${task.reviewRound}).`,
        href: `/developer/tasks/${task.id}`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });
    } else {
      task.status = 'ChangesRequested';
      // Strictly monotonic immutable historicalCycle sequence:
      const nextHistorical = nextReviewRound(task, reviewsForTask(task.id));
      task.reviewRound = nextHistorical;
      task.countedCycle = nextCountedCycle(task.countedCycle, decision);
      task.reviewerId = null;
      task.currentReviewSessionId = null;

      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
        userId: task.developerId,
        kind: 'ChangesRequested',
        title: `Changes requested on ${task.taskCode}`,
        body: `${user.name} requested changes (Round ${review.reviewRound}). Review Ranking: Rank ${parsed.data.rank}.`,
        href: `/developer/tasks/${task.id}`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });
    }
    touch(task);

    recordEvent({
      taskId: task.id,
      kind: decision === 'Approved' ? 'Approved' : 'ChangesRequested',
      reviewRound: review.reviewRound,
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

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

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
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'This task can no longer be edited.');
    }

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

    const hasHistoricalReview = db.reviews.some(
      (r) => r.taskId === task.id && r.reviewerId === user.id && r.decision !== null,
    );
    if (!canViewTask({ userId: user.id, roles: user.roles }, task, { hasHistoricalReview })) {
      return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    }

    return HttpResponse.json(db.issueResponses.filter((r) => r.taskId === task.id));
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
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'This task is terminal and cannot be modified.');
    }
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

    const allTaskReviews = reviewsForTask(task.id);
    const activeRound = resolveActiveReviewRound(task, allTaskReviews);

    const reason = (parsed.data.rejectionReason ?? '').trim();
    const commentId = parsed.data.commentId ?? null;
    const screenshotId = parsed.data.screenshotId ?? null;
    const entityKey = commentId
      ? commentId.startsWith('c-')
        ? commentId
        : `c-${commentId}`
      : screenshotId
        ? screenshotId.startsWith('s-')
          ? screenshotId
          : `s-${screenshotId}`
        : 'overall';

    const record: IssueResponseRecord = {
      id: createCycleResponseId(task.id, activeRound, entityKey),
      taskId: task.id,
      reviewRound: activeRound,
      commentId,
      screenshotId,
      kind: parsed.data.kind,
      rejectionReason: reason === '' ? null : reason,
      verdict: 'Pending',
      respondedAt: new Date().toISOString(),
    };

    // Upsert: changing your mind about a finding replaces the answer rather than
    // stacking a second one for the current cycle.
    const index = db.issueResponses.findIndex((r) => r.id === record.id);
    if (index === -1) db.issueResponses.push(record);
    else db.issueResponses[index] = record;

    return HttpResponse.json(db.issueResponses.filter((r) => r.taskId === task.id));
  }),

  /**
   * Remove a developer's response (e.g. deselecting Resolve or clearing a saved rejection).
   */
  http.delete('/api/tasks/:taskId/responses/:responseId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'This task is terminal and cannot be modified.');
    }
    if (!canRespondToFindings({ userId: user.id, roles: user.roles }, task)) {
      return errorResponse(403, 'FORBIDDEN', 'You cannot respond to this feedback.');
    }

    const responseId = String(params['responseId']);

    db.issueResponses = db.issueResponses.filter((r) => r.id !== responseId);

    return HttpResponse.json(db.issueResponses.filter((r) => r.taskId === task.id));
  }),

  /**
   * Reviewer rules on a developer's response ('Accepted' | 'Overruled') — FL 2.11.2.3-02.
   */
  http.patch('/api/tasks/:taskId/responses/:responseId/verdict', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const user = currentUser(request);
    if (!user) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');
    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'This task is terminal and cannot be modified.');
    }
    if (task.reviewerId !== user.id) {
      return errorResponse(
        403,
        'FORBIDDEN',
        'Only the assigned reviewer may evaluate developer responses.',
      );
    }

    const body = (await request.json()) as { verdict?: unknown; reviewerComment?: unknown };
    let verdict: 'Accepted' | 'Overruled' | 'Pending';
    if (body.verdict === 'Pending' || body.verdict === null || body.verdict === undefined) {
      verdict = 'Pending';
    } else if (body.verdict === 'Accepted') {
      verdict = 'Accepted';
    } else {
      verdict = 'Overruled';
    }

    const rawComment = typeof body.reviewerComment === 'string' ? body.reviewerComment.trim() : '';

    if (verdict === 'Overruled' && !rawComment) {
      return errorResponse(
        422,
        'EXPLANATION_REQUIRED',
        'An explanation is required when overruling or not accepting a developer response.',
      );
    }

    const record = db.issueResponses.find((r) => r.id === String(params['responseId']));
    if (!record) return errorResponse(404, 'NOT_FOUND', 'Response record not found.');

    record.verdict = verdict;
    record.reviewerComment = verdict === 'Overruled' && rawComment ? rawComment : null;
    record.adjudicatedAt = verdict === 'Pending' ? null : new Date().toISOString();

    return HttpResponse.json(record);
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

    const actor = currentUser(request)!;
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');
    const createsPrivilegedUser = isPrivilegedRoleSet(parsed.data.roles);
    if (createsPrivilegedUser && !hasCapability(actor.roles, 'users.manage.privileged')) {
      return errorResponse(
        403,
        'PRIVILEGED_ROLE_REQUIRED',
        'Only a Super Admin can create an Admin or Super Admin account.',
      );
    }
    const reason = requiredReason(parsed.data.reason);
    if (createsPrivilegedUser && reason === null) {
      return errorResponse(
        422,
        'REASON_REQUIRED',
        'Provide a reason for granting privileged access.',
      );
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

    if (createsPrivilegedUser && reason !== null) {
      if (user.roles.includes('Admin')) {
        recordSystemAuditEvent({
          action: 'AdminGranted',
          actorId: actor.id,
          targetType: 'User',
          targetId: user.id,
          targetLabel: user.name,
          reason,
        });
      }
      if (user.roles.includes('SuperAdmin')) {
        recordSystemAuditEvent({
          action: 'SuperAdminGranted',
          actorId: actor.id,
          targetType: 'User',
          targetId: user.id,
          targetLabel: user.name,
          reason,
        });
      }
    }

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

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const nextRoles = parsed.data.roles ?? user.roles;
    const nextActive = parsed.data.isActive ?? user.isActive;
    const targetIsPrivileged = isPrivilegedRoleSet(user.roles);
    const resultIsPrivileged = isPrivilegedRoleSet(nextRoles);
    const privilegedRoleChanged =
      user.roles.includes('Admin') !== nextRoles.includes('Admin') ||
      user.roles.includes('SuperAdmin') !== nextRoles.includes('SuperAdmin');
    const privilegedStatusChanged =
      parsed.data.isActive !== undefined &&
      parsed.data.isActive !== user.isActive &&
      (targetIsPrivileged || resultIsPrivileged);
    const privilegedMutation = targetIsPrivileged || resultIsPrivileged || privilegedRoleChanged;

    if (privilegedMutation && !hasCapability(actor.roles, 'users.manage.privileged')) {
      return errorResponse(
        403,
        'PRIVILEGED_ROLE_REQUIRED',
        'Only a Super Admin can modify a privileged account.',
      );
    }

    if (activeSuperAdminCountAfter(user, nextRoles, nextActive) === 0) {
      return errorResponse(
        422,
        'LAST_SUPER_ADMIN_REQUIRED',
        'The system must retain at least one active Super Admin.',
      );
    }

    if (
      actor.id === user.id &&
      (!nextRoles.includes('Admin') || !nextRoles.includes('SuperAdmin') || !nextActive)
    ) {
      return errorResponse(
        422,
        'SELF_LOCKOUT',
        'You cannot remove your own Admin or Super Admin access or deactivate yourself.',
      );
    }

    const reason = requiredReason(parsed.data.reason);
    if ((privilegedRoleChanged || privilegedStatusChanged) && reason === null) {
      return errorResponse(422, 'REASON_REQUIRED', 'Provide a reason for this privileged change.');
    }

    const previousRoles = [...user.roles];
    const wasActive = user.isActive;

    if (parsed.data.name !== undefined) user.name = parsed.data.name;
    if (parsed.data.email !== undefined) user.email = parsed.data.email;
    if (parsed.data.roles !== undefined) user.roles = parsed.data.roles;
    if (parsed.data.isActive !== undefined) user.isActive = parsed.data.isActive;

    if (reason !== null) {
      const roleAudits = [
        ['Admin', 'AdminGranted', 'AdminRevoked'],
        ['SuperAdmin', 'SuperAdminGranted', 'SuperAdminRevoked'],
      ] as const;
      for (const [role, granted, revoked] of roleAudits) {
        const hadRole = previousRoles.includes(role);
        const hasRoleNow = user.roles.includes(role);
        if (hadRole !== hasRoleNow) {
          recordSystemAuditEvent({
            action: hasRoleNow ? granted : revoked,
            actorId: actor.id,
            targetType: 'User',
            targetId: user.id,
            targetLabel: user.name,
            reason,
          });
        }
      }
      if (wasActive !== user.isActive && (targetIsPrivileged || resultIsPrivileged)) {
        recordSystemAuditEvent({
          action: user.isActive ? 'PrivilegedUserActivated' : 'PrivilegedUserDeactivated',
          actorId: actor.id,
          targetType: 'User',
          targetId: user.id,
          targetLabel: user.name,
          reason,
        });
      }
    }

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
    const denied = requireCapability(request, 'records.purge');
    if (denied) return denied;

    const user = findUser(String(params['userId']));
    if (!user) return errorResponse(404, 'NOT_FOUND', 'User not found.');

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Sign in to continue.');
    if (actor.id === user.id) {
      return errorResponse(422, 'SELF_DELETE', 'You cannot delete your own account.');
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = requiredReason(body.reason);
    if (reason === null) {
      return errorResponse(
        422,
        'REASON_REQUIRED',
        'Provide a reason for permanently deleting this user.',
      );
    }
    if (activeSuperAdminCountAfter(user, [], false) === 0) {
      return errorResponse(
        422,
        'LAST_SUPER_ADMIN_REQUIRED',
        'The system must retain at least one active Super Admin.',
      );
    }

    const referenced =
      db.tasks.some((t) => t.developerId === user.id || t.reviewerId === user.id) ||
      db.reviews.some((review) => review.reviewerId === user.id) ||
      db.events.some((event) => event.actorId === user.id) ||
      db.handovers.some(
        (handover) =>
          handover.fromReviewerId === user.id ||
          handover.reassignedToId === user.id ||
          handover.reassignedById === user.id,
      );
    if (referenced) {
      return errorResponse(
        409,
        'USER_IN_USE',
        'This user appears in existing workflow history. Deactivate them instead.',
      );
    }

    recordSystemAuditEvent({
      action: 'UserDeleted',
      actorId: actor.id,
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.name,
      reason,
    });
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
    const denied = requireCapability(request, 'records.purge');
    if (denied) return denied;

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const customer = findCustomer(String(params['customerId']));
    if (!customer) return errorResponse(404, 'NOT_FOUND', 'Customer not found.');

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = requiredReason(body.reason);
    if (reason === null) {
      return errorResponse(
        422,
        'REASON_REQUIRED',
        'Provide a reason for permanently deleting this customer.',
      );
    }

    if (db.tasks.some((t) => t.customerId === customer.id)) {
      return errorResponse(
        409,
        'CUSTOMER_IN_USE',
        'This customer has tasks. Deactivate them instead.',
      );
    }

    recordSystemAuditEvent({
      action: 'CustomerDeleted',
      actorId: actor.id,
      targetType: 'Customer',
      targetId: customer.id,
      targetLabel: customer.name,
      reason,
    });
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

    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'Terminal tasks cannot be assigned a reviewer.');
    }

    if (
      task.isHandedOver ||
      db.handovers.some((h) => h.taskId === task.id && h.status === 'Pending')
    ) {
      return errorResponse(
        409,
        'HANDOVER_REQUIRES_RESOLUTION',
        'This task has an active handover request. Resolve the handover instead.',
      );
    }

    if (task.status === 'ChangesRequested') {
      return errorResponse(
        422,
        'CHANGES_REQUESTED_ACTIVE',
        'Cannot assign a reviewer while changes are requested from the developer.',
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      reviewerId?: unknown;
      reason?: unknown;
    };
    const reviewer = findUser(typeof body.reviewerId === 'string' ? body.reviewerId : '');
    if (!reviewer || !reviewer.roles.includes('Reviewer') || !reviewer.isActive) {
      return errorResponse(422, 'INVALID_REVIEWER', 'Select an active reviewer.');
    }

    // The self-review bar again (spec section 1.5).
    if (reviewer.id === task.developerId) {
      return errorResponse(
        422,
        'SELF_REVIEW',
        'A developer cannot be assigned to review their own task.',
      );
    }

    const currentHistoricalRound = task.reviewRound;
    const now = new Date().toISOString();

    if (task.status === 'InReview') {
      if (!canReassignReviewer({ userId: actor.id, roles: actor.roles }, task)) {
        return errorResponse(422, 'INVALID_STATE', 'This task cannot be reassigned.');
      }
      if (reviewer.id === task.reviewerId) {
        return errorResponse(422, 'SAME_REVIEWER', 'Select a different reviewer.');
      }

      const reason = requiredReason(body.reason);
      if (reason === null) {
        return errorResponse(
          422,
          'REASON_REQUIRED',
          'Provide a reason for reassigning the reviewer.',
        );
      }

      const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);
      task.reviewerId = reviewer.id;
      task.currentReviewSessionId = newSessionId;
      touch(task);

      const activeDraft = findReview(task.id, currentHistoricalRound);
      if (activeDraft?.decision === null) {
        activeDraft.reviewerId = reviewer.id;
        activeDraft.reviewerName = reviewer.name;
        activeDraft.currentReviewSessionId = newSessionId;
        activeDraft.rank = null;
        activeDraft.previousFeedbackReviewNote = null;
        activeDraft.updatedAt = now;
      }

      recordEvent({
        taskId: task.id,
        kind: 'Reassigned',
        reviewRound: task.reviewRound,
        actorId: actor.id,
        note: `${reviewer.name} (Reason: ${reason})`,
        occurredAt: now,
      });

      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
        userId: reviewer.id,
        kind: 'TaskAssigned',
        title: `${task.taskCode} assigned for review`,
        body: `You were reassigned to review ${task.taskCode}.`,
        href: `/reviewer/tasks/${task.id}`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });

      return HttpResponse.json(toListItem(task));
    }

    if (task.status === 'Submitted' || task.status === 'ReSubmitted') {
      if (!canAssignReviewer({ userId: actor.id, roles: actor.roles }, task)) {
        return errorResponse(422, 'INVALID_STATE', 'This task cannot be assigned a reviewer.');
      }

      const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);
      task.reviewerId = reviewer.id;
      task.status = 'InReview';
      task.currentReviewSessionId = newSessionId;
      touch(task);

      const activeDraft = ensureReview(task, reviewer.id, reviewer.name);
      activeDraft.reviewerId = reviewer.id;
      activeDraft.reviewerName = reviewer.name;
      activeDraft.currentReviewSessionId = newSessionId;
      activeDraft.updatedAt = now;

      recordEvent({
        taskId: task.id,
        kind: 'ReviewerAssigned',
        reviewRound: task.reviewRound,
        actorId: actor.id,
        note: reviewer.name,
        occurredAt: now,
      });

      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
        userId: reviewer.id,
        kind: 'TaskAssigned',
        title: `${task.taskCode} assigned for review`,
        body: `You have been assigned to review ${task.taskCode}.`,
        href: `/reviewer/tasks/${task.id}`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });

      return HttpResponse.json(toListItem(task));
    }

    return errorResponse(422, 'INVALID_STATE', 'This task cannot be assigned a reviewer.');
  }),

  /** Explicit reassign endpoint */
  http.post('/api/tasks/:taskId/reassign', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    if (isTerminalTask(task.status)) {
      return errorResponse(409, 'INVALID_STATE', 'Terminal tasks cannot be reassigned.');
    }

    if (
      task.isHandedOver ||
      db.handovers.some((h) => h.taskId === task.id && h.status === 'Pending')
    ) {
      return errorResponse(
        409,
        'HANDOVER_REQUIRES_RESOLUTION',
        'This task has an active handover request. Resolve the handover instead.',
      );
    }

    if (!canReassignReviewer({ userId: actor.id, roles: actor.roles }, task)) {
      return errorResponse(422, 'INVALID_STATE', 'This task cannot be reassigned.');
    }

    const body = (await request.json().catch(() => ({}))) as {
      reviewerId?: unknown;
      reason?: unknown;
    };
    const reviewer = findUser(typeof body.reviewerId === 'string' ? body.reviewerId : '');
    if (!reviewer || !reviewer.roles.includes('Reviewer') || !reviewer.isActive) {
      return errorResponse(422, 'INVALID_REVIEWER', 'Select an active reviewer.');
    }

    if (reviewer.id === task.developerId) {
      return errorResponse(
        422,
        'SELF_REVIEW',
        'A developer cannot be assigned to review their own task.',
      );
    }

    if (reviewer.id === task.reviewerId) {
      return errorResponse(422, 'SAME_REVIEWER', 'Select a different reviewer.');
    }

    const reason = requiredReason(body.reason);
    if (reason === null) {
      return errorResponse(
        422,
        'REASON_REQUIRED',
        'Provide a reason for reassigning the reviewer.',
      );
    }

    const currentHistoricalRound = task.reviewRound;
    const now = new Date().toISOString();
    const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);

    task.reviewerId = reviewer.id;
    task.currentReviewSessionId = newSessionId;
    touch(task);

    const activeDraft = findReview(task.id, currentHistoricalRound);
    if (activeDraft?.decision === null) {
      activeDraft.reviewerId = reviewer.id;
      activeDraft.reviewerName = reviewer.name;
      activeDraft.currentReviewSessionId = newSessionId;
      activeDraft.rank = null;
      activeDraft.previousFeedbackReviewNote = null;
      activeDraft.updatedAt = now;
    }

    recordEvent({
      taskId: task.id,
      kind: 'Reassigned',
      reviewRound: task.reviewRound,
      actorId: actor.id,
      note: `${reviewer.name} (Reason: ${reason})`,
      occurredAt: now,
    });

    db.notifications.push({
      id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
      userId: reviewer.id,
      kind: 'TaskAssigned',
      title: `${task.taskCode} assigned for review`,
      body: `You were reassigned to review ${task.taskCode}.`,
      href: `/reviewer/tasks/${task.id}`,
      taskId: task.id,
      isRead: false,
      createdAt: now,
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

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = requiredReason(body.reason);
    if (reason === null) {
      return errorResponse(422, 'REASON_REQUIRED', 'Provide a reason for cancelling this task.');
    }

    const previousReviewerId = task.reviewerId;
    const now = new Date().toISOString();

    task.status = 'Cancelled';
    task.reviewerId = null;
    task.currentReviewSessionId = null;
    task.isHandedOver = false;
    touch(task);

    // Cancel pending handover if one exists
    const pendingHandover = db.handovers.find(
      (h) => h.taskId === task.id && h.status === 'Pending',
    );
    if (pendingHandover) {
      pendingHandover.status = 'Cancelled';
      pendingHandover.resolvedAt = now;
    }

    const currentHistoricalRound = task.reviewRound;
    const activeDraft = findReview(task.id, currentHistoricalRound);
    if (activeDraft?.decision === null) {
      activeDraft.currentReviewSessionId = null;
    }

    recordEvent({
      taskId: task.id,
      kind: 'Cancelled',
      reviewRound: task.reviewRound,
      actorId: actor.id,
      note: reason,
      occurredAt: now,
    });

    db.notifications.push({
      id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
      userId: task.developerId,
      kind: 'TaskCancelled',
      title: `${task.taskCode} was cancelled`,
      body: `Admin cancelled this task. Reason: ${reason}`,
      href: `/developer/tasks/${task.id}`,
      taskId: task.id,
      isRead: false,
      createdAt: now,
    });

    if (previousReviewerId) {
      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 2)}`,
        userId: previousReviewerId,
        kind: 'TaskCancelled',
        title: `${task.taskCode} review was cancelled`,
        body: `Admin cancelled this task. Reason: ${reason}`,
        href: `/reviewer/tasks/${task.id}`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });
    }

    return HttpResponse.json(toListItem(task));
  }),

  http.delete('/api/tasks/:taskId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const actor = currentUser(request);
    if (!actor) return errorResponse(401, 'NOT_AUTHENTICATED', 'Not authenticated.');

    const task = findTask(String(params['taskId']));
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    // 1. Developer Discard Draft
    if (
      actor.roles.includes('Developer') &&
      actor.id === task.developerId &&
      task.status === 'Draft'
    ) {
      const hasSubmittedEvidence =
        db.checklistSubmissions.some((s) => s.taskId === task.id) ||
        db.reviews.some((r) => r.taskId === task.id && r.decision !== null);
      if (hasSubmittedEvidence) {
        return errorResponse(
          409,
          'DRAFT_HAS_SUBMITTED_EVIDENCE',
          'This draft has submitted evidence and cannot be discarded.',
        );
      }

      db.tasks = db.tasks.filter((t) => t.id !== task.id);
      db.checklists = db.checklists.filter((c) => c.taskId !== task.id);
      db.attachments = db.attachments.filter((a) => a.taskId !== task.id);
      db.events = db.events.filter((e) => e.taskId !== task.id);

      return new HttpResponse(null, { status: 204 });
    }

    // 2. Super Admin Permanent Purge
    if (!hasCapability(actor.roles, 'records.purge')) {
      return errorResponse(403, 'FORBIDDEN', 'You do not have access to purge tasks.');
    }

    const flags: PurgeEvidenceFlags = {
      hasSubmittedSnapshot: db.checklistSubmissions.some((s) => s.taskId === task.id),
      hasReviews: db.reviews.some((r) => r.taskId === task.id && r.decision !== null),
      hasReviewComments: db.reviews.some(
        (r) => r.taskId === task.id && (r.comments?.length ?? 0) > 0,
      ),
      hasReviewScreenshots: db.reviews.some(
        (r) => r.taskId === task.id && (r.screenshots?.length ?? 0) > 0,
      ),
      hasIssueResponses: db.issueResponses.some((r) => r.taskId === task.id),
      hasAdjudication: db.issueResponses.some(
        (r) => r.taskId === task.id && r.verdict !== 'Pending' && r.verdict !== null,
      ),
      hasHandoverHistory: db.handovers.some((h) => h.taskId === task.id),
      hasReviewSessions: Boolean(task.currentReviewSessionId),
      hasWorkflowEvents: db.events.some(
        (e) => e.taskId === task.id && e.kind !== 'Created' && e.kind !== 'ReviewDraftSaved',
      ),
    };

    if (!canPurgeTask({ userId: actor.id, roles: actor.roles }, task, flags)) {
      return errorResponse(
        409,
        'TASK_HAS_WORKFLOW_EVIDENCE',
        'Tasks with submitted review evidence, review comments, or workflow history cannot be permanently deleted.',
      );
    }

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = requiredReason(body.reason);
    if (reason === null) {
      return errorResponse(
        422,
        'REASON_REQUIRED',
        'Provide a reason for permanently deleting this task.',
      );
    }

    recordSystemAuditEvent({
      action: 'TaskDeleted',
      actorId: actor.id,
      targetType: 'Task',
      targetId: task.id,
      targetLabel: task.taskCode,
      reason,
    });

    db.tasks = db.tasks.filter((t) => t.id !== task.id);
    db.checklists = db.checklists.filter((c) => c.taskId !== task.id);
    db.checklistSubmissions = db.checklistSubmissions.filter((entry) => entry.taskId !== task.id);
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
      order: nextOrder(db.taskTypes),
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

    if (
      parsed.data.name !== undefined &&
      db.taskTypes.some(
        (t) => t.id !== record.id && t.name.toLowerCase() === parsed.data.name?.toLowerCase(),
      )
    ) {
      return errorResponse(409, 'NAME_TAKEN', 'A task type with that name already exists.');
    }
    if (parsed.data.name !== undefined) record.name = parsed.data.name;
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
    if (db.checklistTemplate.some((category) => category.applicableTaskTypeIds.includes(id))) {
      return errorResponse(
        409,
        'TASK_TYPE_IN_USE',
        'Checklist categories still target this task type. Remove it from them first.',
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

    if (
      parsed.data.applicableTaskTypeIds.some(
        (id) => !db.taskTypes.some((type) => type.id === id && type.isActive),
      )
    ) {
      return errorResponse(422, 'INVALID_TASK_TYPE', 'Choose one or more active task types.');
    }

    if (db.checklistTemplate.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return errorResponse(409, 'NAME_TAKEN', 'A category with that name already exists.');
    }

    const category: ChecklistCategory = {
      id: `cat-${slug(parsed.data.name)}-${String(Date.now())}`,
      name: parsed.data.name,
      order: parsed.data.order ?? nextOrder(db.checklistTemplate),
      isActive: true,
      applicableTaskTypeIds: parsed.data.applicableTaskTypeIds,
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

    if (
      parsed.data.name !== undefined &&
      db.checklistTemplate.some(
        (entry) =>
          entry.id !== category.id && entry.name.toLowerCase() === parsed.data.name?.toLowerCase(),
      )
    ) {
      return errorResponse(409, 'NAME_TAKEN', 'A category with that name already exists.');
    }
    if (
      parsed.data.applicableTaskTypeIds?.some((id) => !db.taskTypes.some((type) => type.id === id))
    ) {
      return errorResponse(422, 'INVALID_TASK_TYPE', 'One of those task types does not exist.');
    }
    if (parsed.data.name !== undefined) category.name = parsed.data.name;
    if (parsed.data.applicableTaskTypeIds !== undefined)
      category.applicableTaskTypeIds = parsed.data.applicableTaskTypeIds;
    if (parsed.data.order !== undefined && parsed.data.order !== category.order) {
      const siblings = db.checklistTemplate.filter((entry) => entry.id !== category.id);
      if (siblings.some((entry) => entry.order === parsed.data.order)) {
        const shifted = siblings.map((entry) =>
          entry.order >= parsed.data.order! ? { ...entry, order: entry.order + 1 } : entry,
        );
        db.checklistTemplate = db.checklistTemplate.map(
          (entry) => shifted.find((item) => item.id === entry.id) ?? entry,
        );
      }
      category.order = parsed.data.order;
    }
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
    const targetOwner =
      parsed.data.categoryId === undefined || parsed.data.categoryId === owner.id
        ? owner
        : db.checklistTemplate.find((c) => c.id === parsed.data.categoryId);
    if (!targetOwner)
      return errorResponse(422, 'INVALID_CATEGORY', 'That category does not exist.');

    if (targetOwner.id !== owner.id) {
      // Cross-category move: if order is omitted, append to end of target category
      const requested = parsed.data.order ?? nextQuestionOrder(targetOwner.questions);
      const siblings = targetOwner.questions.filter((q) => q.id !== id);

      if (questionAtOrder(siblings, requested) !== undefined) {
        const shifted = shiftOrdersFrom(siblings, requested);
        targetOwner.questions = targetOwner.questions.map(
          (q) => shifted.find((s) => s.id === q.id) ?? q,
        );
      }

      question.order = requested;
      owner.questions = resequenceAfterRemoval(
        owner.questions.filter((q) => q.id !== id).sort((a, b) => a.order - b.order),
      );
      question.categoryId = targetOwner.id;
      targetOwner.questions.push(question);
    } else if (parsed.data.order !== undefined && parsed.data.order !== question.order) {
      const requested = parsed.data.order;
      const siblings = targetOwner.questions.filter((q) => q.id !== id);

      if (questionAtOrder(siblings, requested) !== undefined) {
        const shifted = shiftOrdersFrom(siblings, requested);
        targetOwner.questions = targetOwner.questions.map(
          (q) => shifted.find((s) => s.id === q.id) ?? q,
        );
      }

      question.order = requested;
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
    if (scope === 'reviewer' && !canAccessWorkspace(user.roles, 'reviewer')) {
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
        findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
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
   * What it does:
   * 1. Validates reviewer ownership and InReview state.
   * 2. Prevents duplicate / concurrent handovers.
   * 3. Validates mandatory trimmed reason.
   * 4. Persists the latest live draft (preserving rankings, comments, screenshots, and authorship).
   * 5. Clears reviewerId to null.
   * 6. Restores pre-review status (Submitted vs ReSubmitted) derived from lifecycle events.
   * 7. Quarantines the task (isHandedOver = true).
   * 8. Leaves reviewCycle unchanged.
   * 9. Creates a Pending handover record.
   * 10. Dispatches TaskHandedOver notification to all active Admins.
   * 11. Records HandedOver audit event.
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

    if (task.isHandedOver) {
      return errorResponse(409, 'ALREADY_HANDED_OVER', 'This task has already been handed over.');
    }

    // Only one Pending handover may exist per task
    const existingPending = db.handovers.find(
      (h) => h.taskId === task.id && h.status === 'Pending',
    );
    if (existingPending) {
      return errorResponse(
        409,
        'ALREADY_HANDED_OVER',
        'A handover is already pending for this task.',
      );
    }

    const parsed = createHandoverInputSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(422, 'VALIDATION_FAILED', firstIssue(parsed.error));

    const now = new Date().toISOString();

    // Persist the latest supplied draft atomically if provided
    const currentSessionId =
      task.currentReviewSessionId ??
      findReview(task.id, task.reviewRound)?.currentReviewSessionId ??
      undefined;
    if (parsed.data.draft) {
      const review = ensureReview(task, user.id, user.name);
      // Handover transfers unfinished review context, NEVER a final rank
      review.rank = null;
      review.previousFeedbackReviewNote = null;
      if (parsed.data.draft.comments) {
        const existingComments =
          findReview(task.id, task.reviewRound)?.comments ?? [];
        const authorshipError = validateCommentAuthorship(
          existingComments,
          parsed.data.draft.comments,
          user.id,
          currentSessionId,
        );
        if (authorshipError) {
          return errorResponse(403, 'FORBIDDEN', authorshipError);
        }
        review.comments = parsed.data.draft.comments.map((c) => {
          const prev = existingComments.find(
            (p) =>
              p.id === c.id &&
              (currentSessionId
                ? p.reviewSessionId !== currentSessionId
                : Boolean(p.reviewerId && p.reviewerId !== user.id)),
          );
          if (prev) return { ...prev };
          return {
            ...c,
            reviewerId: c.reviewerId ?? user.id,
            reviewerName: c.reviewerName ?? user.name,
            reviewSessionId: c.reviewSessionId ?? currentSessionId,
          };
        });
      }
      if (parsed.data.draft.generalCheck) {
        review.generalCheck = parsed.data.draft.generalCheck;
      }
      if (parsed.data.draft.findings) {
        review.findings = parsed.data.draft.findings;
      }
      if (parsed.data.draft.otherRemarks !== undefined) {
        review.otherRemarks = parsed.data.draft.otherRemarks;
      }
      if (parsed.data.draft.feedbackSummary !== undefined) {
        review.feedbackSummary = parsed.data.draft.feedbackSummary;
      }
      review.updatedAt = now;
    }

    const handover: Handover = {
      id: generateHandoverId({
        existingIds: db.handovers.map((h) => h.id),
        date: new Date(now),
      }),
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
    task.currentReviewSessionId = null;
    const currentReview = findReview(task.id, task.reviewRound);
    if (currentReview?.decision === null) {
      currentReview.currentReviewSessionId = null;
      currentReview.rank = null;
    }
    // Derive pre-review queue status safely from lifecycle events, NOT from reviewCycle
    task.status = getOriginStatus(task.id);
    touch(task);

    const adminUsers = db.users.filter((u) => u.roles.includes('Admin') && u.isActive);
    for (const admin of adminUsers) {
      db.notifications.push({
        id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
        userId: admin.id,
        kind: 'TaskHandedOver',
        title: `${task.taskCode} review handed over`,
        body: `${user.name} handed over review for ${task.taskCode}. Reason: ${parsed.data.reason}`,
        href: `/admin/handovers`,
        taskId: task.id,
        isRead: false,
        createdAt: now,
      });
    }

    recordEvent({
      taskId: task.id,
      kind: 'HandedOver',
      reviewRound: task.reviewRound,
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

    const rank: Record<string, number> = {
      Pending: 0,
      Reassigned: 1,
      ReturnedToQueue: 2,
      Cancelled: 2,
    };

    return HttpResponse.json(
      db.handovers
        .slice()
        .sort(
          (a, b) =>
            (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || b.createdAt.localeCompare(a.createdAt),
        ),
    );
  }),

  /** A single handover by ID for the admin detail view. */
  http.get('/api/handovers/:handoverId', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const handover = db.handovers.find((h) => h.id === String(params['handoverId']));
    if (!handover) return errorResponse(404, 'NOT_FOUND', 'Handover not found.');

    return HttpResponse.json(handover);
  }),

  /** Read-only preserved review draft for an admin inspecting a handover. */
  http.get('/api/handovers/:handoverId/draft', async ({ request, params }) => {
    await delay(LATENCY_MS);
    const denied = requireAdmin(request);
    if (denied) return denied;

    const handover = db.handovers.find((h) => h.id === String(params['handoverId']));
    if (!handover) return errorResponse(404, 'NOT_FOUND', 'Handover not found.');

    const task = findTask(handover.taskId);
    if (!task) return errorResponse(404, 'NOT_FOUND', 'Task not found.');

    const currentHistoricalRound = task.reviewRound;
    const review = findReview(task.id, currentHistoricalRound);
    if (!review) return new HttpResponse(null, { status: 204 });

    return HttpResponse.json(review);
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
    if (!task.isHandedOver) {
      return errorResponse(409, 'INVALID_STATE', 'This task is not currently handed over.');
    }

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
    const currentHistoricalRound = task.reviewRound;
    const newSessionId = createReviewSessionId(task.id, currentHistoricalRound);
    task.reviewerId = reviewer.id;
    task.isHandedOver = false;
    task.status = 'InReview';
    task.currentReviewSessionId = newSessionId;
    touch(task);

    const activeDraft = findReview(task.id, currentHistoricalRound);
    if (activeDraft?.decision === null) {
      activeDraft.reviewerId = reviewer.id;
      activeDraft.reviewerName = reviewer.name;
      activeDraft.currentReviewSessionId = newSessionId;
      activeDraft.rank = null;
      activeDraft.previousFeedbackReviewNote = null;
      activeDraft.updatedAt = now;
    }

    handover.status = 'Reassigned';
    handover.reassignedToId = reviewer.id;
    handover.reassignedToName = reviewer.name;
    handover.reassignedById = actor.id;
    handover.resolvedAt = now;

    db.notifications.push({
      id: `n-${String(Date.now())}-${String(db.notifications.length + 1)}`,
      userId: reviewer.id,
      kind: 'TaskAssigned',
      title: `Assigned to review ${task.taskCode}`,
      body: `You have been assigned to review ${task.taskCode} following a handover.`,
      href: `/reviewer/tasks/${task.id}`,
      taskId: task.id,
      isRead: false,
      createdAt: now,
    });

    recordEvent({
      taskId: task.id,
      kind: 'Reassigned',
      reviewRound: task.reviewRound,
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
    if (!task.isHandedOver) {
      return errorResponse(409, 'INVALID_STATE', 'This task is not currently handed over.');
    }

    const now = new Date().toISOString();
    task.isHandedOver = false;
    task.reviewerId = null;
    task.currentReviewSessionId = null;
    task.status = getOriginStatus(task.id);
    touch(task);

    const currentHistoricalRound = task.reviewRound;
    const activeDraft = findReview(task.id, currentHistoricalRound);
    if (activeDraft?.decision === null) {
      activeDraft.currentReviewSessionId = null;
      activeDraft.rank = null;
      activeDraft.previousFeedbackReviewNote = null;
      activeDraft.updatedAt = now;
    }

    handover.status = 'ReturnedToQueue';
    handover.resolvedAt = now;
    handover.reassignedById = actor.id;

    recordEvent({
      taskId: task.id,
      kind: 'ReturnedToQueue',
      reviewRound: task.reviewRound,
      actorId: actor.id,
      note: 'Returned to open review queue',
      occurredAt: now,
    });

    return HttpResponse.json(handover);
  }),

  /* ---------------------------------------------------------- system audit */

  http.get('/api/system-audit-events', async ({ request }) => {
    await delay(LATENCY_MS);
    const denied = requireCapability(request, 'audit.system.view');
    if (denied) return denied;

    return HttpResponse.json(
      systemAuditEventSchema
        .array()
        .parse(db.auditEvents.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))),
    );
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
