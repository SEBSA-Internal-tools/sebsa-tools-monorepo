'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeById, updateEmployee } from '@/services/employee-service';
import { getCurrentUser, canEditProfilesAndCvs } from '@/lib/auth';
import { notifyUser } from '@/lib/notifications';
import { emailUser } from '@/lib/email/notify';
import { buildProfileUpdatedByAdminEmail } from '@/lib/email/templates';
import type { UpdateEmployeeInput, Employee } from '@/types/domain';
import { profileChanges, recordAuditLog } from '@/services/audit-service';

/**
 * Loads the complete detailed profile of a selected employee by their profile id.
 */
export async function getEmployeeDetailsAction(profileId: string): Promise<Employee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  return getEmployeeById(supabase, profileId);
}

/**
 * Saves the updated profile details back to the database.
 * Uses service-role client to bypass RLS checks for editing.
 */
export async function updateEmployeeAction(
  profileId: string,
  input: UpdateEmployeeInput
): Promise<void> {
  // This uses the service-role client below (bypasses RLS), so this role check is the actual
  // enforcement boundary, not just a friendlier error message. Previously this only checked for
  // *any* authenticated session, which let any signed-in user — including role 'employee' —
  // edit an arbitrary profile by id.
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (!canEditProfilesAndCvs(user.role)) {
    throw new Error('Unauthorized: Admin, Super Admin, or HR role required.');
  }

  const adminClient = createAdminClient();
  const current = await getEmployeeById(adminClient, profileId);
  if (!current) throw new Error('Employee profile not found.');
  const changes = profileChanges(current, input);
  await updateEmployee(adminClient, profileId, input, user.id);
  await recordAuditLog({
    actorId: user.id,
    action: 'UPDATE',
    entityType: 'employee_profile',
    entityId: profileId,
    metadata: { target_name: current.name, changes },
  });

  // Direct edit, no maker-checker step — the employee otherwise has no way to find out their CV
  // changed, unlike every other content-changing path (self-proposed edits go through /review).
  const { data: profileRow } = await adminClient.from('profiles').select('user_id').eq('id', profileId).single();
  if (profileRow?.user_id) {
    await notifyUser(adminClient, profileRow.user_id, {
      type: 'profile_updated',
      title: 'Your profile was updated',
      message: `${user.fullName} made changes to your profile.`,
      link: `/repository/${profileId}`,
    });
    await emailUser(
      adminClient,
      profileRow.user_id,
      buildProfileUpdatedByAdminEmail(profileId, current.name, user.fullName)
    );
  }

  revalidatePath(`/repository/${profileId}`);
  revalidatePath('/my-profile');
  revalidatePath('/repository');
  revalidatePath('/dashboard');
}
