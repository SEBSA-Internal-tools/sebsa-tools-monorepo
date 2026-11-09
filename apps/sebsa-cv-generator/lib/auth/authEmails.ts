import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailContent } from '@/lib/email/sendEmail';
import { createRateLimiter } from '@/lib/auth/rateLimit';
import {
  SIGNUP_EMAIL_FAILED_MESSAGE,
  SIGNUP_EMAIL_MESSAGE,
  SIGNUP_FAILED_MESSAGE,
  SIGNUP_THROTTLED_MESSAGE,
  isSebsaWorkEmail,
} from '@/lib/auth/signupRules';

/**
 * Password-reset and signup-confirmation emails, sent by the app (through sendEmail, so they use
 * the same transport and sender as every other email) instead of Supabase's own mailer.
 *
 * Supabase's `generateLink` creates the one-time link and sends nothing; we deliver it. This is the
 * same approach as account invitations (lib/auth/provisionAccount.ts). Everything the module needs
 * is passed in, so it is unit-tested without Supabase, the network or the mail provider.
 */
export interface AuthEmailDeps {
  /** Service-role Supabase client (generateLink / deleteUser). Server-only. */
  admin: SupabaseClient;
  send: (to: string, content: EmailContent) => Promise<boolean>;
  buildPasswordResetEmail: (actionLink: string) => EmailContent;
  buildSignupConfirmationEmail: (actionLink: string, fullName: string) => EmailContent;
  isPasswordValid: (password: string) => boolean;
  /** Absolute origin of the app, e.g. https://sebsa-cv-generator.vercel.app (from NEXT_PUBLIC_APP_URL). */
  appUrl: string;
  now?: () => number;
}

export type RegisterResult = { ok: true } | { ok: false; error: string };

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && SIMPLE_EMAIL.test(email) ? email : null;
}

export function createAuthEmailService(deps: AuthEmailDeps) {
  const { admin, send, appUrl } = deps;
  const now = deps.now;
  const base = appUrl.replace(/\/$/, '');

  // One reset email per address per minute; a handful per IP. Signup is rarer and costs an account.
  const resetByEmail = createRateLimiter({ limit: 1, windowMs: 60_000, now });
  const resetByIp = createRateLimiter({ limit: 10, windowMs: 10 * 60_000, now });
  const signupByEmail = createRateLimiter({ limit: 3, windowMs: 60 * 60_000, now });
  const signupByIp = createRateLimiter({ limit: 5, windowMs: 60 * 60_000, now });

  /**
   * Sends a password-reset link if (and only if) the address belongs to an active account.
   * Resolves silently in every case: the caller shows one fixed message regardless, so nothing here
   * may reveal whether an account exists. Never throws.
   */
  async function sendPasswordReset(rawEmail: string, ip: string): Promise<void> {
    try {
      const email = normalizeEmail(rawEmail);
      if (!email) return;
      if (!resetByIp.allow(ip) || !resetByEmail.allow(email)) return;

      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${base}/auth/callback?flow=recovery&next=/auth/reset-password` },
      });
      const link = data?.properties?.action_link;
      if (error || !link || !data.user) return; // unknown address: silently nothing

      // A deactivated (banned) account must not be handed a way back in.
      const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
      if (bannedUntil && new Date(bannedUntil).getTime() > (now ? now() : Date.now())) return;

      const sent = await send(email, deps.buildPasswordResetEmail(link));
      // Never log the address: this endpoint is public and the log would list who asked.
      if (!sent) console.error('Password reset email could not be sent (see the email transport error above).');
    } catch (err) {
      console.error('Password reset request failed:', err instanceof Error ? err.message : 'unknown error');
    }
  }

  /**
   * Creates the account (unconfirmed) and emails the confirmation link. If the mail cannot be sent
   * the account is removed again, so nobody is left with an account they can never confirm.
   * An already-registered address gets the same "success" answer as a new one (no account oracle).
   */
  async function register(input: RegisterInput, ip: string): Promise<RegisterResult> {
    const email = normalizeEmail(input?.email);
    const fullName = typeof input?.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
    const password = typeof input?.password === 'string' ? input.password : '';

    if (!email || !isSebsaWorkEmail(email)) return { ok: false, error: SIGNUP_EMAIL_MESSAGE };
    if (!fullName || fullName.length > 120) return { ok: false, error: 'Please enter your full name.' };
    if (!deps.isPasswordValid(password)) {
      return { ok: false, error: 'Password does not meet all requirements. Check the checklist below.' };
    }
    if (!signupByIp.allow(ip) || !signupByEmail.allow(email)) return { ok: false, error: SIGNUP_THROTTLED_MESSAGE };

    try {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          data: { full_name: fullName },
          redirectTo: `${base}/auth/callback?next=/dashboard`,
        },
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'email_exists' || /already.*(registered|exists)/i.test(error.message ?? '')) {
          return { ok: true }; // same answer as a brand-new signup
        }
        console.error('Signup could not be created:', (error as { code?: string }).code ?? error.message);
        return { ok: false, error: SIGNUP_FAILED_MESSAGE };
      }

      const link = data?.properties?.action_link;
      if (!link || !data.user) return { ok: false, error: SIGNUP_FAILED_MESSAGE };

      const sent = await send(email, deps.buildSignupConfirmationEmail(link, fullName));
      if (!sent) {
        // generateLink already created the account; undo it rather than leave it stranded.
        await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
        return { ok: false, error: SIGNUP_EMAIL_FAILED_MESSAGE };
      }
      return { ok: true };
    } catch (err) {
      console.error('Signup failed:', err instanceof Error ? err.message : 'unknown error');
      return { ok: false, error: SIGNUP_FAILED_MESSAGE };
    }
  }

  return { sendPasswordReset, register };
}

export type AuthEmailService = ReturnType<typeof createAuthEmailService>;
