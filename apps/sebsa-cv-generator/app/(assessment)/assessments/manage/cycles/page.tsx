import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { listCycleSummariesPage, listInvitablePeoplePage } from '@/services/assessment-admin-service';
import CyclesClient from './CyclesClient';

export const dynamic = 'force-dynamic';

export default async function ManageCyclesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const [cycles, people, monthsResult] = await Promise.all([
    listCycleSummariesPage(supabase, { id: user.id, role: user.role }, { page: 1, pageSize: 20 }),
    listInvitablePeoplePage(createAdminClient(), 1, 20),
    supabase.rpc('list_assessment_cycle_months'),
  ]);
  if (monthsResult.error) throw monthsResult.error;
  const months = ((monthsResult.data ?? []) as Array<{ month_key: string }>).map((row) => row.month_key);

  return <CyclesClient initialPage={cycles} initialPeople={people} monthKeys={months} />;
}
