import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getEmployeeById } from '@/services/employee-service';
import { getDepartmentsAction } from '../upload/actions';
import MyProfileClient from './MyProfileClient';

export default async function MyProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'employee') redirect('/dashboard');
  if (!user.hasLinkedProfile || !user.profileId) redirect('/onboarding');

  const supabase = await createClient();
  const employee = await getEmployeeById(supabase, user.profileId);
  if (!employee) redirect('/onboarding');

  // Still awaiting first publish — nothing to "propose a change" to yet; they can view/track it
  // on the profile page itself, which already shows the draft.
  if (employee.status !== 'published') redirect(`/repository/${user.profileId}`);

  const departments = await getDepartmentsAction();

  return <MyProfileClient employee={employee} departments={departments} />;
}
