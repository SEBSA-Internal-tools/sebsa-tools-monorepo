import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';

const taskSummarySchema = z.object({
  total: z.number().int().min(0),
});

export const homeKeys = {
  all: ['home'] as const,
  taskSummary: () => [...homeKeys.all, 'task-summary'] as const,
};

/**
 * Backs the "N total tasks" pill on the home page.
 *
 * A dedicated summary endpoint rather than counting a full task list: the home
 * page only needs a number, and fetching every task to derive it would make the
 * landing page the slowest screen in the app.
 */
export function useTaskSummary() {
  return useQuery({
    queryKey: homeKeys.taskSummary(),
    queryFn: ({ signal }) => api.get('/tasks/summary', taskSummarySchema, { signal }),
  });
}
