import { useMemo } from 'react';
import { ClipboardList, Layers, ListTree } from 'lucide-react';
import { Alert } from '@/components/ui/Alert.tsx';
import { Tabs } from '@/components/ui/Tabs.tsx';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { ApiError } from '@/lib/apiClient.ts';
import {
  useAdminChecklistTemplate,
  useAdminTaskTypes,
  useCreateCategory,
  useCreateTaskType,
  useDeleteCategory,
  useDeleteTaskType,
  useReorderCategories,
  useReorderTaskTypes,
  useUpdateCategory,
  useUpdateTaskType,
} from '../api/checklistAdmin.ts';
import {
  NamedRecordPanel,
  type NamedRecordMutations,
  type NamedRecordRow,
} from '../components/NamedRecordPanel.tsx';
import { reportMutationError } from '../components/reportMutationError.ts';
import { useChecklistAdminView } from '../hooks/useChecklistAdminView.ts';
import { QuestionsPanel } from '../components/QuestionsPanel.tsx';

/**
 * Admin ▸ Quality Checklist — Questions, Categories and Task Types.
 *
 * No wireframe exists: the specification has no admin screen for the checklist,
 * and this is the Future-Roadmap "configurable checklists" item the business
 * pulled into scope. It therefore follows the Users screen exactly — filter row,
 * primary Add button, grid, three row actions — so it reads as part of the same
 * product rather than as something bolted on.
 *
 * Radix panel tabs rather than routes for the three views. The admin *tabs*
 * above are routes because they are top-level destinations someone links to;
 * these three are a view toggle within one screen, where a URL segment would be
 * noise.
 */
export function AdminChecklistPage() {
  const { data: template, isPending, isFetching, error, refetch } = useAdminChecklistTemplate();

  /*
   * The ADMIN task-type list, including retired rows, with its own loading and
   * error state threaded into the Task Types panel below.
   *
   * Both used to come from the template query, so a task-type fetch that failed
   * showed a healthy-looking empty grid. And the shared `useTaskTypes()` it read
   * before filters to active, which left the panel's Restore action pointing at
   * rows it could never display — and would have made a reorder impossible,
   * since the batch endpoint needs the whole set.
   */
  const {
    data: taskTypes,
    isPending: typesPending,
    isFetching: typesFetching,
    error: typesError,
    refetch: refetchTypes,
  } = useAdminTaskTypes();

  /*
   * The open tab and the two flat drafts, held above the tab strip.
   *
   * Radix unmounts an inactive panel, so a draft owned by the panel died with
   * every tab switch. It lives in a store that also survives leaving this screen
   * and a refresh — see `features/admin/hooks/useChecklistAdminView.ts`. The tab
   * is restored with them on purpose: putting a restored draft behind a tab the
   * admin is not looking at hides the unsaved banner, which is barely better
   * than losing it.
   */
  const view = useChecklistAdminView((state) => state.view);
  const setView = useChecklistAdminView((state) => state.setView);
  const categoryDraft = useChecklistAdminView((state) => state.categoryDraft);
  const setCategoryDraft = useChecklistAdminView((state) => state.setCategoryDraft);
  const taskTypeDraft = useChecklistAdminView((state) => state.taskTypeDraft);
  const setTaskTypeDraft = useChecklistAdminView((state) => state.setTaskTypeDraft);

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createTaskType = useCreateTaskType();
  const updateTaskType = useUpdateTaskType();
  const deleteTaskType = useDeleteTaskType();
  const reorderCategories = useReorderCategories();
  const reorderTaskTypes = useReorderTaskTypes();

  const categories = useMemo(() => template ?? [], [template]);
  const types = useMemo(() => taskTypes ?? [], [taskTypes]);

  const categoryRows = useMemo<NamedRecordRow[]>(
    () =>
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        order: category.order,
        isActive: category.isActive,
        questionCount: category.questions.length,
      })),
    [categories],
  );

  const taskTypeRows = useMemo<NamedRecordRow[]>(
    () =>
      types.map((type) => ({
        id: type.id,
        name: type.name,
        order: type.order,
        isActive: type.isActive,
        // How many questions a developer choosing this type would be asked —
        // the number that actually tells the admin whether the type is usable.
        questionCount: categories.reduce(
          (total, category) =>
            total +
            category.questions.filter((q) => q.isActive && q.appliesTo.includes(type.id)).length,
          0,
        ),
      })),
    [types, categories],
  );

  const categoryMutations: NamedRecordMutations = {
    create: (input, done) => {
      createCategory.mutate(
        {
          name: input.name,
          ...(input.order === undefined ? {} : { order: input.order }),
        },
        { onSuccess: done, onError: reportMutationError },
      );
    },
    update: (id, input, done) => {
      updateCategory.mutate({ id, input }, { onSuccess: done, onError: reportMutationError });
    },
    remove: (id, done, fail) => {
      // `fail` rather than `reportMutationError`: a refused delete names the
      // remedy, and the panel shows it inside the dialog that is still open.
      deleteCategory.mutate(id, {
        onSuccess: done,
        onError: (cause) => {
          fail(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      });
    },
    reorder: (ids, done) => {
      reorderCategories.mutate(
        { ids: [...ids] },
        { onSuccess: done, onError: reportMutationError },
      );
    },
    isSaving: createCategory.isPending || updateCategory.isPending,
    isDeleting: deleteCategory.isPending,
    isReordering: reorderCategories.isPending,
  };

  const taskTypeMutations: NamedRecordMutations = {
    create: (input, done) => {
      createTaskType.mutate(
        {
          name: input.name,
          ...(input.order === undefined ? {} : { order: input.order }),
        },
        { onSuccess: done, onError: reportMutationError },
      );
    },
    update: (id, input, done) => {
      updateTaskType.mutate({ id, input }, { onSuccess: done, onError: reportMutationError });
    },
    remove: (id, done, fail) => {
      deleteTaskType.mutate(id, {
        onSuccess: done,
        onError: (cause) => {
          fail(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      });
    },
    reorder: (ids, done) => {
      reorderTaskTypes.mutate({ ids: [...ids] }, { onSuccess: done, onError: reportMutationError });
    },
    isSaving: createTaskType.isPending || updateTaskType.isPending,
    isDeleting: deleteTaskType.isPending,
    isReordering: reorderTaskTypes.isPending,
  };

  return (
    <section aria-labelledby="admin-checklist-heading" className="space-y-4">
      <div>
        <h2 id="admin-checklist-heading" className="font-display text-lg font-bold text-ink-900">
          {admin.checklist.title}
        </h2>
        <p className="mt-0.5 text-sm text-ink-500">{admin.checklist.subtitle}</p>
      </div>

      <Alert tone="info">{admin.checklist.retiredNote}</Alert>

      <Tabs
        label={admin.checklist.title}
        value={view}
        onValueChange={setView}
        tabs={[
          {
            value: 'questions',
            label: admin.checklist.tabs.questions,
            icon: <ClipboardList className="size-4" />,
            content: (
              <QuestionsPanel
                categories={categories}
                taskTypes={types}
                isPending={isPending}
                isFetching={isFetching}
                error={error}
                onRetry={() => {
                  void refetch();
                }}
              />
            ),
          },
          {
            value: 'categories',
            label: admin.checklist.tabs.categories,
            icon: <ListTree className="size-4" />,
            content: (
              <NamedRecordPanel
                rows={categoryRows}
                copy={admin.checklist.categories}
                mutations={categoryMutations}
                draftOrder={categoryDraft}
                onDraftOrderChange={setCategoryDraft}
                isPending={isPending}
                isFetching={isFetching}
                error={error}
                onRetry={() => {
                  void refetch();
                }}
              />
            ),
          },
          {
            value: 'taskTypes',
            label: admin.checklist.tabs.taskTypes,
            icon: <Layers className="size-4" />,
            content: (
              <NamedRecordPanel
                rows={taskTypeRows}
                copy={admin.checklist.taskTypes}
                mutations={taskTypeMutations}
                draftOrder={taskTypeDraft}
                onDraftOrderChange={setTaskTypeDraft}
                // Its own query's state, not the template's — see the note at
                // the top of this component.
                isPending={typesPending}
                isFetching={typesFetching}
                error={typesError}
                onRetry={() => {
                  void refetchTypes();
                }}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
