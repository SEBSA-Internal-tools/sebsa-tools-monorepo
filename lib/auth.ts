import { createClient } from '@/lib/supabase/server';
import { getSignedAvatarUrl, DEFAULT_AVATAR } from '@/lib/avatar';

export type { UserRole } from '@/lib/roles';
export { isAdminOrAbove, isReviewerOrAbove, canAssignRole } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  avatarUrl: string;
  /** True once a `profiles` row exists with `user_id` = this user's id — any status. */
  hasLinkedProfile: boolean;
  /** Set only when hasLinkedProfile — lets pages redirect an Employee straight to their own profile. */
  profileId: string | null;
}

/**
 * Server-only. Resolves the signed-in user's session + RBAC role + (if linked) profile display
 * fields. Returns null when there's no session — callers decide whether that means "redirect to
 * /login" (middleware already does this for protected routes) or "render a logged-out state".
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  const avatarUrl = await getSignedAvatarUrl(supabase, profileRow?.avatar_url);

  return {
    id: user.id,
    email: user.email ?? '',
    role: (roleRow?.role as UserRole | undefined) ?? 'employee',
    fullName: profileRow?.full_name ?? user.email ?? 'Unnamed User',
    avatarUrl,
    hasLinkedProfile: profileRow != null,
    profileId: profileRow?.id ?? null,
  };
}
