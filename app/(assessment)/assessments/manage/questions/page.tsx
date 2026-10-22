import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { listQuestions } from '@/services/assessment-admin-service';
import QuestionsClient from './QuestionsClient';

export const dynamic = 'force-dynamic';

export default async function ManageQuestionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const questions = await listQuestions(await createClient(), { id: user.id, role: user.role });
  return <QuestionsClient initialQuestions={questions} />;
}
