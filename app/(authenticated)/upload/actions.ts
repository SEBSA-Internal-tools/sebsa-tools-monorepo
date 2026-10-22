'use server';

import { normalizeEmployeeDetails } from '@/lib/employeeDetails';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createEmployee } from '@/services/employee-service';
import { getCurrentUser, isReviewerOrAbove } from '@/lib/auth';
import { provisionEmployeeAccount } from '@/lib/auth/provisionAccount';
import { notifyUser } from '@/lib/notifications';
import type { CreateEmployeeInput } from '@/types/domain';
import { recordAuditLog } from '@/services/audit-service';
import { getProfilePictureValidationError } from '@/lib/profilePicture';

export interface CreateEmployeeResult {
  rowId: string;
  /** True if a fresh Auth account was created and an invite email sent to this employee. */
  accountInvited: boolean;
}

/**
 * Uploads a profile picture to the `profile-pictures` Supabase Storage bucket.
 * Returns the public URL of the uploaded image.
 */
export async function uploadProfilePictureAction(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const file = formData.get('file') as File | null;
  if (!file) throw new Error('No image file provided.');
  const validationError = getProfilePictureValidationError(file);
  if (validationError) throw new Error(validationError);

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const uniqueName = `avatars/${Date.now()}_${user.id}.${ext}`;

  const adminClient = createAdminClient();

  const { error: uploadError } = await adminClient.storage
    .from('profile-pictures')
    .upload(uniqueName, await file.arrayBuffer(), {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload profile picture: ${uploadError.message}`);
  }

  const { data: urlData } = adminClient.storage
    .from('profile-pictures')
    .getPublicUrl(uniqueName);

  await recordAuditLog({ actorId: user.id, action: 'CREATE', entityType: 'profile_picture', entityId: user.id, metadata: { file_name: file.name, content_type: file.type } });

  return urlData.publicUrl;
}

/**
 * Creates a new employee profile.
 *
 * Uses the service-role (admin) Supabase client for all write operations so that
 * Row Level Security policies on `profiles`, `experiences`, `projects`, `certifications`,
 * `skills`, and `profile_skills` are bypassed. The anon/user client is only used to
 * verify the caller is authenticated before we proceed — we still require a valid session.
 */
export async function createEmployeeAction(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  // 1. Verify the caller is authenticated AND has permission to create profiles on someone
  //    else's behalf. This uses the service-role client below (bypasses RLS), so this check is
  //    the actual enforcement boundary — not just a friendlier error message.
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (!isReviewerOrAbove(user.role)) {
    throw new Error('Unauthorized: Admin, Super Admin, or CV Reviewer role required. Employees self-register their own profile at /onboarding.');
  }
  if (!input.avatarUrl) {
    throw new Error('A profile photo is required.');
  }

  const requiredOverviewFields = [
    ['Full Name', input.name],
    ['Designation', input.role],
    ['Department', input.department],
    ['First Name', input.firstName],
    ['Last Name', input.lastName],
    ['Display Name', input.displayName],
    ['Company', input.company],
    ['Employment Type', input.employmentType],
  ] as const;
  const missingField = requiredOverviewFields.find(([, value]) => !value?.trim());
  if (missingField) {
    throw new Error(`${missingField[0]} is required.`);
  }
  if (!['Permanent', 'Contract', 'Probationary'].includes(input.employmentType!)) {
    throw new Error('Employment Type must be Permanent, Contract, or Probationary.');
  }

  // 2. Perform all DB writes using the service-role client that bypasses RLS.
  //    The service-role key is server-only and never sent to the browser.
  const adminClient = createAdminClient();

  // Duplicate check — catches any status (draft/published/archived), not just what a regular
  // client would see, since we're already on the admin client. Prevents silently creating a
  // second profile for someone who's already in the repository (bulk-added or self-service).
  const { data: existing } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', input.email)
    .maybeSingle();
  if (existing) {
    throw new Error(
      `A profile already exists for ${input.email}. Use "Update Profile" instead of creating a new one.`
    );
  }

  const details = normalizeEmployeeDetails(input);

  // 3. Provision (or link to an existing) Auth account and email an invite link — see
  //    docs/04-rbac-security.md §14. Never blocks profile creation: if provisioning fails (e.g.
  //    email sending misconfigured), the profile is still created unlinked and the employee can
  //    fall back to the self-service claim flow at /onboarding.
  let linkedUserId: string | undefined;
  let accountInvited = false;
  try {
    const provisionResult = await provisionEmployeeAccount(adminClient, input.email);
    linkedUserId = provisionResult.userId;
    accountInvited = provisionResult.invited;
  } catch (err) {
    console.error(`Failed to provision an account for ${input.email}, creating an unlinked profile instead:`, err);
  }

  const rowId = await createEmployee(adminClient, { ...input, ...details, linkedUserId }, user.id);
  await recordAuditLog({
    actorId: user.id,
    action: 'CREATE',
    entityType: 'employee_profile',
    entityId: rowId,
    metadata: { employee_email: input.email, account_invited: accountInvited },
  });

  if (linkedUserId) {
    await notifyUser(adminClient, linkedUserId, {
      type: 'account_provisioned',
      title: accountInvited ? 'Welcome to SEBSA-CV' : 'Profile linked to your account',
      message: accountInvited
        ? 'Your profile has been created — check your email to set up your account.'
        : 'Your existing account has been linked to a new profile created by an Admin.',
      link: `/repository/${rowId}`,
    });
  }

  revalidatePath('/repository');
  revalidatePath('/dashboard');
  return { rowId, accountInvited };
}

/**
 * Fetches the list of department names from the `departments` table.
 * Used to populate the department dropdown on the upload page.
 * Uses the user-scoped client — the `departments_select` RLS policy allows any
 * authenticated user to read departments.
 */
export async function getDepartmentsAction(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('departments')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch departments:', error.message);
    return [];
  }

  return (data ?? []) as { id: string; name: string }[];
}
