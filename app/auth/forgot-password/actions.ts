'use server';

import { after } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthEmailService } from '@/lib/auth/authEmailService';
import { PASSWORD_RESET_REQUESTED_MESSAGE } from '@/lib/auth/recovery';

/**
 * Public endpoint: asks for a password-reset link. It ALWAYS returns the same message immediately
 * and does the real work after the response is sent, so neither the text nor the response time can
 * reveal whether an address has an account.
 */
export async function requestPasswordResetAction(email: string): Promise<string> {
  const ip = await clientIp();
  after(async () => {
    await getAuthEmailService(createAdminClient()).sendPasswordReset(email, ip);
  });
  return PASSWORD_RESET_REQUESTED_MESSAGE;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
