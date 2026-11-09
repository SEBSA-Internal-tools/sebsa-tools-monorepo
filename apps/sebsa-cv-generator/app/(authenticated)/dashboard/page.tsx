import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listNotifications } from '@/services/notification-service';
import { getCurrentUser } from '@/lib/auth';
import DashboardClient from './DashboardClient';
import { listAuditLogs } from '@/services/audit-service';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Dashboard's quick actions (Upload CV, Generate Customer CV, Manage Templates) aren't
  // relevant to Employee (own profile only) or HR (no create/generate permissions) —
  // docs/04-rbac-security.md §2. Send them to the page that actually matches their role.
  if (user.role === 'employee') redirect(`/repository/${user.profileId}`);
  if (user.role === 'cv_reviewer') redirect('/repository');

  const supabase = await createClient();
  const [employeeCountResult, countResult, notifications, auditLogs] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'published').is('deleted_at', null),
    supabase.from('generated_cvs').select('*', { count: 'exact', head: true }),
    listNotifications(supabase, 5),
    listAuditLogs(supabase, 5),
  ]);
  const generatedCvCount = countResult.count ?? 0;

  return (
    <DashboardClient
      employeeCount={employeeCountResult.count ?? 0}
      generatedCvCount={generatedCvCount}
      initialNotifications={notifications}
      recentAuditLogs={auditLogs}
    />
  );
}
