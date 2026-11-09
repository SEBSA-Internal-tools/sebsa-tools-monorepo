import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isReviewerOrAbove } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { getEmployeeById } from '@/services/employee-service';
import DownloadCvClient from './DownloadCvClient';

export default async function DownloadCvPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await searchParams;

  // Employees only ever land here for their own profile (this page is never linked with an ?id=
  // for them). Reviewer/Admin/Super Admin arrive from the "Download PDF" action on another
  // employee's profile page (EmployeeProfileClient.tsx), which always passes ?id= — that's the
  // plain (non-customized) download path; the AI "Customize this CV" flow is a separate page.
  let targetProfileId: string;
  if (user.role === 'employee') {
    if (!user.hasLinkedProfile || !user.profileId) redirect('/onboarding');
    targetProfileId = user.profileId;
  } else if (isReviewerOrAbove(user.role) && id) {
    targetProfileId = id;
  } else {
    redirect('/dashboard');
  }

  const supabase = await createClient();
  const employee = await getEmployeeById(supabase, targetProfileId);
  if (!employee) redirect(user.role === 'employee' ? '/onboarding' : '/repository');

  // Employees can only ever download their own already-published profile — still awaiting first
  // publish means nothing of theirs is live yet. Reviewers/Admins can already view any status from
  // the repository, so that gate doesn't apply to them.
  if (user.role === 'employee' && employee.status !== 'published') {
    redirect(`/repository/${targetProfileId}`);
  }

  return <DownloadCvClient employee={employee} isOwnProfile={user.role === 'employee'} />;
}
