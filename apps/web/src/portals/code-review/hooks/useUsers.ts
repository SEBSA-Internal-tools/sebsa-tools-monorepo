import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { userSchema, type Role } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { currentUserKeys } from '@/hooks/useCurrentUser.ts';

/**
 * The user directory.
 *
 * In `hooks/` rather than inside `features/admin` because two features read it:
 * the admin workspace manages people, and Reports scores them. A cross-feature
 * import for that would be shared infrastructure wearing one feature's name,
 * which the boundary rules correctly reject.
 *
 * Admin-only server-side. The endpoint returns every user with their roles and
 * email, which is a directory dump — the gate is in the handler, not here.
 */

export const userKeys = {
  all: ['admin', 'users'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: ({ signal }) => api.get('/users', z.array(userSchema), { signal }),
  });
}

const ROLE_CODES: Record<Role, string> = {
  Developer: 'DEVELOPER',
  Reviewer: 'REVIEWER',
  Admin: 'ADMIN',
  'Super Admin': 'SUPER_ADMIN',
};

export function useReplaceUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: readonly Role[] }) =>
      api.put(`/users/${userId}/roles`, userSchema, {
        roles: roles.map((role) => ROLE_CODES[role]),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useTransferSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.post(`/users/${userId}/roles/transfer-super-admin`, userSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: currentUserKeys.me() });
    },
  });
}
