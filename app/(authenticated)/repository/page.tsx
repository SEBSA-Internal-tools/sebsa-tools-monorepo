import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listEmployees } from '@/services/employee-service';
import { getCurrentUser } from '@/lib/auth';
import RepositoryClient from './RepositoryClient';
import { getDepartmentsAction } from '@/app/(authenticated)/upload/actions';
import { getAccountStatusMap } from '@/services/account-service';

export default async function RepositoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Employees only ever see their own profile — not the general repository (matrix: "View own"
  // only, docs/04-rbac-security.md §2). HR/Admin/Super Admin all have "View all".
  if (user.role === 'employee') redirect(`/repository/${user.profileId}`);

  const supabase = await createClient();
  const [employees, departments, accountStatuses] = await Promise.all([
    listEmployees(supabase),
    getDepartmentsAction(),
    getAccountStatusMap(),
  ]);

  // Account status lives in Supabase Auth, not on the profile row, so it's stitched on here
  // rather than inside listEmployees() — the service layer only ever sees the RLS client.
  const enriched = employees.map(({ accountUserId, ...emp }) => ({
    ...emp,
    accountStatus: accountUserId ? accountStatuses.get(accountUserId) ?? 'inactive' : ('inactive' as const),
  }));

  return <RepositoryClient employees={enriched} viewerRole={user.role} departments={departments} />;
}
