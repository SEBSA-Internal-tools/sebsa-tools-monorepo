import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AccountStatus } from '@/lib/accountStatus';

/**
 * Server-only. Resolves the login state of employee accounts.
 *
 * Supabase Auth is the single source of truth here — there is deliberately no `account_status`
 * column on `profiles`. A column would have to be re-synced every time a user signs in or is
 * banned, and any missed sync shows an admin a status that isn't true. Deriving costs one extra
 * admin API call per repository render and cannot drift.
 *
 * The admin client is created and consumed entirely inside this module: only the derived
 * `AccountStatus` strings cross back out, never raw auth rows, so this stays within the
 * service-role boundary lib/supabase/admin.ts documents.
 */

/** Supabase's admin API returns `banned_until`, but it isn't on the exported `User` type. */
type AdminUser = User & { banned_until?: string | null };

/** listUsers() caps at 1000 per page; loop until a short page comes back. */
const PER_PAGE = 1000;
const MAX_PAGES = 20;

export function deriveAccountStatus(user: AdminUser | undefined): AccountStatus {
  // No auth account has ever been linked to this profile — either the invite failed at creation
  // time or the profile predates account provisioning entirely.
  if (!user) return 'inactive';

  // Deactivation is implemented as a Supabase ban, so a future `banned_until` outranks
  // everything else: a previously-active user who was deactivated must not read as Active.
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return 'deactivated';
  }

  // Invited but never signed in. Accepting the invite sets `last_sign_in_at`, so this is the
  // signal that the employee actually completed verification rather than just receiving mail.
  if (!user.last_sign_in_at) return 'pending';

  return 'active';
}

/**
 * Maps every auth user id to its current status. Returns a Map rather than per-id lookups so a
 * repository listing of N employees costs one round trip instead of N.
 */
export async function getAccountStatusMap(): Promise<Map<string, AccountStatus>> {
  const adminClient = createAdminClient();
  const statuses = new Map<string, AccountStatus>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;

    const users = data.users as AdminUser[];
    for (const user of users) {
      statuses.set(user.id, deriveAccountStatus(user));
    }

    if (users.length < PER_PAGE) break;
  }

  return statuses;
}

/**
 * Resolves the status of a single profile without listing every user. `userId` is
 * `profiles.user_id`, which is null for profiles that were never linked to an account.
 */
export async function getAccountStatus(userId: string | null | undefined): Promise<AccountStatus> {
  if (!userId) return 'inactive';

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  // A profile can point at a user that no longer exists (auth row deleted out of band, which
  // `on delete set null` only covers for direct deletes). Treat that as unlinked, not as an error.
  if (error || !data.user) return 'inactive';

  return deriveAccountStatus(data.user as AdminUser);
}
