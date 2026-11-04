import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listEmployeesPageAction } from '../repository/actions';
import { getDepartmentsAction } from '../upload/actions';
import { getCurrentUser, canEditProfilesAndCvs } from '@/lib/auth';
import UpdateProfileClient from './UpdateProfileClient';

export default async function UpdateProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Editing any employee's profile is Admin, Super Admin and HR only (docs/04-rbac-security.md §2) —
  // matches the role check already enforced inside update-profile/actions.ts.
  if (user.role === 'employee') redirect(`/repository/${user.profileId}`);
  if (!canEditProfilesAndCvs(user.role)) redirect('/repository');

  const supabase = await createClient();
  const employees = await listEmployeesPageAction(1, 20);
  const departments = await getDepartmentsAction();
  const { id } = await searchParams;

  // Arriving from the pencil icon on an employee's own profile page (EmployeeProfileClient.tsx)
  // pre-selects them instead of making the Admin re-pick from the dropdown.
  return <UpdateProfileClient initialPage={employees} departments={departments} initialId={id} />;
}
