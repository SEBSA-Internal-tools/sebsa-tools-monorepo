import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Anon-key client for Server Components, Server Actions, and Route Handlers. Subject to RLS —
 * the signed-in user's session (from cookies) determines what it can see/do.
 *
 * Server Components can't write cookies, so `setAll` is a no-op there; session refresh in that
 * case is handled by `middleware.ts` (Phase 3).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since middleware refreshes sessions.
          }
        },
      },
    }
  );
}
