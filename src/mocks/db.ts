import { z } from 'zod';
import {
  checklistCategorySchema,
  customerSchema,
  notificationSchema,
  taskChecklistSchema,
  taskTypeRecordSchema,
  generalCheckQuestionSchema,
  taskEventSchema,
  taskSchema,
  userSchema,
  type ChecklistCategory,
  type GeneralCheckQuestion,
  type Handover,
  type IssueResponseRecord,
  type TaskAttachment,
  type Review,
  type TaskTypeRecord,
  type Customer,
  type Notification,
  type Task,
  type TaskChecklist,
  type TaskEvent,
  type TaskListItem,
  type User,
} from '@sdp/contracts';
import rawUsers from './data/users.json';
import rawCustomers from './data/customers.json';
import rawTasks from './data/tasks.json';
import rawNotifications from './data/notifications.json';
import rawChecklistTemplate from './data/checklistTemplate.json';
import rawTaskTypes from './data/taskTypes.json';
import rawGeneralCheck from './data/generalCheck.json';

/**
 * In-memory store behind the MSW handlers.
 *
 * Deleted wholesale in Phase 2 — nothing outside `src/mocks/` imports it.
 *
 * The seed JSON is validated against the real domain schemas on load. That is
 * the point: if someone edits `tasks.json` into a shape the app cannot render,
 * it fails loudly at startup with a Zod path instead of producing `undefined`
 * three components deep. It also keeps the fixtures honest as the schemas
 * evolve, which is what stops mock/API drift (plan risk R5).
 */

function seed<TSchema extends z.ZodTypeAny>(
  label: string,
  raw: unknown,
  schema: TSchema,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Mock seed data for "${label}" does not match its schema:\n` +
        JSON.stringify(result.error.issues, null, 2),
    );
  }
  return result.data;
}

/** A notification carries the owning user, which the wire format does not. */
const storedNotificationSchema = notificationSchema.extend({
  userId: z.string().min(1),
});
type StoredNotification = Notification & { userId: string };

interface Database {
  users: User[];
  customers: Customer[];
  tasks: Task[];
  notifications: StoredNotification[];
  taskTypes: TaskTypeRecord[];
  checklistTemplate: ChecklistCategory[];
  generalCheck: GeneralCheckQuestion[];
  handovers: Handover[];
  reviews: Review[];
  issueResponses: IssueResponseRecord[];
  attachments: TaskAttachment[];
  checklists: TaskChecklist[];
  events: TaskEvent[];
  /**
   * Per-customer task number, the counter behind `AASL-019` (plan risk R2).
   *
   * Kept as its own map rather than derived from `tasks` by max(): deleting a
   * task must not make the next create reuse its number, and Phase 2 models this
   * as a `customer_sequences` row locked `FOR UPDATE` inside the create
   * transaction. Modelling it the same way here keeps the two honest.
   */
  sequences: Record<string, number>;
}

/**
 * Customers are validated once, up front, rather than cast at each use — the
 * title derivation below depends on them, so a malformed customer fixture
 * should fail here with a Zod path rather than silently produce
 * "Unknown - 4.44" titles across the whole app.
 */
const seededCustomers: Customer[] = seed('customers', rawCustomers, customerSchema.array());

/** Validated once, and read by `seedReviews` to resolve reviewer names. */
const seededUsers: User[] = seed('users', rawUsers, userSchema.array());

/**
 * Title generation, spec FL 2.5-01: `Customer - CRIM ID[ Version]`.
 *
 * Derived here rather than written into the fixtures, so the seed data cannot
 * disagree with the rule the application enforces at create time.
 */
function withDerivedFields(task: Record<string, unknown>): Record<string, unknown> {
  const customer = seededCustomers.find((c) => c.id === task['customerId']);
  const version = task['version'] as string | null;
  const base = `${customer?.name ?? 'Unknown'} - ${String(task['crimId'])}`;

  return {
    ...task,
    title: version === null ? base : `${base} ${version}`,
    updatedAt: task['submittedAt'] ?? task['createdAt'],
  };
}

function buildDatabase(): Database {
  const tasks = seed(
    'tasks',
    (rawTasks as Record<string, unknown>[]).map(withDerivedFields),
    taskSchema.array(),
  );

  const template = seed('checklistTemplate', rawChecklistTemplate, checklistCategorySchema.array());

  return {
    users: seededUsers.map((u) => ({ ...u })),
    // Cloned so runtime mutations cannot write back into the module-level copy
    // that `withDerivedFields` reads, which would break `resetDb()`.
    customers: seededCustomers.map((c) => ({ ...c })),
    tasks,
    notifications: seed('notifications', rawNotifications, storedNotificationSchema.array()),
    taskTypes: seed('taskTypes', rawTaskTypes, taskTypeRecordSchema.array()),
    checklistTemplate: template,
    generalCheck: seed('generalCheck', rawGeneralCheck, generalCheckQuestionSchema.array()),
    handovers: [],
    reviews: seedReviews(tasks),
    issueResponses: [],
    attachments: [],
    checklists: seedChecklists(tasks, template),
    events: seedEvents(tasks),
    sequences: seedSequences(tasks),
  };
}

/**
 * Decided reviews for the cycles a task has already been through.
 *
 * Without these the Reports tab renders every metric as zero — approval rate,
 * average rank, cycle distribution all read from decided reviews — which would
 * make the whole screen untestable and unreviewable.
 *
 * Derived from the task's own `reviewCycle` rather than fixtured, so the seed
 * cannot contradict the cycle rule: a cycle increments only on Request Changes,
 * so cycles 1…n-1 were all Request Changes, and only an Approved task has a
 * decided review at its CURRENT cycle. Every other status leaves the current
 * cycle undecided, which is what lets a reviewer still open and submit it.
 */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Days between one cycle's decision and the next. */
const CYCLE_GAP_DAYS = 3;

/**
 * A stable number in `[min, max)` derived from a string.
 *
 * Deterministic on purpose. `Math.random()` here would give every test run a
 * different average turnaround, and the metrics tests assert on figures the seed
 * produces — a fixture that changes between runs is a flake generator, not a
 * fixture.
 */
function hashedRange(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return min + (Math.abs(hash) % (max - min));
}

/**
 * Decided reviews for the cycles a task has already been through.
 *
 * Without these the Reports tab renders every metric as zero — approval rate,
 * average rank, cycle distribution all read from decided reviews — which would
 * make the whole screen untestable and unreviewable.
 *
 * Derived from the task's own `reviewCycle` rather than fixtured, so the seed
 * cannot contradict the cycle rule: a cycle increments only on Request Changes,
 * so cycles 1…n-1 were all Request Changes, and only an Approved task has a
 * decided review at its CURRENT cycle. Every other status leaves the current
 * cycle undecided, which is what lets a reviewer still open and submit it.
 *
 * TIME IS DERIVED TOO, and it used not to be. Every review once carried one
 * value in `createdAt`, `decidedAt` and `updatedAt` — `task.submittedAt` — which
 * made three separate things wrong at once: turnaround was zero for every review
 * in the product, all six cycles of a long-running task landed on a single
 * instant so any activity-over-time series was a spike rather than a trend, and
 * `decidedAt` claimed a decision happened at the moment of submission. Cycles
 * are now walked backwards from the latest submission and each review opens
 * before it is decided.
 */
function seedReviews(tasks: Task[]): Review[] {
  const reviews: Review[] = [];

  for (const task of tasks) {
    if (task.reviewerId === null) continue;

    const isApproved = task.status === 'Approved' || task.status === 'Delivered';
    const decidedCycles = isApproved ? task.reviewCycle : task.reviewCycle - 1;
    const latest = Date.parse(task.submittedAt ?? task.createdAt);

    for (let cycle = 1; cycle <= decidedCycles; cycle += 1) {
      const isFinalApproval = isApproved && cycle === task.reviewCycle;
      const id = `rev-${task.id}-${String(cycle)}`;

      /*
       * Walk backwards from the most recent submission: the LAST decided cycle
       * sits at `submittedAt` and each earlier one is three days before it. That
       * keeps the cycles in the order they actually happened, which is what
       * gives an activity chart a real x-axis.
       */
      const decidedMs = latest - (decidedCycles - cycle) * CYCLE_GAP_DAYS * DAY_MS;
      // 2–72 hours from opening the review to deciding it. Wide enough that the
      // turnaround buckets on the reviewer's Analytics tab all have occupants.
      const turnaroundHours = hashedRange(id, 2, 72);

      const decidedAt = new Date(decidedMs).toISOString();
      const createdAt = new Date(decidedMs - turnaroundHours * HOUR_MS).toISOString();

      reviews.push({
        id,
        taskId: task.id,
        reviewCycle: cycle,
        reviewerId: task.reviewerId,
        reviewerName: seededUsers.find((u) => u.id === task.reviewerId)?.name ?? 'Unknown',
        generalCheck: [],
        findings: isFinalApproval
          ? {
              incorrectCode: '',
              incompleteImplementation: '',
              sourceFormatting: '',
            }
          : {
              incorrectCode: 'Logic does not cover the cancellation path.',
              incompleteImplementation: '',
              sourceFormatting: '',
            },
        otherRemarks: '',
        feedbackSummary: isFinalApproval
          ? 'Looks good. Approved.'
          : 'Please address the findings above and resubmit.',
        // Rank 1 permits approval; 2 and 3 force the Request Changes path
        // (FL 2.9.2.5-01), so a Request Changes cycle can never carry rank 1.
        rank: isFinalApproval ? 1 : cycle % 2 === 0 ? 3 : 2,
        screenshots: [],
        decision: isFinalApproval ? 'Approved' : 'ChangesRequested',
        decidedAt,
        createdAt,
        updatedAt: decidedAt,
      });
    }
  }

  return reviews;
}

/**
 * Every task that claims a complete checklist gets one, fully answered.
 *
 * Derived rather than fixtured because the answer set depends on the task's
 * types and on the template — a hand-written fixture would silently disagree
 * with `checklistRules.answersComplete()` the first time a question is added.
 */
function seedChecklists(tasks: Task[], template: ChecklistCategory[]): TaskChecklist[] {
  return tasks
    .filter((task) => task.isChecklistComplete && task.taskTypeIds.length > 0)
    .map((task) => {
      // Same filter the domain layer applies: a question renders when it is
      // active and covers one of the task's types.
      const questions = template
        .filter((category) => category.isActive)
        .flatMap((category) =>
          category.questions
            .filter(
              (question) =>
                question.isActive && question.appliesTo.some((id) => task.taskTypeIds.includes(id)),
            )
            .map((question) => ({ question, categoryName: category.name })),
        );

      return taskChecklistSchema.parse({
        id: `cl-${task.id}`,
        taskId: task.id,
        taskTypeIds: task.taskTypeIds,
        // A deterministic sprinkle of "No" so the issue count is non-zero on
        // some tasks — an all-Yes seed would never exercise the issue badge.
        answers: questions.map(({ question, categoryName }, index) => ({
          questionId: question.id,
          answer: index % 7 === 3 ? 'No' : 'Yes',
          // The wording is snapshotted here exactly as the handler does it, so
          // seeded history behaves identically to history created at runtime.
          questionText: question.text,
          categoryName,
          order: index,
        })),
        remarks: '',
        isComplete: true,
        checkedDate: task.submittedAt ?? task.createdAt,
        developerId: task.developerId,
      });
    });
}

/** A minimal audit trail so the detail screens have real history to render. */
function seedEvents(tasks: Task[]): TaskEvent[] {
  const events: TaskEvent[] = [];

  for (const task of tasks) {
    events.push({
      id: `ev-${task.id}-created`,
      taskId: task.id,
      kind: 'Created',
      reviewCycle: 1,
      actorId: task.developerId,
      actorName: '',
      note: null,
      occurredAt: task.createdAt,
    });

    if (task.submittedAt !== null) {
      events.push({
        id: `ev-${task.id}-submitted`,
        taskId: task.id,
        kind: 'Submitted',
        reviewCycle: 1,
        actorId: task.developerId,
        actorName: '',
        note: null,
        occurredAt: task.submittedAt,
      });
    }

    if (task.reviewerId !== null) {
      events.push({
        id: `ev-${task.id}-picked`,
        taskId: task.id,
        kind: 'Picked',
        reviewCycle: task.reviewCycle,
        actorId: task.reviewerId,
        actorName: '',
        note: null,
        occurredAt: task.updatedAt,
      });
    }
  }

  return events.map((event) => taskEventSchema.parse(event));
}

/** Highest number already issued per customer, so the next create continues it. */
function seedSequences(tasks: Task[]): Record<string, number> {
  const sequences: Record<string, number> = {};

  for (const task of tasks) {
    const trailing = /-(\d+)$/.exec(task.taskCode);
    const issued = trailing === null ? 0 : Number(trailing[1]);
    sequences[task.customerId] = Math.max(sequences[task.customerId] ?? 0, issued);
  }

  return sequences;
}

export const db: Database = buildDatabase();

/** Restores the seed state so tests cannot leak mutations into each other. */
export function resetDb(): void {
  const fresh = buildDatabase();
  db.users = fresh.users;
  db.customers = fresh.customers;
  db.tasks = fresh.tasks;
  db.notifications = fresh.notifications;
  db.taskTypes = fresh.taskTypes;
  db.checklistTemplate = fresh.checklistTemplate;
  db.generalCheck = fresh.generalCheck;
  db.handovers = fresh.handovers;
  db.reviews = fresh.reviews;
  db.issueResponses = fresh.issueResponses;
  db.attachments = fresh.attachments;
  db.checklists = fresh.checklists;
  db.events = fresh.events;
  db.sequences = fresh.sequences;
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

export function findUser(userId: string): User | undefined {
  return db.users.find((u) => u.id === userId);
}

export function findCustomer(customerId: string): Customer | undefined {
  return db.customers.find((c) => c.id === customerId);
}

export function findTask(taskId: string): Task | undefined {
  return db.tasks.find((t) => t.id === taskId);
}

export function findReview(taskId: string, cycle: number): Review | undefined {
  return db.reviews.find((r) => r.taskId === taskId && r.reviewCycle === cycle);
}

export function attachmentsForTask(taskId: string): TaskAttachment[] {
  return db.attachments
    .filter((a) => a.taskId === taskId)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export function responsesForCycle(taskId: string, cycle: number): IssueResponseRecord[] {
  return db.issueResponses.filter((r) => r.taskId === taskId && r.reviewCycle === cycle);
}

export function reviewsForTask(taskId: string): Review[] {
  return db.reviews
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => b.reviewCycle - a.reviewCycle);
}

export function findChecklist(taskId: string): TaskChecklist | undefined {
  return db.checklists.find((c) => c.taskId === taskId);
}

/**
 * Issues the next per-customer task number, e.g. `AASL-019`.
 *
 * Padded to three digits to match the seed data. In Phase 2 this whole function
 * collapses into one `UPDATE customer_sequences … RETURNING next_no` inside the
 * create transaction; the point of writing it as a single mutation here is that
 * the mock cannot accidentally model a race the real system will not have.
 */
export function issueTaskCode(customerId: string): string {
  const customer = findCustomer(customerId);
  const next = (db.sequences[customerId] ?? 0) + 1;
  db.sequences[customerId] = next;
  return `${customer?.code ?? 'TASK'}-${String(next).padStart(3, '0')}`;
}

export function recordEvent(event: Omit<TaskEvent, 'id' | 'actorName'>): TaskEvent {
  const actor = findUser(event.actorId);
  const stored: TaskEvent = {
    ...event,
    id: `ev-${event.taskId}-${event.kind}-${String(db.events.length + 1)}`,
    actorName: actor?.name ?? 'Unknown',
  };
  db.events.push(stored);
  return stored;
}

export function eventsForTask(taskId: string): TaskEvent[] {
  return db.events
    .filter((event) => event.taskId === taskId)
    .map((event) => ({
      ...event,
      actorName: findUser(event.actorId)?.name ?? 'Unknown',
    }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * Joins a task with the display fields every grid needs, so the UI never has to
 * fan out N+1 lookups to render a row. Phase 2 does this join in SQL.
 */
export function toListItem(task: Task): TaskListItem {
  const customer = findCustomer(task.customerId);
  const developer = findUser(task.developerId);
  const reviewer = task.reviewerId === null ? undefined : findUser(task.reviewerId);

  return {
    ...task,
    customerName: customer?.name ?? 'Unknown',
    customerCode: customer?.code ?? '??',
    customerColor: customer?.color ?? '#6b7591',
    developerName: developer?.name ?? 'Unknown',
    reviewerName: reviewer?.name ?? null,
  };
}
