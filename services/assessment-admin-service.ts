import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type ManagedAttemptRow,
  type ManagedCycleRow,
  type ManagedInvitationRow,
  type QuestionInputRow,
  deleteQuestionRow,
  findInvitationRow,
  findOtherActiveCycle,
  getCycleRowById,
  insertCycleRow,
  insertInvitationRows,
  insertQuestionRow,
  isQuestionUsedByAttempts,
  listAttemptRowsForCycles,
  listCycleRows,
  listInvitationRowsForCycles,
  listQuestionRows,
  markInvitationsSent,
  updateCycleStatus,
  updateInvitationRow,
  updateQuestionRow,
} from '@/repositories/assessment-admin-repository';
import type { QuestionRow } from '@/repositories/assessment-repository';
import { AssessmentError } from '@/services/assessment-service';
import { recordAuditLog, type AuditAction } from '@/services/audit-service';
import { deriveAccountStatus } from '@/services/account-service';
import { INVITATION_VALID_DAYS } from '@/lib/assessment/rules';
import { buildInvitationEmail } from '@/lib/email/assessmentEmails';
import { sendEmail } from '@/lib/email/sendEmail';
import { canManageAssessments, type UserRole } from '@/lib/roles';

/**
 * HR / assessment-admin operations: cycles, invitations, tracker and the question bank.
 * Every entry point takes the acting user and re-checks canManageAssessments — server actions
 * check too, but the service must not rely on its caller — and the RLS-bound client is used for
 * the data itself, so the database refuses the write if the role check were ever bypassed.
 * `admin` (service role) is used only to list accounts and read their email addresses.
 */

export interface Actor {
  id: string;
  role: UserRole;
}

function assertCanManage(actor: Actor): void {
  if (!canManageAssessments(actor.role)) {
    throw new AssessmentError('FORBIDDEN', 'You do not have permission to manage assessments.');
  }
}

const SEND_CONCURRENCY = 5;

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

// ── People ────────────────────────────────────────────────────────────────────────────────────

export interface Person {
  userId: string;
  email: string;
  name: string;
  deactivated: boolean;
}

type AdminUser = User & { banned_until?: string | null };

/** Every account, with a display name from the CV profile when there is one. */
async function listPeople(admin: SupabaseClient): Promise<Person[]> {
  const users: AdminUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data.users as AdminUser[]));
    if (data.users.length < 1000) break;
  }

  const { data: profiles, error } = await admin.from('profiles').select('user_id, full_name').not('user_id', 'is', null);
  if (error) throw error;
  const nameByUser = new Map((profiles ?? []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]));

  return users
    .filter((u) => u.email)
    .map((u) => ({
      userId: u.id,
      email: u.email as string,
      name: nameByUser.get(u.id) || (u.email as string).split('@')[0],
      deactivated: deriveAccountStatus(u) === 'deactivated',
    }));
}

/** Everyone who should receive an invitation: every account that has not been deactivated. */
export async function listInvitablePeople(admin: SupabaseClient): Promise<Person[]> {
  return (await listPeople(admin)).filter((p) => !p.deactivated);
}

// ── Cycles ────────────────────────────────────────────────────────────────────────────────────

export interface CycleSummary {
  id: string;
  label: string;
  status: ManagedCycleRow['status'];
  openedAt: string;
  deactivatedAt: string | null;
  passingScore: number;
  recipients: number;
  emailsSent: number;
  emailsFailed: number;
  expiredInvitations: number;
  started: number;
  completed: number;
  passed: number;
  failed: number;
  passRate: number;
}

export async function listCycleSummaries(supabase: SupabaseClient, actor: Actor): Promise<CycleSummary[]> {
  assertCanManage(actor);
  const cycles = await listCycleRows(supabase);
  const ids = cycles.map((c) => c.id);
  const [invitations, attempts] = await Promise.all([
    listInvitationRowsForCycles(supabase, ids),
    listAttemptRowsForCycles(supabase, ids),
  ]);
  const now = Date.now();

  return cycles.map((c) => {
    const invs = invitations.filter((i) => i.cycle_id === c.id);
    const finals = attempts.filter((a) => a.cycle_id === c.id && a.is_final);
    const passed = finals.filter((a) => a.passed).length;
    return {
      id: c.id,
      label: c.label,
      status: c.status,
      openedAt: c.opened_at,
      deactivatedAt: c.deactivated_at,
      passingScore: c.passing_score,
      recipients: invs.length,
      emailsSent: invs.filter((i) => i.email_status === 'sent').length,
      emailsFailed: invs.filter((i) => i.email_status === 'failed').length,
      expiredInvitations: invs.filter((i) => i.status !== 'completed' && new Date(i.expires_at).getTime() < now).length,
      started: invs.filter((i) => i.status === 'opened' || i.status === 'completed').length,
      completed: finals.length,
      passed,
      failed: finals.length - passed,
      passRate: finals.length ? Math.round((passed / finals.length) * 100) : 0,
    };
  });
}

const cycleSchema = z.object({
  label: z.string().trim().min(3, 'Cycle label must be at least 3 characters.').max(80),
  passingScore: z.number().int().min(0).max(10),
});

export interface CreateCycleResult {
  cycleId: string;
  label: string;
  recipients: number;
  emailsSent: number;
  emailsFailed: number;
  expiresAt: string;
}

/** Sends one invitation email and returns an error message, or null on success. */
async function deliverInvitation(person: Person, cycleLabel: string, expiresAt: Date): Promise<string | null> {
  try {
    const ok = await sendEmail(person.email, buildInvitationEmail({ employeeName: person.name, cycleLabel, expiresAt }));
    return ok ? null : 'Email could not be sent.';
  } catch (err) {
    return (err as Error).message || 'Email could not be sent.';
  }
}

/**
 * Opens a cycle and invites every non-deactivated account. Invitation rows are written BEFORE any
 * email goes out, marked failed ("not sent yet"), and flipped to sent as each message leaves. If
 * the request is cut short part-way, every unsent person is therefore visible and recoverable with
 * "resend failed" rather than silently missing.
 */
export async function createCycleAndInvite(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  actor: Actor,
  input: { label: string; passingScore: number }
): Promise<CreateCycleResult> {
  assertCanManage(actor);
  const parsed = cycleSchema.safeParse(input);
  if (!parsed.success) throw new AssessmentError('INVALID_SUBMISSION', parsed.error.issues[0]?.message ?? 'Invalid cycle.');

  const existing = await findOtherActiveCycle(supabase);
  if (existing) {
    throw new AssessmentError('ACTIVE_CYCLE_EXISTS', `"${existing.label}" is already the active cycle. Deactivate it before opening a new one.`);
  }

  const people = await listInvitablePeople(admin);
  if (people.length === 0) throw new AssessmentError('NO_RECIPIENTS', 'There are no active accounts to invite.');

  const expiresAt = new Date(Date.now() + INVITATION_VALID_DAYS * 24 * 60 * 60 * 1000);
  const cycle = await insertCycleRow(supabase, {
    label: parsed.data.label,
    passing_score: parsed.data.passingScore,
    opened_by: actor.id,
  });

  const rows = await insertInvitationRows(
    supabase,
    people.map((p) => ({
      user_id: p.userId,
      cycle_id: cycle.id,
      expires_at: expiresAt.toISOString(),
      email_status: 'failed' as const,
      email_error: 'Not sent yet.',
    }))
  );
  const personByUser = new Map(people.map((p) => [p.userId, p]));

  const outcomes = await inChunks(rows, SEND_CONCURRENCY, async (row) => ({
    row,
    error: await deliverInvitation(personByUser.get(row.user_id)!, cycle.label, expiresAt),
  }));

  await markInvitationsSent(supabase, outcomes.filter((o) => !o.error).map((o) => o.row.id));
  for (const o of outcomes.filter((x) => x.error)) {
    await updateInvitationRow(supabase, o.row.id, { email_status: 'failed', email_error: o.error });
  }

  const emailsFailed = outcomes.filter((o) => o.error).length;
  await audit(actor, 'ASSESSMENT_CYCLE_SENT', 'assessment_cycle', cycle.id, {
    label: cycle.label,
    recipientCount: people.length,
    emailsFailed,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    cycleId: cycle.id,
    label: cycle.label,
    recipients: people.length,
    emailsSent: people.length - emailsFailed,
    emailsFailed,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function setCycleActive(
  supabase: SupabaseClient,
  actor: Actor,
  cycleId: string,
  active: boolean
): Promise<void> {
  assertCanManage(actor);
  const cycle = await getCycleRowById(supabase, cycleId);
  if (!cycle) throw new AssessmentError('NOT_FOUND', 'Cycle not found.');

  if (!active) {
    if (cycle.status === 'deactivated') throw new AssessmentError('CONFLICT', 'This cycle is already deactivated.');
    await updateCycleStatus(supabase, cycleId, 'deactivated', actor.id);
    await audit(actor, 'ASSESSMENT_CYCLE_DEACTIVATED', 'assessment_cycle', cycleId, { label: cycle.label });
    return;
  }

  if (cycle.status !== 'deactivated') throw new AssessmentError('CONFLICT', 'Only deactivated cycles can be reactivated.');
  const other = await findOtherActiveCycle(supabase, cycleId);
  if (other) {
    throw new AssessmentError('ACTIVE_CYCLE_EXISTS', `Cannot reactivate: "${other.label}" is already the active cycle. Deactivate it first.`);
  }
  await updateCycleStatus(supabase, cycleId, 'active', actor.id);
  await audit(actor, 'ASSESSMENT_CYCLE_REACTIVATED', 'assessment_cycle', cycleId, { label: cycle.label });
}

// ── Tracker ───────────────────────────────────────────────────────────────────────────────────

export type TrackerStatus = 'Pass' | 'Fail' | 'Retry Available' | 'In Progress' | 'Not Started' | 'Expired';

export interface TrackerRow {
  userId: string;
  name: string;
  email: string;
  status: TrackerStatus;
  invitationStatus: string;
  emailStatus: 'sent' | 'failed';
  emailError: string | null;
  sentAt: string;
  expiresAt: string;
  attemptCount: number;
  score: number | null;
  submittedAt: string | null;
}

export interface TrackerData {
  cycle: CycleSummary;
  rows: TrackerRow[];
}

const STATUS_ORDER: Record<TrackerStatus, number> = {
  Pass: 0, Fail: 1, 'Retry Available': 2, 'In Progress': 3, 'Not Started': 4, Expired: 5,
};

function trackerStatus(inv: ManagedInvitationRow, attempts: ManagedAttemptRow[]): TrackerStatus {
  const latest = attempts[attempts.length - 1];
  if (latest) {
    if (!latest.is_final) return 'Retry Available';
    return latest.passed ? 'Pass' : 'Fail';
  }
  if (inv.status !== 'completed' && new Date(inv.expires_at).getTime() < Date.now()) return 'Expired';
  return inv.status === 'opened' ? 'In Progress' : 'Not Started';
}

/** Recipient rows for one cycle (invitation + latest attempt per person), ordered by status. */
export async function getCycleRecipients(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  actor: Actor,
  cycleId: string
): Promise<TrackerRow[]> {
  assertCanManage(actor);
  const [invitations, attempts, people] = await Promise.all([
    listInvitationRowsForCycles(supabase, [cycleId]),
    listAttemptRowsForCycles(supabase, [cycleId]),
    listPeople(admin),
  ]);
  const personById = new Map(people.map((p) => [p.userId, p]));

  const rows = invitations.map((inv): TrackerRow => {
    const mine = attempts.filter((a) => a.user_id === inv.user_id);
    const latest = mine[mine.length - 1];
    const person = personById.get(inv.user_id);
    return {
      userId: inv.user_id,
      name: person?.name ?? 'Unknown',
      email: person?.email ?? '',
      status: trackerStatus(inv, mine),
      invitationStatus: inv.status,
      emailStatus: inv.email_status,
      emailError: inv.email_status === 'failed' ? inv.email_error : null,
      sentAt: inv.sent_at,
      expiresAt: inv.expires_at,
      attemptCount: mine.length,
      score: latest?.score ?? null,
      submittedAt: latest?.submitted_at ?? null,
    };
  });
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));
  return rows;
}

export async function getTracker(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  actor: Actor,
  cycleId: string
): Promise<TrackerData | null> {
  assertCanManage(actor);
  const summaries = await listCycleSummaries(supabase, actor);
  const cycle = summaries.find((c) => c.id === cycleId);
  if (!cycle) return null;

  const rows = await getCycleRecipients(supabase, admin, actor, cycleId);
  return { cycle, rows };
}

// ── Resending invitations ─────────────────────────────────────────────────────────────────────

/** Gives an invitation a fresh 7-day window and emails it again. Never reopens a completed one. */
async function reissueInvitation(
  supabase: SupabaseClient,
  cycle: ManagedCycleRow,
  person: Person,
  existing: ManagedInvitationRow | null
): Promise<string | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_VALID_DAYS * 24 * 60 * 60 * 1000);
  const error = await deliverInvitation(person, cycle.label, expiresAt);

  const base = {
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    email_status: error ? ('failed' as const) : ('sent' as const),
    email_error: error,
  };

  if (existing) {
    await updateInvitationRow(supabase, existing.id, {
      ...base,
      resent_at: now.toISOString(),
      ...(existing.status !== 'completed' ? { status: 'pending' as const } : {}),
    });
  } else {
    await insertInvitationRows(supabase, [
      { user_id: person.userId, cycle_id: cycle.id, expires_at: base.expires_at, email_status: base.email_status, email_error: base.email_error },
    ]);
  }
  return error;
}

export async function resendInvitation(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  actor: Actor,
  cycleId: string,
  userId: string
): Promise<{ email: string; error: string | null }> {
  assertCanManage(actor);
  const cycle = await getCycleRowById(supabase, cycleId);
  if (!cycle) throw new AssessmentError('NOT_FOUND', 'Cycle not found.');
  if (cycle.status !== 'active') throw new AssessmentError('CONFLICT', 'Invitations can only be resent for the active cycle.');

  const person = (await listPeople(admin)).find((p) => p.userId === userId);
  if (!person) throw new AssessmentError('NOT_FOUND', 'Account not found.');
  if (person.deactivated) throw new AssessmentError('CONFLICT', 'Cannot resend to a deactivated account.');

  const error = await reissueInvitation(supabase, cycle, person, await findInvitationRow(supabase, cycleId, userId));
  await audit(actor, 'ASSESSMENT_INVITATION_RESENT', 'assessment_cycle', cycleId, { label: cycle.label, recipient: person.email, delivered: !error });
  return { email: person.email, error };
}

export async function resendFailedInvitations(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  actor: Actor,
  cycleId: string
): Promise<{ attempted: number; delivered: number; failed: number }> {
  assertCanManage(actor);
  const cycle = await getCycleRowById(supabase, cycleId);
  if (!cycle) throw new AssessmentError('NOT_FOUND', 'Cycle not found.');
  if (cycle.status !== 'active') throw new AssessmentError('CONFLICT', 'Invitations can only be resent for the active cycle.');

  const [invitations, people] = await Promise.all([listInvitationRowsForCycles(supabase, [cycleId]), listPeople(admin)]);
  const personById = new Map(people.map((p) => [p.userId, p]));
  const targets = invitations.filter((i) => i.email_status === 'failed' && i.status !== 'completed' && personById.get(i.user_id) && !personById.get(i.user_id)!.deactivated);

  const results = await inChunks(targets, SEND_CONCURRENCY, (inv) => reissueInvitation(supabase, cycle, personById.get(inv.user_id)!, inv));
  const failed = results.filter(Boolean).length;
  await audit(actor, 'ASSESSMENT_INVITATION_RESENT', 'assessment_cycle', cycleId, { label: cycle.label, bulk: true, attempted: targets.length, failed });
  return { attempted: targets.length, delivered: targets.length - failed, failed };
}

// ── Question bank ─────────────────────────────────────────────────────────────────────────────

const questionSchema = z.object({
  questionText: z.string().trim().min(5, 'Question text must be at least 5 characters.'),
  optionA: z.string().trim().min(1, 'Option A is required.'),
  optionB: z.string().trim().min(1, 'Option B is required.'),
  optionC: z.string().trim().min(1, 'Option C is required.'),
  optionD: z.string().trim().min(1, 'Option D is required.'),
  correctOption: z.enum(['a', 'b', 'c', 'd'], { message: 'Choose the correct option.' }),
  category: z.string().trim().max(80).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type QuestionInput = z.input<typeof questionSchema>;

export interface ManagedQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'a' | 'b' | 'c' | 'd';
  category: string | null;
  status: 'active' | 'inactive';
}

const toManaged = (q: QuestionRow): ManagedQuestion => ({
  id: q.id,
  questionText: q.question_text,
  optionA: q.option_a,
  optionB: q.option_b,
  optionC: q.option_c,
  optionD: q.option_d,
  correctOption: q.correct_option,
  category: q.category,
  status: q.status,
});

function toRow(input: z.output<typeof questionSchema>): QuestionInputRow {
  return {
    question_text: input.questionText,
    option_a: input.optionA,
    option_b: input.optionB,
    option_c: input.optionC,
    option_d: input.optionD,
    correct_option: input.correctOption,
    category: input.category || null,
    status: input.status,
  };
}

export async function listQuestions(supabase: SupabaseClient, actor: Actor): Promise<ManagedQuestion[]> {
  assertCanManage(actor);
  return (await listQuestionRows(supabase)).map(toManaged);
}

export async function createQuestion(supabase: SupabaseClient, actor: Actor, input: QuestionInput): Promise<ManagedQuestion> {
  assertCanManage(actor);
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) throw new AssessmentError('INVALID_SUBMISSION', parsed.error.issues[0]?.message ?? 'Invalid question.');
  const row = await insertQuestionRow(supabase, toRow(parsed.data));
  await audit(actor, 'ASSESSMENT_QUESTION_ADDED', 'assessment_question', row.id, { category: row.category });
  return toManaged(row);
}

export async function updateQuestion(
  supabase: SupabaseClient,
  actor: Actor,
  id: string,
  input: Partial<QuestionInput>
): Promise<ManagedQuestion> {
  assertCanManage(actor);
  const parsed = questionSchema.partial().safeParse(input);
  if (!parsed.success) throw new AssessmentError('INVALID_SUBMISSION', parsed.error.issues[0]?.message ?? 'Invalid question.');

  const patch: Partial<QuestionInputRow> = {};
  const d = parsed.data;
  if (d.questionText !== undefined) patch.question_text = d.questionText;
  if (d.optionA !== undefined) patch.option_a = d.optionA;
  if (d.optionB !== undefined) patch.option_b = d.optionB;
  if (d.optionC !== undefined) patch.option_c = d.optionC;
  if (d.optionD !== undefined) patch.option_d = d.optionD;
  if (d.correctOption !== undefined) patch.correct_option = d.correctOption;
  if (d.category !== undefined) patch.category = d.category || null;
  if (d.status !== undefined) patch.status = d.status;

  const row = await updateQuestionRow(supabase, id, patch);
  if (!row) throw new AssessmentError('NOT_FOUND', 'Question not found.');
  await audit(actor, 'ASSESSMENT_QUESTION_UPDATED', 'assessment_question', id, { fields: Object.keys(patch) });
  return toManaged(row);
}

export async function deleteQuestion(supabase: SupabaseClient, actor: Actor, id: string): Promise<void> {
  assertCanManage(actor);
  if (await isQuestionUsedByAttempts(supabase, id)) {
    throw new AssessmentError('QUESTION_IN_USE', 'This question appears in past attempts, so it cannot be deleted. Set it to inactive instead.');
  }
  if (!(await deleteQuestionRow(supabase, id))) throw new AssessmentError('NOT_FOUND', 'Question not found.');
  await audit(actor, 'ASSESSMENT_QUESTION_DELETED', 'assessment_question', id, {});
}

// ── Audit ─────────────────────────────────────────────────────────────────────────────────────

/** An audit failure must not undo a completed change, so it is logged rather than thrown. */
async function audit(actor: Actor, action: AuditAction, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  try {
    await recordAuditLog({ actorId: actor.id, action, entityType, entityId, metadata });
  } catch (err) {
    console.error('Assessment audit entry failed:', err);
  }
}
