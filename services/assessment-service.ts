import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type AttemptRow,
  type QuestionRow,
  getActiveCycleRow,
  getActiveCycleRowById,
  getCertificateWithAttempt,
  getInvitationRow,
  getQuestionRowsByIds,
  insertAttemptRow,
  insertCertificateRow,
  listActiveQuestionRows,
  listAttemptRowsForCycle,
  listAttemptRowsForUser,
  listCertificateRowsForAttempts,
  setCertificateEmailStatus,
  setInvitationStatus,
} from '@/repositories/assessment-repository';
import { generateCertificatePdf } from '@/lib/assessment/certificatePdf';
import { QUESTIONS_PER_ATTEMPT, isFinalAttempt, scoreAttempt, shuffle } from '@/lib/assessment/rules';
import { buildCertificateEmail } from '@/lib/email/assessmentEmails';
import { sendEmail } from '@/lib/email/sendEmail';
import type {
  AnswerOption,
  AssessmentOverview,
  AssessmentResult,
  AssessmentSession,
  QuestionReview,
  TakerQuestion,
} from '@/types/assessment';

/** Business-rule failures the UI can show verbatim. Anything else is an unexpected error. */
export type AssessmentErrorCode =
  | 'INVALID_SUBMISSION'
  | 'CYCLE_UNAVAILABLE'
  | 'NOT_INVITED'
  | 'INVITATION_EXPIRED'
  | 'ALREADY_FINALIZED'
  | 'CONFLICT'
  // Management (services/assessment-admin-service.ts)
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ACTIVE_CYCLE_EXISTS'
  | 'NO_RECIPIENTS'
  | 'QUESTION_IN_USE';

export class AssessmentError extends Error {
  constructor(public readonly code: AssessmentErrorCode, message: string) {
    super(message);
    this.name = 'AssessmentError';
  }
}

const submissionSchema = z.object({
  cycleId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.enum(['a', 'b', 'c', 'd'])),
});

const isExpired = (invitation: { status: string; expires_at: string }) =>
  invitation.status !== 'completed' && new Date(invitation.expires_at).getTime() < Date.now();

function toTakerQuestion(q: QuestionRow): TakerQuestion {
  return {
    id: q.id,
    questionText: q.question_text,
    category: q.category,
    options: [
      { key: 'a', text: q.option_a },
      { key: 'b', text: q.option_b },
      { key: 'c', text: q.option_c },
      { key: 'd', text: q.option_d },
    ],
  };
}

function toReview(q: QuestionRow, answers: Record<string, AnswerOption>): QuestionReview {
  const userKey = answers[q.id] ?? null;
  return { ...toTakerQuestion(q), userKey, correctKey: q.correct_option, isCorrect: userKey === q.correct_option };
}

/** Questions in the order the attempt used, skipping any that no longer exist. */
function inAttemptOrder(ids: string[], rows: QuestionRow[]): QuestionRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((q): q is QuestionRow => Boolean(q));
}

// ── Employee dashboard ───────────────────────────────────────────────────────────────────────

export async function getMyOverview(supabase: SupabaseClient, userId: string): Promise<AssessmentOverview> {
  const [cycle, attempts] = await Promise.all([getActiveCycleRow(supabase), listAttemptRowsForUser(supabase, userId)]);
  const invitation = cycle ? await getInvitationRow(supabase, userId, cycle.id) : null;
  const certificateRows = await listCertificateRowsForAttempts(supabase, attempts.map((a) => a.id));
  const attemptById = new Map(attempts.map((a) => [a.id, a]));

  const latest = cycle
    ? attempts.filter((a) => a.cycle_id === cycle.id).sort((a, b) => b.attempt_number - a.attempt_number)[0] ?? null
    : null;

  return {
    activeCycle: cycle
      ? {
          id: cycle.id,
          label: cycle.label,
          passingScore: cycle.passing_score,
          status: cycle.status,
          openedAt: cycle.opened_at,
          invitation: invitation
            ? { id: invitation.id, cycleId: invitation.cycle_id, status: invitation.status, expiresAt: invitation.expires_at }
            : null,
        }
      : null,
    currentAttempt: latest
      ? {
          id: latest.id,
          cycleId: latest.cycle_id,
          cycleLabel: latest.assessment_cycles?.label ?? null,
          attemptNumber: latest.attempt_number,
          score: latest.score,
          passed: latest.passed,
          isFinal: latest.is_final,
          submittedAt: latest.submitted_at,
        }
      : null,
    pendingAssessment: cycle ? !latest : false,
    canRetry: Boolean(latest && !latest.is_final),
    completedAssessmentCount: new Set(attempts.filter((a) => a.is_final).map((a) => a.cycle_id)).size,
    certificates: certificateRows.map((c) => {
      const attempt = attemptById.get(c.attempt_id);
      return {
        id: c.id,
        certificateNumber: c.certificate_number,
        issuedAt: c.issued_at,
        score: attempt?.score ?? null,
        cycleLabel: attempt?.assessment_cycles?.label ?? null,
      };
    }),
  };
}

// ── Opening the assessment ───────────────────────────────────────────────────────────────────

async function buildResult(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  attempt: AttemptRow,
  cycle: { label: string; passing_score: number }
): Promise<AssessmentResult> {
  const [questions, certificates] = await Promise.all([
    getQuestionRowsByIds(admin, attempt.selected_question_ids),
    listCertificateRowsForAttempts(supabase, [attempt.id]),
  ]);
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attempt_number,
    score: attempt.score,
    total: attempt.selected_question_ids.length || QUESTIONS_PER_ATTEMPT,
    percentage: Math.round((attempt.score / (attempt.selected_question_ids.length || QUESTIONS_PER_ATTEMPT)) * 100),
    passed: attempt.passed,
    isFinal: attempt.is_final,
    passingScore: cycle.passing_score,
    cycleLabel: cycle.label,
    submittedAt: attempt.submitted_at,
    certificateNumber: certificates[0]?.certificate_number ?? null,
    perQuestion: inAttemptOrder(attempt.selected_question_ids, questions).map((q) => toReview(q, attempt.answers ?? {})),
  };
}

/**
 * Decides what /assessments/take should show: the test itself, a retry, the final result, or the
 * reason the person cannot start. `admin` is needed only to read the question bank.
 */
export async function openAssessment(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string
): Promise<AssessmentSession> {
  const cycle = await getActiveCycleRow(supabase);
  if (!cycle) return { kind: 'no-cycle' };

  const invitation = await getInvitationRow(supabase, userId, cycle.id);
  if (!invitation) return { kind: 'not-invited' };

  if (isExpired(invitation)) {
    if (invitation.status !== 'expired') await setInvitationStatus(admin, invitation.id, 'expired');
    return { kind: 'expired', expiredAt: invitation.expires_at };
  }

  const attempts = await listAttemptRowsForCycle(supabase, userId, cycle.id);
  const first = attempts.find((a) => a.attempt_number === 1) ?? null;
  const second = attempts.find((a) => a.attempt_number === 2) ?? null;
  const finalAttempt = second ?? (first?.is_final ? first : null);

  if (finalAttempt) {
    return {
      kind: 'completed',
      result: await buildResult(supabase, admin, finalAttempt, cycle),
      firstAttemptScore: second && first ? first.score : null,
    };
  }

  const cycleInfo = { id: cycle.id, label: cycle.label, passingScore: cycle.passing_score };

  // Retry: the same questions as the first attempt, in the same order.
  if (first) {
    const rows = await getQuestionRowsByIds(admin, first.selected_question_ids);
    return {
      kind: 'ready',
      cycle: cycleInfo,
      attemptNumber: 2,
      questions: inAttemptOrder(first.selected_question_ids, rows).map(toTakerQuestion),
      firstAttemptScore: first.score,
    };
  }

  const bank = await listActiveQuestionRows(admin);
  if (bank.length < QUESTIONS_PER_ATTEMPT) return { kind: 'no-questions' };

  if (invitation.status === 'pending') await setInvitationStatus(admin, invitation.id, 'opened');

  return {
    kind: 'ready',
    cycle: cycleInfo,
    attemptNumber: 1,
    questions: shuffle(bank).slice(0, QUESTIONS_PER_ATTEMPT).map(toTakerQuestion),
    firstAttemptScore: null,
  };
}

// ── Submitting ───────────────────────────────────────────────────────────────────────────────

export interface SubmittingUser {
  id: string;
  fullName: string;
  email: string;
}

/**
 * Scores and stores an attempt, and on a final pass issues the certificate and emails it.
 * Scoring is entirely server-side: the browser only ever sends question ids and chosen options.
 */
export async function submitAssessment(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  user: SubmittingUser,
  input: unknown
): Promise<AssessmentResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) throw new AssessmentError('INVALID_SUBMISSION', 'The submission was not valid.');
  const { cycleId, answers } = parsed.data;

  const cycle = await getActiveCycleRowById(supabase, cycleId);
  if (!cycle) throw new AssessmentError('CYCLE_UNAVAILABLE', 'This assessment cycle was not found or is no longer active.');

  const invitation = await getInvitationRow(supabase, user.id, cycleId);
  if (!invitation) throw new AssessmentError('NOT_INVITED', 'No valid invitation was found for this assessment cycle.');
  if (isExpired(invitation)) {
    throw new AssessmentError('INVITATION_EXPIRED', 'Your assessment invitation has expired. Please contact HR for a new one.');
  }

  const attempts = await listAttemptRowsForCycle(supabase, user.id, cycleId);
  const first = attempts.find((a) => a.attempt_number === 1) ?? null;
  if (attempts.some((a) => a.attempt_number === 2) || first?.is_final) {
    throw new AssessmentError('ALREADY_FINALIZED', 'Your assessment is already finalized. No further attempts are permitted.');
  }

  const attemptNumber = first ? 2 : 1;
  // A retry must reuse the first attempt's questions; a first attempt names its own ten.
  const questionIds = first ? first.selected_question_ids : Object.keys(answers);
  if (new Set(questionIds).size !== QUESTIONS_PER_ATTEMPT) {
    throw new AssessmentError('INVALID_SUBMISSION', `Exactly ${QUESTIONS_PER_ATTEMPT} questions must be answered.`);
  }

  const rows = await getQuestionRowsByIds(admin, questionIds);
  const questions = inAttemptOrder(questionIds, rows);
  if (questions.length !== questionIds.length || (!first && questions.some((q) => q.status !== 'active'))) {
    throw new AssessmentError('INVALID_SUBMISSION', 'One or more questions in the submission are not valid.');
  }

  const storedAnswers = Object.fromEntries(questionIds.filter((id) => answers[id]).map((id) => [id, answers[id]])) as Record<string, AnswerOption>;
  const score = scoreAttempt(questions.map((q) => ({ id: q.id, correctOption: q.correct_option })), storedAnswers);
  const passed = score >= cycle.passing_score;
  const isFinal = isFinalAttempt(attemptNumber, score, cycle.passing_score);

  let attempt: AttemptRow;
  try {
    attempt = await insertAttemptRow(admin, {
      user_id: user.id,
      cycle_id: cycleId,
      attempt_number: attemptNumber,
      selected_question_ids: questionIds,
      answers: storedAnswers,
      score,
      passed,
      is_final: isFinal,
    });
  } catch (err) {
    // 23505 = unique violation on (user, cycle, attempt_number): a double-submit lost the race.
    if ((err as { code?: string }).code === '23505') {
      throw new AssessmentError('CONFLICT', 'This attempt was already submitted.');
    }
    throw err;
  }

  let certificateNumber: string | null = null;
  if (isFinal && passed) {
    certificateNumber = await issueCertificate(admin, user, attempt, cycle.label, questions.length);
  }
  if (isFinal) await setInvitationStatus(admin, invitation.id, 'completed');

  return {
    attemptId: attempt.id,
    attemptNumber,
    score,
    total: questions.length,
    percentage: Math.round((score / questions.length) * 100),
    passed,
    isFinal,
    passingScore: cycle.passing_score,
    cycleLabel: cycle.label,
    submittedAt: attempt.submitted_at,
    certificateNumber,
    perQuestion: questions.map((q) => toReview(q, storedAnswers)),
  };
}

/**
 * Creates the certificate row, renders the PDF and emails it. The attempt is already saved, so a
 * rendering or mail failure is recorded on the certificate (and retried on download) rather than
 * failing the submission — the person's result must never be lost to an email problem.
 */
async function issueCertificate(
  admin: SupabaseClient,
  user: SubmittingUser,
  attempt: AttemptRow,
  cycleLabel: string,
  total: number
): Promise<string> {
  const certificate = await insertCertificateRow(admin, {
    attempt_id: attempt.id,
    certificate_number: randomUUID(),
  });
  try {
    const pdf = await generateCertificatePdf({
      employeeName: user.fullName,
      employeeEmail: user.email,
      score: attempt.score,
      attemptNumber: attempt.attempt_number,
      dateCompleted: new Date(attempt.submitted_at),
      certificateNumber: certificate.certificate_number,
    });
    const sent = await sendEmail(
      user.email,
      buildCertificateEmail({
        employeeName: user.fullName,
        cycleLabel,
        score: attempt.score,
        total,
        certificateNumber: certificate.certificate_number,
        pdf,
      })
    );
    await setCertificateEmailStatus(admin, certificate.id, sent ? { status: 'sent' } : { status: 'failed', error: 'Email could not be sent.' });
  } catch (err) {
    console.error('Certificate email step failed:', err);
    await setCertificateEmailStatus(admin, certificate.id, { status: 'failed', error: (err as Error).message }).catch(() => undefined);
  }
  return certificate.certificate_number;
}

// ── Certificate download ─────────────────────────────────────────────────────────────────────

export interface CertificateDownload {
  pdf: Buffer;
  filename: string;
}

/**
 * Renders a certificate on demand. `supabase` (RLS-bound) decides whether the viewer may see it:
 * the owner and reviewers/admins get a row back, everyone else gets null.
 */
export async function buildCertificateDownload(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  certificateNumber: string
): Promise<CertificateDownload | null> {
  const row = await getCertificateWithAttempt(supabase, certificateNumber);
  const attempt = row?.assessment_attempts;
  if (!row || !attempt) return null;

  const [profile, account] = await Promise.all([
    admin.from('profiles').select('full_name').eq('user_id', attempt.user_id).maybeSingle(),
    admin.auth.admin.getUserById(attempt.user_id),
  ]);
  const email = account.data.user?.email ?? '';
  const name = (profile.data?.full_name as string | undefined) || email.split('@')[0] || 'SEBSA Employee';

  const pdf = await generateCertificatePdf({
    employeeName: name,
    employeeEmail: email,
    score: attempt.score,
    attemptNumber: attempt.attempt_number,
    dateCompleted: new Date(attempt.submitted_at),
    certificateNumber: row.certificate_number,
  });
  return { pdf, filename: `SEBSA_Certificate_${name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` };
}
