'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, canAssignRole, isAdminOrAbove, type UserRole } from '@/lib/auth';
import { getSignedAvatarUrl } from '@/lib/avatar';
import { recordAuditLog } from '@/services/audit-service';
import { pageRange, type PaginatedResult } from '@/lib/pagination';

export interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  /** Null for accounts with no `profiles` row — not every user is an "employee" with a CV
   *  (Admin/Super Admin/HR accounts often have none). */
  name: string | null;
  /** Null when there's no real uploaded photo — deliberately NOT the generic stock-photo
   *  fallback other Employee-facing views use, since showing a fake photo for an Admin who
   *  never uploaded one would be misleading here. */
  avatarUrl: string | null;
}

export interface ManagedUsersPage extends PaginatedResult<ManagedUser> {
  roleCounts: Record<UserRole, number>;
}

export async function listUsersPageAction(page: number, pageSize: number, search = '', role: UserRole | 'all' = 'all'): Promise<ManagedUsersPage> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Not authenticated.');
  if (!isAdminOrAbove(currentUser.role)) throw new Error('Unauthorized: Admin or Super Admin role required.');
  const range = pageRange(page, pageSize);
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('list_managed_users_page', {
    search_text: search.trim(), role_filter: role === 'all' ? null : role,
    page_offset: range.from, page_limit: range.pageSize,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ user_id: string; email: string; role: UserRole; created_at: string; full_name: string | null; avatar_url: string | null; total_count: number }>;
  const items = await Promise.all(rows.map(async (row): Promise<ManagedUser> => ({
    id: row.user_id, email: row.email, role: row.role, createdAt: row.created_at,
    name: row.full_name, avatarUrl: row.avatar_url ? await getSignedAvatarUrl(adminClient, row.avatar_url) : null,
  })));
  const roleCounts: Record<UserRole, number> = { employee: 0, cv_reviewer: 0, admin: 0, super_admin: 0 };
  await Promise.all((Object.keys(roleCounts) as UserRole[]).map(async (roleKey) => {
    const { count, error: countError } = await adminClient.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', roleKey);
    if (countError) throw countError;
    roleCounts[roleKey] = count ?? 0;
  }));
  return { items, total: Number(rows[0]?.total_count ?? 0), page: range.page, pageSize: range.pageSize, roleCounts };
}

/**
 * Admin/Super Admin/HR only (matches user_roles_select RLS — everyone at
 * reviewer-or-above can see the roster; only admin-or-above can change roles, enforced both
 * here and by the user_roles_write RLS policy as the real backstop).
 */
export async function listUsersAction(): Promise<ManagedUser[]> {
  return (await listUsersPageAction(1, 20)).items;
  /* Legacy implementation retained below for migration history; unreachable by design.
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Not authenticated.');

  const supabase = await createClient();
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id, role, created_at');
  if (roleError) throw roleError;

  const adminClient = createAdminClient();
  const emailById = new Map<string, string>();
  const usersPerPage = 1000;
  let page = 1;

  // Supabase returns only 50 Auth users when listUsers is called without pagination. Fetch every
  // page so user_roles rows are matched to Auth accounts regardless of their position in the list.
  while (true) {
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
      page,
      perPage: usersPerPage,
    });
    if (authError) throw authError;

    for (const authUser of authData.users) {
      emailById.set(authUser.id, authUser.email ?? '(no email)');
    }
    if (authData.users.length < usersPerPage) break;
    page += 1;
  }

  // Not every account has a profiles row — Admin/Super Admin/HR accounts often don't,
  // since profiles represent employees specifically. Left-join in whatever's there.
  const { data: profileRows, error: profileError } = await adminClient
    .from('profiles')
    .select('user_id, full_name, avatar_url')
    .not('user_id', 'is', null);
  if (profileError) throw profileError;

  const profileByUserId = new Map(
    (profileRows ?? []).map((p: { user_id: string; full_name: string; avatar_url: string | null }) => [
      p.user_id,
      p,
    ])
  );

  const managedUsers: ManagedUser[] = await Promise.all(
    (roleRows ?? []).map(async (row: { user_id: string; role: string; created_at: string }): Promise<ManagedUser> => {
      const profile = profileByUserId.get(row.user_id);
      return {
        id: row.user_id,
        // A role can outlive its Auth account if that account was deleted outside this workflow.
        email: emailById.get(row.user_id) ?? '(deleted user)',
        role: row.role as UserRole,
        createdAt: row.created_at,
        name: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ? await getSignedAvatarUrl(adminClient, profile.avatar_url) : null,
      };
    })
  );

  return managedUsers.sort((a, b) => a.email.localeCompare(b.email)); */
}

/**
 * Changes another user's role. Uses the RLS-bound server client (not the admin client) so the
 * user_roles_write policy's grant hierarchy is the actual enforcement — this function's checks
 * are just a friendlier error message before hitting the database.
 */
export async function updateUserRoleAction(targetUserId: string, newRole: UserRole): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Not authenticated.');
  if (!isAdminOrAbove(currentUser.role)) {
    throw new Error('Unauthorized: Admin or Super Admin role required.');
  }
  if (!canAssignRole(currentUser.role, newRole)) {
    throw new Error(`Unauthorized: your role cannot assign "${newRole}".`);
  }

  const supabase = await createClient();
  const { data: existingRole, error: roleLookupError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', targetUserId)
    .single();
  if (roleLookupError) throw roleLookupError;

  const adminClient = createAdminClient();
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('user_id', targetUserId)
    .maybeSingle();
  const { data: targetAuth } = await adminClient.auth.admin.getUserById(targetUserId);
  const targetName = targetProfile?.full_name || targetAuth.user?.email || 'Unknown User';

  const { error } = await supabase
    .from('user_roles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('user_id', targetUserId);

  if (error) throw error;
  await recordAuditLog({
    actorId: currentUser.id,
    action: 'UPDATE',
    entityType: 'user_role',
    entityId: targetUserId,
    metadata: {
      target_name: targetName,
      changes: [{ field: 'Role', old_value: existingRole.role, new_value: newRole }],
    },
  });
  revalidatePath('/settings');
}
