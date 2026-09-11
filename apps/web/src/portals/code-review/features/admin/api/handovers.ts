import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { handoverSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';

/**
 * The admin handover queue.
 *
 * Both mutations invalidate the task lists as well as the queue: resolving a
 * handover changes whose queue the task sits in, and an admin who reassigns
 * while the Tasks tab is cached would otherwise see the old reviewer there.
 */

export const handoverKeys = {
  all: ['handovers'] as const,
};

export function useHandovers() {
  return useQuery({
    queryKey: handoverKeys.all,
    queryFn: ({ signal }) => api.get('/handovers', z.array(handoverSchema), { signal }),
  });
}

function useHandoverMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: handoverKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useReassignHandover() {
  return useHandoverMutation(
    ({ handoverId, reviewerId }: { handoverId: string; reviewerId: string }) =>
      api.post(`/handovers/${handoverId}/reassign`, handoverSchema, {
        reviewerId,
      }),
  );
}

export function useReturnHandover() {
  return useHandoverMutation((handoverId: string) =>
    api.post(`/handovers/${handoverId}/return`, handoverSchema),
  );
}
