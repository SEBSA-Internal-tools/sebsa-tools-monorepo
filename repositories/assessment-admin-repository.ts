import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerOption, CycleStatus, InvitationStatus } from '@/types/assessment';
import type { CycleRow, QuestionRow } from '@/repositories/assessment-repository';

/**
 * Query layer for the HR / assessment-admin screens. Kept apart from assessment-repository.ts
 * (the employee-facing queries) so the two audiences stay easy to tell apart. Callers pass the
 * RLS-bound client: the assessment_* policies already limit these writes to the HR tier (CV Reviewer, Super Admin), so
 * the database enforces who may do this even if a UI gate were missed.
 */

export interface ManagedCycleRow extends CycleRow {
  closed_at: string | null;
  deactivated_at: string | null;
}

export interface ManagedInvitationRow {
  id: string;
  user_id: string;
  cycle_id: string;
  sent_at: string;
  expires_at: string;
  status: InvitationStatus;
  email_status: 'sent' | 'failed';
  email_error: string | null;
  resent_at: string | null;
}

export interface ManagedAttemptRow {
  user_id: string;
  cycle_id: string;
  attempt_number: number;
  score: number;
  passed: boolean;
  is_final: boolean;
  submitted_at: string;
}

export interface EmailDeliveryRow {
  id: string;
  user_id: string;
  cycle_id: string;
  email_type: 'invitation' | 'reminder';
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  sent_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

export interface QuestionInputRow {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: AnswerOption;
  category: string | null;
  status: 'active' | 'inactive';
}

// ── Cycles ────────────────────────────────────────────────────────────────────────────────────

export async function listCycleRows(supabase: SupabaseClient): Promise<ManagedCycleRow[]> {
  const { data, error } = await supabase
    .from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at, closed_at, deactivated_at')
    .order('opened_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ManagedCycleRow[];
}

export async function listCycleRowsPage(supabase: SupabaseClient, params: {
  page: number; pageSize: number; search?: string; status?: 'all' | CycleStatus;
  fromDate?: string; toDate?: string; order?: 'newest' | 'oldest';
}) {
  const from = (params.page - 1) * params.pageSize;
  let query = supabase.from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at, closed_at, deactivated_at', { count: 'exact' });
  if (params.search?.trim()) query = query.ilike('label', `%${params.search.trim()}%`);
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.fromDate) query = query.gte('opened_at', params.fromDate);
  if (params.toDate) query = query.lte('opened_at', `${params.toDate}T23:59:59.999Z`);
  const { data, error, count } = await query.order('opened_at', { ascending: params.order === 'oldest' }).range(from, from + params.pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as ManagedCycleRow[], total: count ?? 0 };
}

export async function getCycleRowById(supabase: SupabaseClient, id: string): Promise<ManagedCycleRow | null> {
  const { data, error } = await supabase
    .from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at, closed_at, deactivated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as ManagedCycleRow | null;
}

/** Another active cycle, optionally ignoring one id (used when reactivating that very cycle). */
export async function findOtherActiveCycle(supabase: SupabaseClient, excludeId?: string): Promise<CycleRow | null> {
  let query = supabase
    .from('assessment_cycles')
    .select('id, label, passing_score, status, opened_at')
    .eq('status', 'active')
    .limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as CycleRow | null;
}

export async function insertCycleRow(
  supabase: SupabaseClient,
  row: { label: string; passing_score: number; opened_by: string }
): Promise<ManagedCycleRow> {
  const { data, error } = await supabase
    .from('assessment_cycles')
    .insert({ ...row, status: 'active' })
    .select('id, label, passing_score, status, opened_at, closed_at, deactivated_at')
    .single();
  if (error) throw error;
  return data as ManagedCycleRow;
}

export async function updateCycleStatus(
  supabase: SupabaseClient,
  id: string,
  status: CycleStatus,
  actorId: string
): Promise<void> {
  const patch =
    status === 'deactivated'
      ? { status, deactivated_at: new Date().toISOString(), deactivated_by: actorId }
      : { status, deactivated_at: null, deactivated_by: null };
  const { error } = await supabase.from('assessment_cycles').update(patch).eq('id', id);
  if (error) throw error;
}

// ── Invitations and attempts ──────────────────────────────────────────────────────────────────

export async function listInvitationRowsForCycles(
  supabase: SupabaseClient,
  cycleIds: string[]
): Promise<ManagedInvitationRow[]> {
  if (cycleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('id, user_id, cycle_id, sent_at, expires_at, status, email_status, email_error, resent_at')
    .in('cycle_id', cycleIds);
  if (error) throw error;
  return (data ?? []) as ManagedInvitationRow[];
}

export async function listAttemptRowsForCycles(
  supabase: SupabaseClient,
  cycleIds: string[]
): Promise<ManagedAttemptRow[]> {
  if (cycleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('assessment_attempts')
    .select('user_id, cycle_id, attempt_number, score, passed, is_final, submitted_at')
    .in('cycle_id', cycleIds)
    .order('attempt_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ManagedAttemptRow[];
}

export async function insertInvitationRows(
  supabase: SupabaseClient,
  rows: { user_id: string; cycle_id: string; expires_at: string; email_status: 'sent' | 'failed'; email_error: string | null }[]
): Promise<{ id: string; user_id: string }[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('assessment_invitations')
    .upsert(rows, { onConflict: 'user_id,cycle_id', ignoreDuplicates: true })
    .select('id, user_id');
  if (error) throw error;
  return (data ?? []) as { id: string; user_id: string }[];
}

export async function ensureEmailDeliveryRows(
  supabase: SupabaseClient,
  rows: { user_id: string; cycle_id: string; email_type: 'invitation' | 'reminder' }[]
): Promise<EmailDeliveryRow[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('assessment_email_deliveries')
    .upsert(rows, { onConflict: 'user_id,cycle_id,email_type', ignoreDuplicates: true })
    .select('*');
  if (error) throw error;
  return (data ?? []) as EmailDeliveryRow[];
}

export async function listEmailDeliveryRows(supabase: SupabaseClient, cycleIds: string[]): Promise<EmailDeliveryRow[]> {
  if (cycleIds.length === 0) return [];
  const { data, error } = await supabase.from('assessment_email_deliveries').select('*').in('cycle_id', cycleIds);
  if (error) throw error;
  return (data ?? []) as EmailDeliveryRow[];
}

export async function claimEmailDelivery(supabase: SupabaseClient, deliveryId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_assessment_email_delivery', { p_delivery_id: deliveryId });
  if (error) throw error;
  return data === true;
}

export async function finishEmailDelivery(
  supabase: SupabaseClient,
  deliveryId: string,
  result: { sent: boolean; error?: string | null }
): Promise<void> {
  const { error } = await supabase.from('assessment_email_deliveries').update({
    status: result.sent ? 'sent' : 'failed',
    sent_at: result.sent ? new Date().toISOString() : null,
    last_error: result.error ?? null,
  }).eq('id', deliveryId);
  if (error) throw error;
}

export async function skipEmailDelivery(supabase: SupabaseClient, deliveryId: string, reason: string): Promise<void> {
  const { error } = await supabase.from('assessment_email_deliveries').update({
    status: 'skipped', sent_at: null, last_error: reason,
  }).eq('id', deliveryId);
  if (error) throw error;
}

export async function resetEmailDeliveryForRetry(
  supabase: SupabaseClient,
  cycleId: string,
  userId: string,
  emailType: 'invitation' | 'reminder'
): Promise<EmailDeliveryRow | null> {
  const { data, error } = await supabase
    .from('assessment_email_deliveries')
    .update({ status: 'pending' })
    .eq('cycle_id', cycleId)
    .eq('user_id', userId)
    .eq('email_type', emailType)
    .eq('status', 'failed')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as EmailDeliveryRow | null;
}

export async function findInvitationRow(
  supabase: SupabaseClient,
  cycleId: string,
  userId: string
): Promise<ManagedInvitationRow | null> {
  const { data, error } = await supabase
    .from('assessment_invitations')
    .select('id, user_id, cycle_id, sent_at, expires_at, status, email_status, email_error, resent_at')
    .eq('cycle_id', cycleId)
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ManagedInvitationRow | null;
}

export async function updateInvitationRow(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    sent_at: string;
    expires_at: string;
    resent_at: string;
    status: InvitationStatus;
    email_status: 'sent' | 'failed';
    email_error: string | null;
  }>
): Promise<void> {
  const { error } = await supabase.from('assessment_invitations').update(patch).eq('id', id);
  if (error) throw error;
}

/** Marks many invitations as emailed in one round trip. */
export async function markInvitationsSent(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('assessment_invitations')
    .update({ email_status: 'sent', email_error: null })
    .in('id', ids);
  if (error) throw error;
}

// ── Question bank ─────────────────────────────────────────────────────────────────────────────

export async function listQuestionRows(supabase: SupabaseClient): Promise<QuestionRow[]> {
  const { data, error } = await supabase.from('assessment_questions').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestionRow[];
}

export async function listQuestionRowsPage(supabase: SupabaseClient, page: number, pageSize: number, search = '', status: 'all' | 'active' | 'inactive' = 'all') {
  const from = (page - 1) * pageSize;
  let query = supabase.from('assessment_questions').select('*', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (search.trim()) query = query.or(`question_text.ilike.%${search.trim()}%,category.ilike.%${search.trim()}%`);
  const { data, error, count } = await query.order('created_at', { ascending: true }).range(from, from + pageSize - 1);
  if (error) throw error;
  const { count: activeCount, error: activeError } = await supabase.from('assessment_questions').select('id', { count: 'exact', head: true }).eq('status', 'active');
  if (activeError) throw activeError;
  return { rows: (data ?? []) as QuestionRow[], total: count ?? 0, activeTotal: activeCount ?? 0 };
}

export async function insertQuestionRow(supabase: SupabaseClient, row: QuestionInputRow): Promise<QuestionRow> {
  const { data, error } = await supabase.from('assessment_questions').insert(row).select('*').single();
  if (error) throw error;
  return data as QuestionRow;
}

export async function updateQuestionRow(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<QuestionInputRow>
): Promise<QuestionRow | null> {
  const { data, error } = await supabase.from('assessment_questions').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  return data as QuestionRow | null;
}

export async function deleteQuestionRow(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('assessment_questions').delete().eq('id', id).select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** True when any stored attempt used this question — such questions must be retired, not deleted. */
export async function isQuestionUsedByAttempts(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('assessment_attempts')
    .select('id', { count: 'exact', head: true })
    .contains('selected_question_ids', [id]);
  if (error) throw error;
  return (count ?? 0) > 0;
}
