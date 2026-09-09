import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { userSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';

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
