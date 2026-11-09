import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { openAssessment } from '@/services/assessment-service';
import TakeAssessmentClient from './TakeAssessmentClient';

// Questions are drawn at random per request and invitation state changes, so never cache.
export const dynamic = 'force-dynamic';

export default async function TakeAssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const session = await openAssessment(supabase, createAdminClient(), user.id);

  // Re-mount when the question set changes (e.g. moving from attempt 1 to the retry) so no
  // answers or timer state leak across attempts.
  const key = session.kind === 'ready' ? `${session.attemptNumber}:${session.questions[0]?.id}` : session.kind;

  return <TakeAssessmentClient key={key} session={session} />;
}
