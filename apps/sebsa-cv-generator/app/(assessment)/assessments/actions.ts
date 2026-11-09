'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { AssessmentError, submitAssessment, listMyCertificatesPage } from '@/services/assessment-service';
import type { AnswerOption, AssessmentResult } from '@/types/assessment';

export type SubmitAssessmentOutcome =
  | { ok: true; result: AssessmentResult }
  | { ok: false; code: string; message: string };

export async function listMyCertificatesPageAction(page: number, pageSize: number) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  return listMyCertificatesPage(await createClient(), user.id, page, pageSize);
}

/**
 * Submits the signed-in person's answers. Identity comes from the session, never from the
 * request, so one person cannot submit on behalf of another.
 */
export async function submitAssessmentAction(input: {
  cycleId: string;
  answers: Record<string, AnswerOption>;
}): Promise<SubmitAssessmentOutcome> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: 'UNAUTHENTICATED', message: 'Your session has expired. Please sign in again.' };

  try {
    const supabase = await createClient();
    const result = await submitAssessment(
      supabase,
      createAdminClient(),
      { id: user.id, fullName: user.fullName, email: user.email },
      input
    );
    revalidatePath('/assessments');
    revalidatePath('/assessments/certificates');
    return { ok: true, result };
  } catch (err) {
    if (err instanceof AssessmentError) return { ok: false, code: err.code, message: err.message };
    console.error('Assessment submission failed:', err);
    return { ok: false, code: 'UNEXPECTED', message: 'Something went wrong while submitting. Please try again.' };
  }
}
