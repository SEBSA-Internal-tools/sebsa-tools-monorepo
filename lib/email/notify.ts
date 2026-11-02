import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, type EmailContent } from './sendEmail';

/** auth.users.email — the address every account was actually invited to/registered with
 *  (lib/auth/provisionAccount.ts invites by this same address), so it's the reliable "registered
 *  email" for both Employees and Admin/Reviewer accounts (the latter may have no `profiles` row
 *  at all, so profiles.email isn't a safe universal source). */
async function lookupUserEmail(adminClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    console.error('Failed to look up email for user', userId, error);
    return null;
  }
  return data.user.email;
}

/**
 * Emails one specific user. Mirrors notifyUser's shape (lib/notifications.ts) but is only called
 * for the small, explicit subset of events worth an email — see each call site for why that one
 * was picked; most in-app notifications (e.g. a reviewer's own "you approved X" self-log) never
 * call this.
 */
export async function emailUser(adminClient: SupabaseClient, userId: string, content: EmailContent): Promise<void> {
  const to = await lookupUserEmail(adminClient, userId);
  if (!to) return;
  await sendEmail(to, content);
}

/** Emails every Super Admin/Admin/HR. Mirrors notifyReviewers (lib/notifications.ts). */
export async function emailReviewers(adminClient: SupabaseClient, content: EmailContent): Promise<void> {
  const { data: reviewers, error } = await adminClient
    .from('user_roles')
    .select('user_id')
    .in('role', ['super_admin', 'admin', 'cv_reviewer']);

  if (error) {
    console.error('Failed to look up reviewers for email:', error);
    return;
  }
  if (!reviewers || reviewers.length === 0) return;

  await Promise.all(
    reviewers.map(async (r: { user_id: string }) => {
      const to = await lookupUserEmail(adminClient, r.user_id);
      if (to) await sendEmail(to, content);
    })
  );
}
