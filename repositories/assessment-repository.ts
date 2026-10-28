import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerOption, CycleStatus, InvitationStatus } from '@/types/assessment';

/**
 * Thin Supabase query layer for the assessment_* tables (migration 0031). No business rules here —
 * those live in services/assessment-service.ts.
 *
 * Which client to pass matters: reads of a person's own rows use the RLS-bound client; anything
 * touching assessment_questions (the answer key) or writing attempts/certificates/invitations
 * needs the service-role client, because those tables deliberately have no employee policy.
 */

export interface CycleRow {
  id: string;
  label: string;
  passing_score: number;
  status: CycleStatus;
  opened_at: string;
}

export interface InvitationRow {
  id: string;
  user_id: string;
  cycle_id: string;
  status: InvitationStatus;
  expires_at: string;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  cycle_id: string;
  attempt_number: number;
  selected_question_ids: string[];
  answers: Record<string, AnswerOption>;
  score: number;
  passed: boolean;
  is_final: boolean;
  submitted_at: string;
  /** Present when selected with the cycle join. */
  assessment_cycles?: { label: string } | null;
}

export interface CertificateRow {
  id: string;
  attempt_id: string;
  certificate_number: string;
  issued_at: string;
  email_status: 'pending' | 'sent' | 'failed';
}

export interface QuestionRow {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: AnswerOption;
  category: string | null;
  status: 'active' | 'inactive';
}

/** Most recently opened active cycle (the legacy data allowed several at once). */
export async function getActiveCycleRow(supabase: SupabaseClient): Promise<CycleRow | null> {
  const { data, error } = await supabase
    .from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at')
    .eq('status', 'active')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as CycleRow | null;
}

/** An active cycle by id — used when validating a submission against the cycle it names. */
export async function getActiveCycleRowById(supabase: SupabaseClient, cycleId: string): Promise<CycleRow | null> {
  const { data, error } = await supabase
    .from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at')
    .eq('id', cycleId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data as CycleRow | null;
}

export async function getInvitationRow(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string
): Promise<InvitationRow | null> {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('id, user_id, cycle_id, status, expires_at')
    .eq('user_id', userId)
    .eq('cycle_id', cycleId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as InvitationRow | null;
}

export async function setInvitationStatus(
  admin: SupabaseClient,
  invitationId: string,
  status: InvitationStatus
): Promise<void> {
  const { error } = await admin.from('assessment_invitations').update({ status }).eq('id', invitationId);
  if (error) throw error;
}

export async function listAttemptRowsForCycle(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string
): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from('assessment_attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('cycle_id', cycleId)
    .order('attempt_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AttemptRow[];
}

export async function listAttemptRowsForUser(supabase: SupabaseClient, userId: string): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from('assessment_attempts')
    .select('*, assessment_cycles(label)')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttemptRow[];
}

export async function listCertificateRowsForAttempts(
  supabase: SupabaseClient,
  attemptIds: string[]
): Promise<CertificateRow[]> {
  if (attemptIds.length === 0) return [];
  const { data, error } = await supabase
    .from('assessment_certificates')
    .select('id, attempt_id, certificate_number, issued_at, email_status')
    .in('attempt_id', attemptIds)
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CertificateRow[];
}

/** Certificate plus the attempt and cycle it belongs to (RLS decides who may see it). */
export async function getCertificateWithAttempt(supabase: SupabaseClient, certificateNumber: string) {
  const { data, error } = await supabase
    .from('assessment_certificates')
    .select('id, certificate_number, issued_at, assessment_attempts(user_id, score, attempt_number, submitted_at)')
    .eq('certificate_number', certificateNumber)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as
    | (Pick<CertificateRow, 'id' | 'certificate_number' | 'issued_at'> & {
        assessment_attempts: { user_id: string; score: number; attempt_number: number; submitted_at: string } | null;
      })
    | null;
}

export async function listActiveQuestionRows(admin: SupabaseClient): Promise<QuestionRow[]> {
  const { data, error } = await admin.from('assessment_questions').select('*').eq('status', 'active');
  if (error) throw error;
  return (data ?? []) as QuestionRow[];
}

/** Includes retired questions on purpose: a retry and result review must reuse the original set. */
export async function getQuestionRowsByIds(admin: SupabaseClient, ids: string[]): Promise<QuestionRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.from('assessment_questions').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as QuestionRow[];
}

export async function insertAttemptRow(
  admin: SupabaseClient,
  row: Pick<
    AttemptRow,
    'user_id' | 'cycle_id' | 'attempt_number' | 'selected_question_ids' | 'answers' | 'score' | 'passed' | 'is_final'
  >
): Promise<AttemptRow> {
  const { data, error } = await admin.from('assessment_attempts').insert(row).select('*').single();
  if (error) throw error;
  return data as AttemptRow;
}

export async function insertCertificateRow(
  admin: SupabaseClient,
  row: { attempt_id: string; certificate_number: string }
): Promise<CertificateRow> {
  const { data, error } = await admin
    .from('assessment_certificates')
    .insert({ ...row, email_status: 'pending' })
    .select('id, attempt_id, certificate_number, issued_at, email_status')
    .single();
  if (error) throw error;
  return data as CertificateRow;
}

export async function setCertificateEmailStatus(
  admin: SupabaseClient,
  certificateId: string,
  result: { status: 'sent' | 'failed'; error?: string }
): Promise<void> {
  const { error } = await admin
    .from('assessment_certificates')
    .update({
      email_status: result.status,
      email_sent_at: result.status === 'sent' ? new Date().toISOString() : null,
      email_error: result.error ?? null,
    })
    .eq('id', certificateId);
  if (error) throw error;
}
