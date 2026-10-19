'use server';

import { normalizeEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createEmployee } from '@/services/employee-service';
import { getCurrentUser } from '@/lib/auth';
import { notifyReviewers } from '@/lib/notifications';
import { emailReviewers } from '@/lib/email/notify';
import { buildNewProfileSubmittedEmail } from '@/lib/email/templates';
import type { CreateEmployeeInput } from '@/types/domain';
import { recordAuditLog } from '@/services/audit-service';

export interface OnboardingSubmission extends EmployeeDetails {
  name: string;
  role: string;
  department: string;
  skills: string[];
  currentPosition?: string;
  summary?: string;
  cvExperience?: CreateEmployeeInput['cvExperience'];
  cvAcademic?: CreateEmployeeInput['cvAcademic'];
  specialProjects?: CreateEmployeeInput['specialProjects'];
  cvCertifications?: CreateEmployeeInput['cvCertifications'];
  avatarUrl?: string;
}

export interface ClaimableProfile {
  id: string;
  name: string;
  role: string;
  department: string;
}

/**
 * Looks for an existing, unclaimed (user_id is null) profile matching the caller's own login
 * email — the profiles_self_claimable_select RLS policy (0019) means this can only ever surface
 * profiles nobody has linked yet, matched on the caller's own verified email.
 */
export async function findClaimableProfileAction(): Promise<ClaimableProfile | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (user.role !== 'employee' || user.hasLinkedProfile) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role_title, departments ( name )')
    .is('user_id', null)
    .eq('email', user.email)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.full_name as string,
    role: (data.role_title as string | null) ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    department: (data as any).departments?.name ?? 'Unassigned',
  };
}

/**
 * Requests linking an existing unclaimed profile to the caller's own account — stages the
 * request (pending_claim_user_id) rather than linking immediately; a Super Admin or CV Reviewer
 * must approve it (app/(authenticated)/review/actions.ts) before profiles.user_id is actually
 * set. Uses the RLS-bound client — profiles_self_claim_request (0020) is the real enforcement:
 * it only allows touching a row that is currently unclaimed and matches the caller's own
 * verified email, and only ever sets pending_claim_user_id to the caller's own id.
 */
export async function claimProfileAction(profileId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (user.role !== 'employee') throw new Error('Only Employee accounts can request a profile claim.');
  if (user.hasLinkedProfile) throw new Error('You already have a profile on file.');

  const supabase = await createClient();

  // Fetched before the update purely for a readable notification message below — not part of the
  // enforcement (profiles_self_claim_request RLS already covers that).
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle();

  const { error } = await supabase
    .from('profiles')
    .update({ pending_claim_user_id: user.id, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .is('user_id', null);

  if (error) throw error;
  await recordAuditLog({
    actorId: user.id,
    action: 'UPDATE',
    entityType: 'employee_profile',
    entityId: profileId,
    metadata: {
      operation: 'claim_requested',
      target_name: targetProfile?.full_name ?? 'Unknown Profile',
      changes: [{ field: 'Account claim requester', old_value: null, new_value: user.fullName }],
    },
  });

  await notifyReviewers(createAdminClient(), {
    type: 'claim_requested',
    title: 'Account claim requested',
    message: `${user.email} requested to link their account to ${targetProfile?.full_name ?? 'an existing profile'}.`,
    link: '/review',
  });

  revalidatePath('/onboarding');
}

/**
 * Detects a claim request the caller already submitted (pending_claim_user_id = them) so
 * /onboarding can show a "waiting for approval" screen instead of re-showing the claim card or
 * looping them back into the create-from-scratch flow.
 */
export async function findPendingClaimAction(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (user.role !== 'employee' || user.hasLinkedProfile) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('pending_claim_user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data != null;
}

/**
 * Employee self-service profile creation (docs/04-rbac-security.md §0, migration 0018). Uses the
 * RLS-bound server client — NOT the admin client — so the profiles_self_insert policy is the
 * real enforcement boundary: it only allows role='employee', user_id = auth.uid(), and forces
 * status='draft'. This function's own checks are just a friendlier error message.
 */
export async function createOwnProfileAction(input: OnboardingSubmission): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (user.role !== 'employee') {
    throw new Error('Only Employee accounts self-register a profile this way.');
  }
  if (user.hasLinkedProfile) {
    throw new Error('You already have a profile on file.');
  }
  if (!input.avatarUrl) {
    throw new Error('A profile photo is required.');
  }

  const supabase = await createClient();
  const profileId = await createEmployee(
    supabase,
    {
      ...normalizeEmployeeDetails(input),
      name: input.name,
      email: user.email,
      role: input.role,
      department: input.department,
      skills: input.skills,
      currentPosition: input.currentPosition,
      summary: input.summary,
      cvExperience: input.cvExperience,
      cvAcademic: input.cvAcademic,
      specialProjects: input.specialProjects,
      cvCertifications: input.cvCertifications,
      avatarUrl: input.avatarUrl,
      selfServiceUserId: user.id,
    },
    user.id
  );
  await recordAuditLog({ actorId: user.id, action: 'CREATE', entityType: 'employee_profile', entityId: profileId, metadata: { self_service: true, status: 'draft' } });

  const adminClient = createAdminClient();
  await notifyReviewers(adminClient, {
    type: 'new_profile_submitted',
    title: 'New profile submitted',
    message: `${input.name} submitted a new profile for review.`,
    link: '/review',
  });
  await emailReviewers(adminClient, buildNewProfileSubmittedEmail(input.name));

  revalidatePath('/dashboard');

  // Send them straight to their own (still-draft) profile rather than /dashboard, which would
  // show nothing — the general employee list only includes 'published' profiles, and theirs is
  // still 'draft' pending Admin review. profiles_select RLS lets them view their own row
  // regardless of status.
  const { data: ownProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  redirect(`/repository/${ownProfile.id}`);
}
