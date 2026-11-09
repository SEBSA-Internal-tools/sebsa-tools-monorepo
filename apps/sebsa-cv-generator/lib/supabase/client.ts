import { createBrowserClient } from '@supabase/ssr';
import { requireEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/** Anon-key client for Client Components. Subject to RLS. */
export function createClient() {
  return createBrowserClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );
}
