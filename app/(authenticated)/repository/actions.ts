'use server';

import { revalidatePath } from 'next/cache';
import { deleteEmployee } from '@/services/employee-service';
import { getCurrentUser, isAdminOrAbove, canDeleteProfiles } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionEmployeeAccount, resendEmployeeInvite } from '@/lib/auth/provisionAccount';
import { setAccountAccess } from '@/lib/auth/accountAccess';
import { getAccountStatus } from '@/services/account-service';
import type { AccountStatus } from '@/lib/accountStatus';
import { recordAuditLog } from '@/services/audit-service';

export interface DeleteEmployeeResult {
  ok: boolean;
  message: string;
}

export async function deleteEmployeeAction(rowId: string): Promise<DeleteEmployeeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: 'Your session has expired. Please log in and try again.' };
  if (!canDeleteProfiles(user.role)) {
    return { ok: false, message: 'Only an Admin, Super Admin or HR can delete profiles.' };
  }

  try {
    // This is a privileged administrative mutation. The role check above is the authorization
    // boundary; use the service client consistently with updateEmployeeAction so an RLS response
    // cannot be turned into an opaque Server Action digest in production.
    const adminClient = createAdminClient();
    await deleteEmployee(adminClient, rowId, user.id);
    await recordAuditLog({
      actorId: user.id,
      action: 'DELETE',
      entityType: 'employee_profile',
      entityId: rowId,
    });
    revalidatePath('/repository');
    revalidatePath('/dashboard');
    return { ok: true, message: 'Employee profile deleted.' };
  } catch (error) {
    console.error('Failed to soft-delete employee profile', {
      rowId,
      actorId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    const message =
      error instanceof Error && error.message === 'Employee profile was not found or has already been deleted.'
        ? error.message
        : 'The employee profile could not be deleted. Please try again or contact an administrator.';
    return { ok: false, message };
  }
}

/* ── Account access lifecycle ──────────────────────────────────────────────────────────────
 * Inactive ──send verification mail──▶ Pending ──employee signs in──▶ Active ⇄ Deactivated
 *
 * Status is never written anywhere: it is derived from Supabase Auth on read
 * (services/account-service.ts). These actions change the underlying auth state, and the next
 * render picks the new status up. */

export interface AccountActionResult {
  /** False for operational failures (mail provider down, account already deactivated, …). */
  ok: boolean;
  status: AccountStatus;
  message: string;
}

/**
 * Next.js replaces a thrown Server Action error with an opaque digest in production, so the
 * admin would see "an error occurred" with no cause. Expected failures are therefore returned as
 * values and only genuinely unexpected ones are allowed to throw.
 */
function failure(status: AccountStatus, err: unknown): AccountActionResult {
  const raw = err instanceof Error ? err.message : String(err);
  // Supabase's mailer surfaces as AuthRetryableFetchError with a literal "{}" body.
  const message =
    !raw || raw === '{}' || raw === '[object Object]'
      ? 'The authentication service rejected the request without giving a reason. Check the server logs.'
      : raw;
  return { ok: false, status, message };
}

interface AccountProfileRow {
  id: string;
  email: string;
  full_name: string;
  user_id: string | null;
}

/** Account lifecycle is Admin/Super-Admin only — HR keep read-only repository access. */
async function requireAccountManager() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (!isAdminOrAbove(user.role)) {
    throw new Error('Only an Admin or Super Admin can manage account access.');
  }
  return user;
}

async function loadAccountProfile(
  adminClient: ReturnType<typeof createAdminClient>,
  rowId: string
): Promise<AccountProfileRow> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, email, full_name, user_id')
    .eq('id', rowId)
    .is('deleted_at', null)
    .single();

  if (error || !data) throw new Error('Employee profile not found.');
  return data as unknown as AccountProfileRow;
}

function revalidateAccountViews(rowId: string) {
  revalidatePath('/repository');
  revalidatePath(`/repository/${rowId}`);
}

/**
 * Sends the employee a link to verify their address and set a password.
 *
 * Covers both entry points into Pending: a profile that never got an account (the invite failed
 * silently at creation time — see createEmployeeAction), and one that was invited but never
 * signed in.
 */
export async function sendAccountInviteAction(rowId: string): Promise<AccountActionResult> {
  const actor = await requireAccountManager();
  const adminClient = createAdminClient();
  const profile = await loadAccountProfile(adminClient, rowId);

  const currentStatus = await getAccountStatus(profile.user_id);

  try {
    return await runInvite(actor.id, adminClient, profile, currentStatus, rowId);
  } catch (err) {
    return failure(currentStatus, err);
  }
}

async function runInvite(
  actorId: string,
  adminClient: ReturnType<typeof createAdminClient>,
  profile: AccountProfileRow,
  currentStatus: AccountStatus,
  rowId: string
): Promise<AccountActionResult> {

  // Mailing a sign-in link to a banned account would produce a link that silently fails at the
  // auth layer. Reactivation is the correct action there, so say so rather than sending mail.
  if (currentStatus === 'deactivated') {
    throw new Error(
      `${profile.full_name}'s account is deactivated. Reactivate it instead of sending a new invitation.`
    );
  }

  if (profile.user_id) {
    await resendEmployeeInvite(adminClient, profile.email);
    await recordAuditLog({
      actorId,
      action: 'ACCOUNT_INVITE_RESENT',
      entityType: 'employee_profile',
      entityId: rowId,
      metadata: { employee_email: profile.email },
    });
    revalidateAccountViews(rowId);
    return { ok: true, status: 'pending', message: `Sign-in link re-sent to ${profile.email}.` };
  }

  const { userId } = await provisionEmployeeAccount(adminClient, profile.email);

  // Link the freshly-created account to the profile. Without this the profile would stay
  // Inactive forever and a second click would create yet another orphaned invite.
  const { error: linkError } = await adminClient
    .from('profiles')
    .update({ user_id: userId })
    .eq('id', rowId);
  if (linkError) throw new Error(`Account created, but linking it to the profile failed: ${linkError.message}`);

  await recordAuditLog({
    actorId,
    action: 'ACCOUNT_INVITED',
    entityType: 'employee_profile',
    entityId: rowId,
    metadata: { employee_email: profile.email, linked_user_id: userId },
  });

  revalidateAccountViews(rowId);
  return { ok: true, status: 'pending', message: `Verification mail sent to ${profile.email}.` };
}

/**
 * Revokes or restores sign-in access. The profile row is never touched, so a deactivated
 * employee keeps their CV data and can be reactivated later.
 */
export async function setAccountAccessAction(
  rowId: string,
  enabled: boolean
): Promise<AccountActionResult> {
  const actor = await requireAccountManager();
  const adminClient = createAdminClient();
  const profile = await loadAccountProfile(adminClient, rowId);

  if (!profile.user_id) {
    return failure('inactive', new Error(
      `${profile.full_name} has no account yet — send a verification mail first.`
    ));
  }

  // Without this an Admin can ban their own account and lock themselves out of the tool with no
  // in-app way back: the only remedy would be editing auth.users in the Supabase dashboard.
  if (!enabled && profile.user_id === actor.id) {
    return failure('active', new Error('You cannot deactivate your own account.'));
  }

  try {
    await setAccountAccess(adminClient, profile.user_id, enabled);
  } catch (err) {
    return failure(await getAccountStatus(profile.user_id), err);
  }

  await recordAuditLog({
    actorId: actor.id,
    action: enabled ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_DEACTIVATED',
    entityType: 'employee_profile',
    entityId: rowId,
    metadata: { employee_email: profile.email, target_user_id: profile.user_id },
  });

  revalidateAccountViews(rowId);

  // A reactivated user who never signed in is still Pending, not Active — re-derive rather than
  // assuming, so the chip doesn't briefly claim they're Active.
  const status = enabled ? await getAccountStatus(profile.user_id) : 'deactivated';
  return {
    ok: true,
    status,
    message: enabled
      ? `${profile.full_name} can sign in again.`
      : `${profile.full_name} no longer has access.`,
  };
}
