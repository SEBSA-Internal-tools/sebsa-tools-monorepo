import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getTracker, listCycleSummaries } from '@/services/assessment-admin-service';
import ManageTrackerClient from './ManageTrackerClient';

export const dynamic = 'force-dynamic';

export default async function ManageTrackerPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { cycle: requested } = await searchParams;
  const actor = { id: user.id, role: user.role };
  const supabase = await createClient();

  const cycles = await listCycleSummaries(supabase, actor);
  // Default to the active cycle, else the most recent one (the list is newest-first).
  const selectedId = cycles.find((c) => c.id === requested)?.id ?? cycles.find((c) => c.status === 'active')?.id ?? cycles[0]?.id;
  const tracker = selectedId ? await getTracker(supabase, createAdminClient(), actor, selectedId) : null;

  return <ManageTrackerClient cycles={cycles} tracker={tracker} />;
}
