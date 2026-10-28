import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/sendEmail';
import { buildPasswordResetEmail, buildSignupConfirmationEmail } from '@/lib/email/templates';
import { isPasswordValid } from '@/lib/passwordValidation';
import { createAuthEmailService, type AuthEmailService } from '@/lib/auth/authEmails';

// One instance per server process, so the rate limiters keep their counts between requests.
let service: AuthEmailService | null = null;

/** Wires the pure service to the real mail transport and templates. Server-only. */
export function getAuthEmailService(admin: SupabaseClient): AuthEmailService {
  service ??= createAuthEmailService({
    admin,
    send: sendEmail,
    buildPasswordResetEmail,
    buildSignupConfirmationEmail,
    isPasswordValid,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
  return service;
}
