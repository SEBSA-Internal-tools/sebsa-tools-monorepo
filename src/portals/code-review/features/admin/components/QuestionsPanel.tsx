import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ChecklistCategory, ChecklistQuestion, TaskTypeRecord } from '@sdp/contracts';
import { ActiveBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable, type ReorderMove } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { moveRecordId, resequenceRecords } from '@/lib/checklistOrdering.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import {
  useDeleteQuestion,
  useReorderQuestions,
  useUpdateQuestion,
} from '../api/checklistAdmin.ts';
import { AdminRowActions } from './AdminRowActions.tsx';
import { QuestionFormDialog } from './QuestionFormDialog.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { useChecklistAdminView } from '../hooks/useChecklistAdminView.ts';

/**
 * The question bank as one flat grid.
 *
 * Flat rather than grouped by category, because the admin's actual jobs are
 * "find the question that says X" and "which task types is this asked for" —
 * both of which a nested tree makes harder. The category is a column and a
 * filter instead.
 */

const labels = admin.checklist.questions;

/** A question joined with the names its row needs. */
interface QuestionRow extends ChecklistQuestion {
  categoryName: string;
  taskTypeNames: string[];
}

const helper = columnHelper<QuestionRow>();

/* Each column its own `const` — see the note in `taskColumns.tsx`. */

const textColumn = helper.accessor('text', {
  header: labels.columns.text,
  cell: (context) => (
    <span className="block max-w-lg text-sm text-ink-900">{context.getValue()}</span>
  ),
});

const categoryColumn = helper.accessor('categoryName', {
  header: labels.columns.category,
  cell: (context) => (
    <Tag className="bg-brand-blue-100 text-brand-blue-700">{context.getValue()}</Tag>
  ),
});

const appliesToColumn = helper.accessor('taskTypeNames', {
  header: labels.columns.appliesTo,
  cell: (context) => (
    <span className="flex flex-wrap gap-1">
      {context.getValue().map((name) => (
        <Tag key={name} className="bg-violet-100 text-violet-700">
          {name}
        </Tag>
      ))}
    </span>
  ),
});

const orderColumn = helper.accessor('order', {
  header: labels.columns.order,
  cell: (context) => <span className="text-sm tabular-nums">{context.getValue()}</span>,
});

const statusColumn = helper.accessor('isActive', {
  header: labels.columns.status,
  cell: (context) => <ActiveBadge isActive={context.getValue()} />,
});

export function QuestionsPanel({
  categories,
  taskTypes,
  isPending,
  isFetching,
  error,
  onRetry,
}: {
  categories: readonly ChecklistCategory[];
  taskTypes: readonly TaskTypeRecord[];
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { mutate: mutateQuestion } = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  /*
   * The toolbar and the unsaved order live in a store, not in this component.
   *
   * Radix unmounts an inactive tab panel, so a search term, two filters and a
   * drag session's worth of arrangement all used to be discarded the moment the
   * admin glanced at Categories. One selector per slice, so a keystroke in the
   * search box re-renders this panel and nothing else.
   */
  const search = useChecklistAdminView((state) => state.search);
  const setSearch = useChecklistAdminView((state) => state.setSearch);
  const categoryId = useChecklistAdminView((state) => state.categoryFilter);
  const setCategoryId = useChecklistAdminView((state) => state.setCategoryFilter);
  const taskTypeId = useChecklistAdminView((state) => state.taskTypeFilter);
  const setTaskTypeId = useChecklistAdminView((state) => state.setTaskTypeFilter);

  const [editing, setEditing] = useState<ChecklistQuestion | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [retiring, setRetiring] = useState<QuestionRow | null>(null);
  const [deleting, setDeleting] = useState<QuestionRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * Unsaved drag order, per category: `{ [categoryId]: questionId[] }`.
   *
   * Unwritten until Save. A drag session produces a dozen intermediate
   * arrangements and only the last is worth writing — persisting each drop would
   * multiply the writes, and a mid-sequence failure would leave the bank in a
   * state nobody asked for. A category with no entry here is simply showing what
   * the server has.
   *
   * `setDraftOrder` keeps `useState`'s signature, so the updater form below
   * composes against the value in the store rather than against a subscribed
   * value that may not have re-rendered yet.
   */
  const draftOrder = useChecklistAdminView((state) => state.questionDrafts);
  const setDraftOrder = useChecklistAdminView((state) => state.setQuestionDrafts);
  const reorderQuestions = useReorderQuestions();

  const dirtyCategoryIds = Object.keys(draftOrder);
  const isDirty = dirtyCategoryIds.length > 0;

  /*
   * Server order, with any unsaved drag applied on top.
   *
   * Applied HERE rather than after filtering, so the sequence is always the
   * whole category's — the grid pages at 15 and a category can straddle the
   * boundary, and reordering what happens to be on screen is how a paginated
   * list gets a corrupted global order.
   */
  const rows = useMemo<QuestionRow[]>(
    () =>
      categories.flatMap((category) => {
        const draft = draftOrder[category.id];
        const ordered =
          draft === undefined
            ? category.questions
            : (resequenceRecords(category.questions, draft) ?? category.questions);

        return ordered.map((question) => ({
          ...question,
          categoryName: category.name,
          taskTypeNames: question.appliesTo.map(
            (id) => taskTypes.find((type) => type.id === id)?.name ?? id,
          ),
        }));
      }),
    [categories, taskTypes, draftOrder],
  );

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  /*
   * Drafts that no longer fit their category are dropped, one category at a time.
   *
   * The draft outlives this component now — it survives a tab switch, a trip to
   * another screen and a refresh — so it can come back to a bank that has
   * changed underneath it: a question added or deleted, a whole category gone
   * after a reload. Showing the server's order while STILL saying "Unsaved
   * order" would claim work that no longer exists, and Save would send ids the
   * server refuses with `ORDER_INCOMPLETE`.
   *
   * Only the stale entries go; a valid draft on another category is untouched.
   * The `isPending` and empty-list guards matter as much as the check itself:
   * `categories` is empty during the first fetch, so without them every restored
   * draft is discarded on mount and the persistence silently does nothing.
   */
  useEffect(() => {
    if (isPending || categories.length === 0) return;

    const stale = Object.keys(draftOrder).filter((id) => {
      const category = categories.find((entry) => entry.id === id);
      if (category === undefined) return true;
      return resequenceRecords(category.questions, draftOrder[id] ?? []) === null;
    });
    if (stale.length === 0) return;

    setDraftOrder((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !stale.includes(id))),
    );
  }, [categories, draftOrder, isPending, setDraftOrder]);

  /**
   * A question may only move within its own category.
   *
   * `order` is scoped per category — two questions in different categories can
   * both be 3 without conflict — so a cross-category drop has no meaning to
   * write. Refusing it in `canDrop` means the indicator never appears over an
   * invalid target, rather than accepting the drag and dropping it on the floor.
   */
  const canDrop = useCallback(
    (movedId: string, targetId: string) =>
      rowsById.get(movedId)?.categoryId === rowsById.get(targetId)?.categoryId,
    [rowsById],
  );

  const handleReorder = useCallback(
    ({ movedId, targetId, placement }: ReorderMove) => {
      const moved = rowsById.get(movedId);
      if (!moved || rowsById.get(targetId)?.categoryId !== moved.categoryId) return;

      const category = categories.find((entry) => entry.id === moved.categoryId);
      if (!category) return;

      setDraftOrder((current) => {
        // The ids as they stand — the draft if one exists, otherwise the
        // server's own order — so successive drags compose instead of each
        // starting from the persisted sequence again.
        const currentIds =
          current[category.id] ?? category.questions.map((question) => question.id);

        return {
          ...current,
          [category.id]: moveRecordId(currentIds, movedId, targetId, placement),
        };
      });
    },
    // `setDraftOrder` is in the deps because it comes from the store now, not
    // from `useState`, so the linter cannot assume it is stable. The action is
    // created once, so this costs nothing.
    [categories, rowsById, setDraftOrder],
  );

  const resetOrder = useCallback(() => {
    setDraftOrder({});
  }, [setDraftOrder]);

  const saveOrder = useCallback(() => {
    /*
     * One request per DIRTY CATEGORY, not one per moved row.
     *
     * A category is the unit `order` is scoped to, so it is also the unit the
     * endpoint takes. Reordering ten questions inside Code is one call; touching
     * two categories is two. `Promise.all` rather than a loop with awaits, so a
     * failure in one does not leave the others unattempted.
     */
    void Promise.all(
      dirtyCategoryIds.map(
        (categoryId) =>
          new Promise<void>((resolve, reject) => {
            reorderQuestions.mutate(
              { categoryId, ids: draftOrder[categoryId] ?? [] },
              {
                onSuccess: () => {
                  resolve();
                },
                onError: reject,
              },
            );
          }),
      ),
    ).then(
      () => {
        // Cleared only now. Until the server has confirmed, the local order is
        // still unsaved and must keep saying so.
        setDraftOrder({});
        toast.success(labels.reorder.saved);
      },
      (cause: unknown) => {
        // The draft is deliberately NOT cleared: the admin keeps the arrangement
        // they built and can retry, rather than losing it to a failed request.
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    );
  }, [dirtyCategoryIds, draftOrder, reorderQuestions, setDraftOrder]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (categoryId !== ALL && row.categoryId !== categoryId) return false;
      if (taskTypeId !== ALL && !row.appliesTo.includes(taskTypeId)) return false;
      if (needle === '') return true;
      return (
        row.text.toLowerCase().includes(needle) || row.categoryName.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, categoryId, taskTypeId]);

  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: labels.categoryAll },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [categories],
  );

  const taskTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: ALL, label: labels.taskTypeAll },
      ...taskTypes.map((type) => ({ value: type.id, label: type.name })),
    ],
    [taskTypes],
  );

  const setActive = useCallback(
    (question: ChecklistQuestion, isActive: boolean) => {
      mutateQuestion(
        { id: question.id, input: { isActive } },
        {
          onSuccess: () => {
            toast.success(isActive ? labels.activate.success : labels.deactivate.success);
            setRetiring(null);
          },
          onError: (cause) => {
            toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
          },
        },
      );
    },
    [mutateQuestion],
  );

  const columns = useMemo<ColumnList<QuestionRow>>(
    () => [
      textColumn,
      categoryColumn,
      appliesToColumn,
      orderColumn,
      statusColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const row = context.row.original;
          return (
            <AdminRowActions
              isActive={row.isActive}
              editLabel={interpolate(labels.actions.edit, { text: row.text })}
              toggleLabel={interpolate(
                row.isActive ? labels.actions.deactivate : labels.actions.activate,
                { text: row.text },
              )}
              deleteLabel={interpolate(labels.actions.delete, {
                text: row.text,
              })}
              onEdit={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              onToggle={() => {
                if (row.isActive) setRetiring(row);
                else setActive(row, true);
              }}
              onDelete={() => {
                setDeleting(row);
              }}
            />
          );
        },
      }),
    ],
    [setActive],
  );

  return (
    <>
      <DataTable
        data={visible}
        columns={columns}
        getRowId={(row) => row.id}
        totalCount={rows.length}
        countNoun={labels.noun}
        caption={labels.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={onRetry}
        pageSize={15}
        /*
          `rowCountSelector` is deliberately NOT passed — the default is on, and
          this grid used to be the one call site in the product that opted out,
          on the grounds that the checklist tab was already a crowded card. That
          was the wrong trade: the question bank is the LONGEST administered list
          here (four pages at fifteen a page), so it is the grid an admin most
          wants to widen, and the opt-out left Questions as the only checklist
          tab without a control Categories and Task Types both have.

          The rule it was reaching for is in `docs/frontend-standards.md` and is
          about SHORT lists that never reach a second page.
        */
        /*
          The one grid in the product that opts in. Every other call site omits
          this prop and is untouched by the feature.
        */
        reorder={{
          onDrop: handleReorder,
          canDrop,
          handleLabel: (row) => interpolate(labels.reorder.handle, { text: row.text }),
        }}
        toolbar={
          <div className="w-full space-y-3">
            {/*
              The unsaved-order bar.

              An `Alert` with inline actions, which is the shape this codebase
              already uses for "something needs your attention here" — the
              stale-data warning inside `DataTable` and the review blockers on
              the code review form. Deliberately NOT a `beforeunload` prompt or
              a router block: both would be firsts here, and neither is
              warranted for a change the admin can redo in seconds.
            */}
            {isDirty ? (
              <Alert
                tone="warning"
                title={labels.reorder.unsavedTitle}
                action={
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      onClick={saveOrder}
                      isLoading={reorderQuestions.isPending}
                      leadingIcon={<Save className="size-3.5" aria-hidden="true" />}
                    >
                      {labels.reorder.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={resetOrder}
                      disabled={reorderQuestions.isPending}
                    >
                      {common.actions.cancel}
                    </Button>
                  </div>
                }
              >
                {labels.reorder.unsavedHint}
              </Alert>
            ) : null}

            <div className="flex w-full flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <SearchField
                  value={search}
                  onValueChange={setSearch}
                  label={labels.searchLabel}
                  placeholder={labels.searchPlaceholder}
                />
              </div>
              <div className="w-52">
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={categoryOptions}
                  aria-label={labels.columns.category}
                />
              </div>
              <div className="w-52">
                <Select
                  value={taskTypeId}
                  onValueChange={setTaskTypeId}
                  options={taskTypeOptions}
                  aria-label={labels.columns.appliesTo}
                />
              </div>
              <Button
                disabled={categories.length === 0}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                {labels.add}
              </Button>
            </div>
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <ClipboardList />
              </EmptyIllustration>
            }
            title={labels.emptyTitle}
            hint={labels.emptyHint}
          />
        }
      />

      {isFormOpen ? (
        <QuestionFormDialog
          key={editing?.id ?? 'new'}
          question={editing}
          categories={categories}
          taskTypes={taskTypes}
          defaultCategoryId={categoryId === ALL ? undefined : categoryId}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null);
        }}
        title={labels.deactivate.title}
        description={labels.deactivate.description}
        confirmLabel={labels.deactivate.confirm}
        onConfirm={() => {
          if (retiring !== null) setActive(retiring, false);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            // Cleared on close, or the next row's dialog opens still showing why
            // the previous one was refused.
            setDeleteError(null);
          }
        }}
        title={labels.delete.title}
        description={labels.delete.description}
        confirmLabel={labels.delete.confirm}
        isPending={deleteQuestion.isPending}
        onConfirm={() => {
          if (deleting === null) return;
          setDeleteError(null);
          deleteQuestion.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(labels.delete.success);
              setDeleting(null);
            },
            onError: (cause) => {
              // Inline, not a toast: a question a developer has already answered
              // cannot be deleted, and that refusal has to stay readable beside
              // the still-open dialog instead of fading out of it. Same treatment
              // as the Categories and Task Types tabs.
              setDeleteError(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
      >
        {deleteError === null ? null : <Alert tone="danger">{deleteError}</Alert>}
      </ConfirmDialog>
    </>
  );
}
