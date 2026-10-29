'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { AssessmentError } from '@/services/assessment-service';
import {
  type Actor,
  type CreateCycleResult,
  type ManagedQuestion,
  type QuestionInput,
  type TrackerRow,
  createCycleAndInvite,
  createQuestion,
  deleteQuestion,
  getCycleRecipients,
  resendFailedInvitations,
  resendInvitation,
  retryFailedAssessmentEmail,
  sendManualReminders,
  setCycleActive,
  updateQuestion,
} from '@/services/assessment-admin-service';

export type ManageResult<T = null> = { status: 'ok'; data: T } | { status: 'error'; message: string };

/**
 * Wraps every management action: resolves the signed-in user, runs the operation (whose service
 * re-checks the role), and turns business-rule failures into messages the UI can show verbatim.
 * Unexpected errors are logged server-side and reported generically.
 */
async function run<T>(op: (ctx: { actor: Actor; supabase: Awaited<ReturnType<typeof createClient>>; admin: ReturnType<typeof createAdminClient> }) => Promise<T>): Promise<ManageResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: 'Your session has expired. Please sign in again.' };

  try {
    const data = await op({ actor: { id: user.id, role: user.role }, supabase: await createClient(), admin: createAdminClient() });
    revalidatePath('/assessments/manage', 'layout');
    return { status: 'ok', data };
  } catch (err) {
    if (err instanceof AssessmentError) return { status: 'error', message: err.message };
    console.error('Assessment management action failed:', err);
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}

export async function createCycleAction(input: { label: string; passingScore: number; employeeIds: string[] }): Promise<ManageResult<CreateCycleResult>> {
  return run(({ actor, supabase, admin }) => createCycleAndInvite(supabase, admin, actor, input));
}

export async function sendRemindersAction(
  cycleId: string
): Promise<ManageResult<{ eligible: number; attempted: number; delivered: number; failed: number }>> {
  return run(({ actor, supabase, admin }) => sendManualReminders(supabase, admin, actor, cycleId));
}

export async function retryFailedEmailAction(
  cycleId: string,
  userId: string,
  emailType: 'invitation' | 'reminder'
): Promise<ManageResult<{ email: string; error: string | null }>> {
  return run(({ actor, supabase, admin }) => retryFailedAssessmentEmail(supabase, admin, actor, cycleId, userId, emailType));
}

export async function setCycleActiveAction(cycleId: string, active: boolean): Promise<ManageResult> {
  return run(async ({ actor, supabase }) => {
    await setCycleActive(supabase, actor, cycleId, active);
    return null;
  });
}

export async function resendInvitationAction(cycleId: string, userId: string): Promise<ManageResult<{ email: string; error: string | null }>> {
  return run(({ actor, supabase, admin }) => resendInvitation(supabase, admin, actor, cycleId, userId));
}

export async function resendFailedAction(cycleId: string): Promise<ManageResult<{ attempted: number; delivered: number; failed: number }>> {
  return run(({ actor, supabase, admin }) => resendFailedInvitations(supabase, admin, actor, cycleId));
}

export async function listCycleRecipientsAction(cycleId: string): Promise<ManageResult<TrackerRow[]>> {
  return run(({ actor, supabase, admin }) => getCycleRecipients(supabase, admin, actor, cycleId));
}

export async function createQuestionAction(input: QuestionInput): Promise<ManageResult<ManagedQuestion>> {
  return run(({ actor, supabase }) => createQuestion(supabase, actor, input));
}

export async function updateQuestionAction(id: string, input: Partial<QuestionInput>): Promise<ManageResult<ManagedQuestion>> {
  return run(({ actor, supabase }) => updateQuestion(supabase, actor, id, input));
}

export async function deleteQuestionAction(id: string): Promise<ManageResult> {
  return run(async ({ actor, supabase }) => {
    await deleteQuestion(supabase, actor, id);
    return null;
  });
}
