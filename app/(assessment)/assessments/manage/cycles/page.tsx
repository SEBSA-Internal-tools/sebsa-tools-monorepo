import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { listCycleSummaries, listInvitablePeople } from '@/services/assessment-admin-service';
import CyclesClient from './CyclesClient';

export const dynamic = 'force-dynamic';

export default async function ManageCyclesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const [cycles, people] = await Promise.all([
    listCycleSummaries(supabase, { id: user.id, role: user.role }),
    listInvitablePeople(createAdminClient()),
  ]);

  return <CyclesClient cycles={cycles} people={people.map(({ userId, name, email, role }) => ({ userId, name, email, role }))} />;
}
