import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvite, resendInvite, revokeInvite } from '../api/localAuthApi.ts';
import type { CreateInviteInput } from '../api/types.ts';

/**
 * Mutations behind the Users tab's invite UI. Each refreshes the user list so
 * the status pill and Invite column reflect what the server now holds.
 */

/** `usersKey` is the user list's query key, passed in so this folder stays free of portal imports. */
function useRefreshUsers(usersKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: usersKey });
}

export function useCreateInvite(usersKey: readonly unknown[]) {
  const refresh = useRefreshUsers(usersKey);
  return useMutation({
    mutationFn: (input: CreateInviteInput) => createInvite(input),
    onSuccess: refresh,
  });
}

export function useResendInvite(usersKey: readonly unknown[]) {
  const refresh = useRefreshUsers(usersKey);
  return useMutation({
    mutationFn: (userId: string) => resendInvite(userId),
    onSuccess: refresh,
  });
}

export function useRevokeInvite(usersKey: readonly unknown[]) {
  const refresh = useRefreshUsers(usersKey);
  return useMutation({
    mutationFn: (userId: string) => revokeInvite(userId),
    onSuccess: refresh,
  });
}
