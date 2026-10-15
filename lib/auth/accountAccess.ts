import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Deactivation is implemented as a Supabase Auth ban rather than a flag on `profiles`.
 *
 * A ban is enforced by Supabase itself at sign-in and at token refresh, so access stops at the
 * auth layer instead of depending on every route remembering to check a column. The profile row
 * is untouched, which is what makes this reversible: nothing about the employee's CV data,
 * history or department is lost by deactivating them.
 *
 * Supabase has no "ban forever" option, only a duration, so an effectively-permanent ban is
 * expressed as 100 years. Reactivation passes 'none', which clears `banned_until` outright.
 */
const BAN_FOREVER = '876000h';

export async function setAccountAccess(
  adminClient: SupabaseClient,
  userId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: enabled ? 'none' : BAN_FOREVER,
    // The admin update type doesn't include ban_duration in older @supabase/supabase-js
    // releases even though the REST API accepts it.
  } as { ban_duration: string });

  if (error) {
    throw new Error(
      `Could not ${enabled ? 'reactivate' : 'deactivate'} this account: ${error.message}`
    );
  }
}
