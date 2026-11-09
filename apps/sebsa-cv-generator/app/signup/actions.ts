'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthEmailService } from '@/lib/auth/authEmailService';
import type { RegisterResult } from '@/lib/auth/authEmails';

/**
 * Creates an unconfirmed account and emails the confirmation link through the app's mail transport.
 * All validation is repeated here: the page's checks are only for convenience.
 */
export async function registerAction(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return getAuthEmailService(createAdminClient()).register(input, ip);
}
