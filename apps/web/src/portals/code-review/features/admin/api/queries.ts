import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  customerSchema,
  taskListItemSchema,
  userSchema,
  type CreateCustomerInput,
  type CreateUserInput,
  type UpdateCustomerInput,
  type UpdateUserInput,
} from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';
import { userKeys } from '@/portals/code-review/hooks/useUsers.ts';

/**
 * Admin reads and writes.
 *
 * Every mutation invalidates rather than patching the cache. The admin grids are
 * small and the server owns derived fields the client cannot recompute — a
 * customer's generated `code`, a task's status after an assignment — so mirroring
 * the server is both simpler and correct, where a hand-patched cache would
 * quietly diverge.
 */

/**
 * Reading the user directory lives in `hooks/useUsers.ts` — Reports scores
 * people too, so neither feature owns it. Re-exported here so admin screens
 * import their reads and writes from one place.
 */
export { useUsers, userKeys } from '@/portals/code-review/hooks/useUsers.ts';

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post('/users', userSchema, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateUserInput }) =>
      api.patch(`/users/${userId}`, userSchema, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.delete(`/users/${userId}`, z.unknown()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/* ------------------------------------------------------------------ customers */

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCustomerInput) => api.post('/customers', customerSchema, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.customers() });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: UpdateCustomerInput }) =>
      api.patch(`/customers/${customerId}`, customerSchema, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.customers() });
      // A renamed or recoloured customer shows in every task row.
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (customerId: string) => api.delete(`/customers/${customerId}`, z.unknown()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.customers() });
    },
  });
}

/* ---------------------------------------------------------------- task actions */

export function useAssignReviewer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, reviewerId }: { taskId: string; reviewerId: string }) =>
      api.post(`/tasks/${taskId}/assign`, taskListItemSchema, { reviewerId }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.detail(task.id),
      });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.events(task.id),
      });
    },
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, reason }: { taskId: string; reason: string }) =>
      api.post(`/tasks/${taskId}/cancel`, taskListItemSchema, { reason }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.detail(task.id),
      });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.events(task.id),
      });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`, z.unknown()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
