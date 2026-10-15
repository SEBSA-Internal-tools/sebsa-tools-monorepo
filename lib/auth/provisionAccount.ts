import type { SupabaseClient, User } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/sendEmail';
import { renderEmailHtml } from '@/lib/email/templates';

export interface ProvisionResult {
  userId: string;
  /** True if a brand-new account was created and an invite email sent; false if an account for
   *  this email already existed and was linked instead (e.g. the employee self-registered via
   *  /signup before an Admin got to uploading their CV). */
  invited: boolean;
}

/**
 * The invite/sign-in email. The CTA is an absolute Supabase link rather than an app path, so it
 * can't go through renderEmailHtml's ctaPath (which resolves against NEXT_PUBLIC_APP_URL).
 */
function buildInviteEmail(link: string, isResend: boolean) {
  const button =
    `<a href="${link}" style="display:inline-block;margin-top:20px;padding:12px 24px;` +
    'background-color:#4E1C90;color:#ffffff;text-decoration:none;font-weight:700;' +
    'font-size:13px;border-radius:8px;">Verify and sign in</a>';

  return {
    subject: isResend
      ? 'Your SEBSA CV Generator sign-in link'
      : 'You have been invited to SEBSA CV Generator',
    html: renderEmailHtml({
      heading: isResend ? 'Sign in to SEBSA CV Generator' : 'Welcome to SEBSA CV Generator',
      body:
        (isResend
          ? 'An administrator has re-sent your invitation. Use the link below to verify your ' +
            'email address and set a password. This link replaces any earlier invitation you ' +
            'were sent.'
          : 'An administrator has created an account for you. Use the link below to verify ' +
            'your email address and choose a password.') + button,
    }),
  };
}

/**
 * Creates a Supabase Auth account for an employee being added by an Admin/Super Admin/CV
 * Reviewer and emails them a secure one-time invite link — no password ever exists in the email;
 * the employee sets their own on first login via /auth/set-password. See
 * docs/04-rbac-security.md §14.
 *
 * Deliberately does NOT use admin.inviteUserByEmail, which asks Supabase's own mailer to send.
 * That mailer returns an opaque `AuthRetryableFetchError` (500, empty body) on this project, and
 * even when working, Supabase's built-in SMTP is rate-limited to a handful of messages per hour
 * — unusable for onboarding a department. Instead the link is minted with generateLink (which
 * sends nothing) and delivered over the app's own Brevo transport, the same path every other
 * email here already takes.
 *
 * If an account for this email already exists (the employee self-registered first, or a prior
 * invite already created it), links to that account instead of erroring — this is a legitimate,
 * expected race condition, not a failure.
 *
 * Throws only when account creation genuinely fails for a reason other than "already exists"
 * (e.g. email sending misconfigured) — callers should treat that as non-fatal to profile
 * creation itself (see createEmployeeAction) since the old self-service claim flow (0019/0020)
 * remains a fallback: the employee can still self-register and request to link the profile.
 */
export async function provisionEmployeeAccount(
  adminClient: SupabaseClient,
  email: string
): Promise<ProvisionResult> {
  const redirectTo = `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/set-password`;

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  });

  if (!error && data.user && data.properties?.action_link) {
    const sent = await sendEmail(email, buildInviteEmail(data.properties.action_link, false));

    // generateLink has already created the account at this point. If the mail didn't leave, roll
    // it back rather than leaving a half-provisioned user: an account with no delivered link is
    // invisible to the employee but makes every later attempt take the "already registered"
    // branch, which is exactly how profiles end up stuck as Inactive with nobody notified.
    if (!sent) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      throw new Error(
        `Could not send the invitation email to ${email}. No account was created — check the Brevo credentials and try again.`
      );
    }

    return { userId: data.user.id, invited: true };
  }

  // "already registered" (exact message varies by Supabase version) — look up the existing
  // account instead of treating this as a failure.
  const alreadyExists = /already.*registered|already.*exists/i.test(error?.message ?? '');
  if (!alreadyExists) {
    throw new Error(error?.message ?? `Failed to invite ${email}.`);
  }

  const listResult = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  if (listResult.error) throw listResult.error;

  // The success/error branches of listUsers()'s return type don't discriminate cleanly through
  // the `.data.users: User[] & Pagination | []` intersection, so TS can't narrow it on its own
  // past the `error` check above — cast explicitly since we've already ruled out the error case.
  const users = listResult.data.users as User[];
  const existing = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    // Shouldn't happen (Supabase just told us this email is taken), but don't silently swallow it.
    throw new Error(`${email} is already registered, but no matching account could be found.`);
  }

  return { userId: existing.id, invited: false };
}

/**
 * Re-sends a sign-in link to an employee who was invited but never completed verification
 * (status 'pending').
 *
 * `inviteUserByEmail` cannot be reused here — it rejects an address that already has an account,
 * which is exactly the case we're in. Instead we mint a fresh magic link and deliver it over the
 * app's own Brevo transport (lib/email/sendEmail.ts), which also keeps the branding consistent
 * with every other notification the employee receives.
 *
 * Generating a new link invalidates the previous one, so an employee who later digs the original
 * invite out of their inbox will get an "expired" page — call that out in the UI copy.
 */
export async function resendEmployeeInvite(
  adminClient: SupabaseClient,
  email: string
): Promise<void> {
  const redirectTo = `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/set-password`;

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(error?.message ?? `Could not generate a sign-in link for ${email}.`);
  }

  const sent = await sendEmail(email, buildInviteEmail(data.properties.action_link, true));
  if (!sent) {
    throw new Error(
      `Could not send the sign-in link to ${email}. Check the Brevo credentials and try again.`
    );
  }
}
