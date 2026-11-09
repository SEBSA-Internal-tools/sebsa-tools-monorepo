import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getMyOverview } from '@/services/assessment-service';
import AssessmentsOverviewClient from './AssessmentsOverviewClient';

export default async function AssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const overview = await getMyOverview(supabase, user.id);

  return <AssessmentsOverviewClient overview={overview} firstName={user.fullName.split(' ')[0]} />;
}
