import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { getCycleRecipientsPage, listCycleSummariesPage } from '@/services/assessment-admin-service';
import ManageTrackerClient from './ManageTrackerClient';

export const dynamic = 'force-dynamic';

export default async function ManageTrackerPage({ searchParams }: { searchParams: Promise<{ cycle?: string; cyclePage?: string; cyclePageSize?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { cycle: requested, cyclePage: requestedCyclePage, cyclePageSize: requestedCyclePageSize } = await searchParams;
  const actor = { id: user.id, role: user.role };
  const supabase = await createClient();

  const cyclePage = Math.max(1, Number(requestedCyclePage) || 1);
  const parsedPageSize = Number(requestedCyclePageSize);
  const cyclePageSize = [10, 20, 50, 100].includes(parsedPageSize) ? parsedPageSize : 20;
  const cyclesPage = await listCycleSummariesPage(supabase, actor, { page: cyclePage, pageSize: cyclePageSize });
  const cycles = cyclesPage.items;
  // Default to the active cycle, else the most recent one (the list is newest-first).
  const selectedId = cycles.find((c) => c.id === requested)?.id ?? cycles.find((c) => c.status === 'active')?.id ?? cycles[0]?.id;
  const cycle = cycles.find((item) => item.id === selectedId) ?? null;
  const recipients = selectedId ? await getCycleRecipientsPage(createAdminClient(), actor, selectedId, 1, 20) : null;
  const tracker = cycle && recipients ? { cycle, rows: recipients.items } : null;

  return <ManageTrackerClient initialCycles={cyclesPage} tracker={tracker} initialRecipients={recipients} />;
}
