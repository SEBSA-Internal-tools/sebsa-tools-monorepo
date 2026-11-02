'use server';

import { normalizeEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { notifyReviewers } from '@/lib/notifications';
import { emailReviewers } from '@/lib/email/notify';
import { buildProfileUpdateRequestedEmail } from '@/lib/email/templates';
import type { UpdateEmployeeInput } from '@/types/domain';
import type { CvExperienceEntry, CvAcademicEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { profileChanges, recordAuditLog } from '@/services/audit-service';
import { getEmployeeById } from '@/services/employee-service';

/** Employees may propose detailed profile changes; account work email stays locked. */
export interface ProfileChangeSubmission extends EmployeeDetails {
  name: string;
  role: string;
  department: string;
  summary: string;
  skills: string[];
  cvExperience: CvExperienceEntry[];
  cvAcademic: CvAcademicEntry[];
  specialProjects: CvProjectEntry[];
  cvCertifications: CvCertificationEntry[];
  /** Omit to leave the current photo unchanged — updateEmployee only touches avatar_url when set. */
  avatarUrl?: string;
}

/**
 * Employee self-edit of an already-published profile (docs/04-rbac-security.md §10). Stages the
 * proposed values in `pending_change` rather than writing them live — a Super Admin/HR
 * must approve (app/(authenticated)/review/actions.ts) before they take effect. Uses the
 * RLS-bound client: profiles_self_propose_change (0020) is the real enforcement — it only allows
 * touching the caller's own row, and only while status='published'.
 *
 * Full name and optional details are reviewed with the CV changes.
 * Account email is always read server-side from the existing profile.
 */
export async function proposeProfileChangeAction(change: ProfileChangeSubmission): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (user.role !== 'employee') throw new Error('Only Employee accounts propose changes this way.');
  if (!user.hasLinkedProfile || !user.profileId) throw new Error('You do not have a profile yet.');

  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', user.id)
    .single();
  if (currentError) throw currentError;

  const fullChange: UpdateEmployeeInput = {
    ...normalizeEmployeeDetails(change),
    name: change.name?.trim() || current.full_name as string,
    email: current.email as string,
    role: change.role,
    department: change.department,
    summary: change.summary,
    skills: change.skills,
    currentPosition: change.role,
    cvExperience: change.cvExperience,
    cvAcademic: change.cvAcademic,
    specialProjects: change.specialProjects,
    cvCertifications: change.cvCertifications,
    avatarUrl: change.avatarUrl,
  };

  const adminClient = createAdminClient();
  const liveProfile = await getEmployeeById(adminClient, user.profileId);
  if (!liveProfile) throw new Error('Your profile could not be loaded.');
  const changes = profileChanges(liveProfile, fullChange);

  const { error } = await supabase
    .from('profiles')
    .update({
      pending_change: fullChange,
      pending_change_submitted_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('status', 'published');

  if (error) throw error;
  await recordAuditLog({
    actorId: user.id,
    action: 'UPDATE',
    entityType: 'employee_profile',
    entityId: user.profileId,
    metadata: { operation: 'change_requested', target_name: current.full_name, changes },
  });

  await notifyReviewers(adminClient, {
    type: 'change_requested',
    title: 'Profile update requested',
    message: `${current.full_name} proposed changes to their profile.`,
    link: '/review',
  });
  await emailReviewers(adminClient, buildProfileUpdateRequestedEmail(current.full_name));

  revalidatePath(`/repository/${user.profileId}`);
  revalidatePath('/my-profile');
}
