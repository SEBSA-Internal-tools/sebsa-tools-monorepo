import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  generalCheckQuestionSchema,
  reviewSchema,
  taskListItemSchema,
  type CreateHandoverInput,
  type ReviewDecision,
  type ReviewDraft,
} from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { taskKeys } from '@/portals/code-review/hooks/useTasks.ts';
import { reviewKeys } from '@/portals/code-review/hooks/useReviews.ts';

/**
 * WRITING reviews. Reading them lives in `hooks/useReviews.ts`, because the
 * developer reads the same rows to answer the feedback.
 */
export {
  reviewKeys,
  useCurrentReview,
  useReviewHistory,
} from '@/portals/code-review/hooks/useReviews.ts';

/**
 * Server state for the reviewer workspace.
 *
 * Picking and deciding both change which queue a task belongs to, so both
 * invalidate every task list rather than the one on screen — otherwise a task
 * picked from Available lingers there until a refresh.
 */

/** The 13 General Check questions (spec section 3.1). */
export function useGeneralCheckQuestions() {
  return useQuery({
    queryKey: reviewKeys.generalCheck(),
    queryFn: ({ signal }) =>
      api.get('/general-check', z.array(generalCheckQuestionSchema), {
        signal,
      }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Claim a task off the Available queue.
 *
 * Deliberately no optimistic update. The whole point of FL 3.3-02 is that the
 * server decides who won; showing the task as claimed before it answers would
 * make the losing reviewer watch it be taken away again.
 */
export function usePickTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/pick`, taskListItemSchema),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
    onSettled: () => {
      // Even on a lost race the queue has moved on, so refetch either way.
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Screenshots                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * All three screenshot mutations write the whole review back into the cache.
 *
 * The server returns the updated review, so there is nothing to guess at — and
 * because the form seeds itself from `current.id` rather than from the object,
 * replacing it here does not discard what the reviewer has typed.
 */
function useScreenshotMutation<TInput>(
  taskId: string,
  request: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TInput) => request(input) as Promise<ReturnType<typeof reviewSchema.parse>>,
    onSuccess: (review) => {
      queryClient.setQueryData(reviewKeys.current(taskId), review);
    },
  });
}

export function useAddScreenshot(taskId: string) {
  return useScreenshotMutation(
    taskId,
    (file: { fileName: string; sizeBytes: number; mimeType: string; dataUrl: string }) =>
      api.post(`/tasks/${taskId}/review/screenshots`, reviewSchema, file),
  );
}

export function useCommentScreenshot(taskId: string) {
  return useScreenshotMutation(
    taskId,
    ({ screenshotId, comment }: { screenshotId: string; comment: string }) =>
      api.patch(`/tasks/${taskId}/review/screenshots/${screenshotId}`, reviewSchema, { comment }),
  );
}

export function useRemoveScreenshot(taskId: string) {
  return useScreenshotMutation(taskId, (screenshotId: string) =>
    api.delete(`/tasks/${taskId}/review/screenshots/${screenshotId}`, reviewSchema),
  );
}

/**
 * Hand a review back to the admin queue (spec p.12).
 *
 * Invalidates the same keys a decision does: the task leaves this reviewer's
 * list, returns to Submitted, and gains a `HandedOver` event — three views that
 * would otherwise disagree until a refresh.
 */
export function useHandOver(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHandoverInput) =>
      api.post(`/tasks/${taskId}/handover`, taskListItemSchema, input),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.events(task.id),
      });
      void queryClient.invalidateQueries({ queryKey: ['handovers'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Save the review in progress, without deciding it (spec p.10 — auto-saved draft).
 *
 * `setQueryData` rather than `invalidateQueries`, and that is the whole point.
 * An invalidation refetches `reviewKeys.current`, which is the query
 * `ReviewFormSection` initialises its local state from — so a refetch landing
 * mid-typing is exactly the clobber the keyed-remount rule exists to prevent
 * (ADR-0008). Writing the server's own response into the cache keeps the cache
 * truthful for the next mount without disturbing the form that is open now.
 *
 * Nothing else is invalidated: a draft changes no status, no queue and no
 * metric, because `decision` stays null.
 */
export function useSaveReviewDraft(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: ReviewDraft) => api.put(`/tasks/${taskId}/review`, reviewSchema, draft),
    onSuccess: (review) => {
      queryClient.setQueryData(reviewKeys.current(taskId), review);
    },
  });
}

export function useDecideReview(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { decision: ReviewDecision; draft: ReviewDraft }) =>
      api.post(`/tasks/${taskId}/review`, taskListItemSchema, input),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: taskKeys.events(task.id),
      });
      void queryClient.invalidateQueries({
        queryKey: reviewKeys.current(task.id),
      });
      void queryClient.invalidateQueries({
        queryKey: reviewKeys.history(task.id),
      });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
