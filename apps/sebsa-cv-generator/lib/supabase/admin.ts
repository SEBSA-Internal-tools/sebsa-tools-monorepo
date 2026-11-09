import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * Route Handlers only (e.g. file upload, AI orchestration, audit log writes). Never import this
 * into a Client Component, a Server Component that renders user-facing data, or anything else
 * whose output path could leak the service-role key or unfiltered rows to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
