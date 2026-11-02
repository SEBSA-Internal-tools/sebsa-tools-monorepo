import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listEmployees } from '@/services/employee-service';
import { getCurrentUser, canEditProfilesAndCvs } from '@/lib/auth';
import GenerateClient from './GenerateClient';

export default async function GeneratePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Generating/customizing CVs is for Admin, Super Admin and HR;
  // Employee has no access at all (docs/04-rbac-security.md §2).
  if (user.role === 'employee') redirect(`/repository/${user.profileId}`);
  if (!canEditProfilesAndCvs(user.role)) redirect('/repository');

  const supabase = await createClient();
  const employees = await listEmployees(supabase);

  return <GenerateClient employees={employees} />;
}
