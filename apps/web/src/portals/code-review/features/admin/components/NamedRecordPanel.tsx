import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Layers, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ActiveBadge } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable, type ReorderMove } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { interpolate } from '@/lib/formatters.ts';
import { moveRecordId, resequenceRecords } from '@/lib/checklistOrdering.ts';
import common from '@/content/common.json';
import { AdminRowActions } from './AdminRowActions.tsx';
import { NamedRecordDialog } from './NamedRecordDialog.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';

/**
 * Categories and Task Types, which are the same screen twice.
 *
 * Both are a name, a display order, an active flag and a question count, with
 * the same three row actions and the same retire-vs-delete asymmetry. Writing
 * them separately would be ~250 duplicated lines and two places for that
 * asymmetry to drift, so the copy and the three mutations are parameters.
 *
 * Deliberately NOT generalised further to cover Users and Customers: those have
 * genuinely different columns, filters and validation, and forcing them through
 * one component would cost more in conditionals than it saved.
 */

export interface NamedRecordRow {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  /** Questions in this category, or asked for this task type. */
  questionCount: number;
}

export interface NamedRecordCopy {
  caption: string;
  noun: string;
  emptyTitle: string;
  emptyHint: string;
  columns: {
    name: string;
    questionCount: string;
    order: string;
    status: string;
  };
  add: string;
  addTitle: string;
  addSubtitle: string;
  editTitle: string;
  editSubtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  orderLabel: string;
  orderHint: string;
  created: string;
  updated: string;
  actions: {
    edit: string;
    activate: string;
    deactivate: string;
    delete: string;
  };
  deactivate: {
    title: string;
    description: string;
    confirm: string;
    success: string;
  };
  activate: { success: string };
  delete: {
    title: string;
    description: string;
    confirm: string;
    success: string;
  };
  reorder: {
    handle: string;
    unsavedTitle: string;
    unsavedHint: string;
    save: string;
    saved: string;
  };
}

/** The three mutations, supplied by the caller so the hooks stay at its level. */
export interface NamedRecordMutations {
  create: (input: { name: string; order: number | undefined }, done: () => void) => void;
  update: (
    id: string,
    input: { name?: string; order?: number; isActive?: boolean },
    done: () => void,
  ) => void;
  /**
   * `fail` carries the server's refusal to the dialog.
   *
   * Delete is the one mutation here that is routinely REFUSED rather than
   * failing — a category still holding questions, a task type a question
   * targets. The message names the remedy, so it belongs in front of the admin
   * who just clicked Delete rather than in a toast that fades.
   */
  remove: (id: string, done: () => void, fail: (message: string) => void) => void;
  /** The whole list in its new order. One request, not one per moved row. */
  reorder: (ids: readonly string[], done: () => void) => void;
  isSaving: boolean;
  isDeleting: boolean;
  isReordering: boolean;
}

const helper = columnHelper<NamedRecordRow>();

/**
 * The four data columns, parameterised by the caller's copy.
 *
 * A function rather than module constants because the headers differ per panel,
 * and each column is still its own `const` inside it — building them inline in
 * one array literal collapses TanStack's tuple inference and silently types
 * every `cell` argument as `any` (see the note in `taskColumns.tsx`).
 */
function dataColumns(copy: NamedRecordCopy): ColumnList<NamedRecordRow> {
  const nameColumn = helper.accessor('name', {
    header: copy.columns.name,
    cell: (context) => <span className="text-sm font-bold text-ink-900">{context.getValue()}</span>,
  });

  const questionCountColumn = helper.accessor('questionCount', {
    header: copy.columns.questionCount,
    cell: (context) => <span className="text-sm tabular-nums">{context.getValue()}</span>,
  });

  const orderColumn = helper.accessor('order', {
    header: copy.columns.order,
    cell: (context) => <span className="text-sm tabular-nums">{context.getValue()}</span>,
  });

  const statusColumn = helper.accessor('isActive', {
    header: copy.columns.status,
    cell: (context) => <ActiveBadge isActive={context.getValue()} />,
  });

  return [nameColumn, questionCountColumn, orderColumn, statusColumn];
}

export function NamedRecordPanel({
  rows,
  copy,
  mutations,
  draftOrder,
  onDraftOrderChange,
  isPending,
  isFetching,
  error,
  onRetry,
}: {
  rows: readonly NamedRecordRow[];
  copy: NamedRecordCopy;
  mutations: NamedRecordMutations;
  /**
   * The unsaved drag order, held by the CALLER.
   *
   * Two instances of this panel exist and each needs its own, and neither may
   * lose it when Radix unmounts the tab — see
   * `features/admin/hooks/useChecklistAdminView.ts`. The signature is
   * `useState`'s, so everything below reads as though the state were local.
   */
  draftOrder: string[] | null;
  onDraftOrderChange: Dispatch<SetStateAction<string[] | null>>;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [editing, setEditing] = useState<NamedRecordRow | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [retiring, setRetiring] = useState<NamedRecordRow | null>(null);
  const [deleting, setDeleting] = useState<NamedRecordRow | null>(null);

  /**
   * Why the open delete dialog is refusing.
   *
   * Inline rather than a toast, because this is an error that needs ACTION —
   * "Move or delete them first" names the next step, and a message that fades
   * after four seconds leaves the admin looking at an open dialog whose Delete
   * button appears to have done nothing. The dependency table says as much:
   * sonner's non-job is "errors that need action — those are inline".
   */
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /*
   * The unsaved drag order arrives as a prop: one flat sequence of ids, or
   * `null` when the grid is showing the server's own order. Categories and task
   * types have no grouping, so there is exactly one order to hold, unlike the
   * Questions tab's per-category record.
   *
   * Nothing is written until Save — a drag session produces many arrangements
   * and only the last is worth persisting.
   */
  const setDraftOrder = onDraftOrderChange;

  /*
   * The server's rows, with any unsaved drag applied over them.
   *
   * Resequenced from the FULL row list, never the visible page — the grid pages,
   * and reordering what happens to be on screen is how a paginated list ends up
   * with 1–15 written over every page. `resequenceRecords` returns `null` if the
   * draft and the rows have drifted apart (a row added or deleted in another
   * tab), in which case the server's order is the safe thing to show.
   */
  const ordered = useMemo<readonly NamedRecordRow[]>(
    () => (draftOrder === null ? rows : (resequenceRecords(rows, draftOrder) ?? rows)),
    [rows, draftOrder],
  );

  /*
   * A draft that no longer fits its rows is dropped, banner and all.
   *
   * The draft now outlives this component — it survives a tab switch, a trip to
   * another screen and a refresh — so it can come back to a row set that has
   * changed underneath it: a category created and then reloaded, or another
   * admin's save landing first. Falling back to the server's order while STILL
   * showing "Unsaved order" would claim work that no longer exists, and Save
   * would send ids the server refuses with `ORDER_INCOMPLETE`.
   *
   * The guards are the whole subtlety. `rows` is empty during the first fetch,
   * so an unguarded check discards every restored draft on mount and the
   * persistence silently does nothing — which is exactly what it would look like
   * if the feature were broken.
   */
  useEffect(() => {
    if (draftOrder === null || isPending || rows.length === 0) return;
    if (resequenceRecords(rows, draftOrder) === null) onDraftOrderChange(null);
  }, [rows, draftOrder, isPending, onDraftOrderChange]);

  const handleReorder = useCallback(
    ({ movedId, targetId, placement }: ReorderMove) => {
      setDraftOrder((current) =>
        moveRecordId(current ?? rows.map((row) => row.id), movedId, targetId, placement),
      );
    },
    // `setDraftOrder` is in the deps because it is a prop now, not a `useState`
    // setter the linter knows to be stable. The store action behind it is
    // created once, so this costs nothing.
    [rows, setDraftOrder],
  );

  const saveOrder = useCallback(() => {
    if (draftOrder === null) return;

    mutations.reorder(draftOrder, () => {
      // Cleared only once the server has confirmed. Until then the local order
      // is still unsaved and must keep saying so.
      setDraftOrder(null);
      toast.success(copy.reorder.saved);
    });
  }, [draftOrder, mutations, copy, setDraftOrder]);

  const setActive = useCallback(
    (row: NamedRecordRow, isActive: boolean) => {
      mutations.update(row.id, { isActive }, () => {
        toast.success(
          interpolate(isActive ? copy.activate.success : copy.deactivate.success, {
            name: row.name,
          }),
        );
        setRetiring(null);
      });
    },
    [mutations, copy],
  );

  const columns = useMemo<ColumnList<NamedRecordRow>>(
    () => [
      ...dataColumns(copy),
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const row = context.row.original;
          return (
            <AdminRowActions
              isActive={row.isActive}
              editLabel={interpolate(copy.actions.edit, { name: row.name })}
              toggleLabel={interpolate(
                row.isActive ? copy.actions.deactivate : copy.actions.activate,
                { name: row.name },
              )}
              deleteLabel={interpolate(copy.actions.delete, { name: row.name })}
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
    [copy, setActive],
  );

  return (
    <>
      <DataTable
        data={ordered}
        columns={columns}
        getRowId={(row) => row.id}
        countNoun={copy.noun}
        caption={copy.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={onRetry}
        pageSize={15}
        /*
          The same opt-in prop the Questions tab uses, and NO `canDrop`: these are
          flat lists with no grouping, which is the case the optional refusal
          callback exists to leave alone.
        */
        reorder={{
          onDrop: handleReorder,
          handleLabel: (row) => interpolate(copy.reorder.handle, { name: row.name }),
        }}
        toolbar={
          <div className="w-full space-y-3">
            {draftOrder === null ? null : (
              <Alert
                tone="warning"
                title={copy.reorder.unsavedTitle}
                action={
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      onClick={saveOrder}
                      isLoading={mutations.isReordering}
                      leadingIcon={<Save className="size-3.5" aria-hidden="true" />}
                    >
                      {copy.reorder.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setDraftOrder(null);
                      }}
                      disabled={mutations.isReordering}
                    >
                      {common.actions.cancel}
                    </Button>
                  </div>
                }
              >
                {copy.reorder.unsavedHint}
              </Alert>
            )}

            <div className="flex w-full justify-end">
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                {copy.add}
              </Button>
            </div>
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <Layers />
              </EmptyIllustration>
            }
            title={copy.emptyTitle}
            hint={copy.emptyHint}
          />
        }
      />

      {isFormOpen ? (
        <NamedRecordDialog
          key={editing?.id ?? 'new'}
          title={editing === null ? copy.addTitle : copy.editTitle}
          description={editing === null ? copy.addSubtitle : copy.editSubtitle}
          nameLabel={copy.nameLabel}
          namePlaceholder={copy.namePlaceholder}
          orderLabel={copy.orderLabel}
          orderHint={copy.orderHint}
          submitLabel={editing === null ? copy.add : common.actions.save}
          initial={editing === null ? null : { name: editing.name, order: editing.order }}
          isPending={mutations.isSaving}
          onSubmit={(values) => {
            const subject = editing;
            if (subject === null) {
              mutations.create(values, () => {
                toast.success(interpolate(copy.created, { name: values.name }));
                setFormOpen(false);
              });
            } else {
              mutations.update(
                subject.id,
                {
                  name: values.name,
                  ...(values.order === undefined ? {} : { order: values.order }),
                },
                () => {
                  toast.success(interpolate(copy.updated, { name: values.name }));
                  setFormOpen(false);
                },
              );
            }
          }}
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
        title={copy.deactivate.title}
        description={interpolate(copy.deactivate.description, {
          name: retiring?.name ?? '',
        })}
        confirmLabel={copy.deactivate.confirm}
        isPending={mutations.isSaving}
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
        title={copy.delete.title}
        description={interpolate(copy.delete.description, {
          name: deleting?.name ?? '',
        })}
        confirmLabel={copy.delete.confirm}
        isPending={mutations.isDeleting}
        onConfirm={() => {
          if (deleting === null) return;
          const subject = deleting;
          setDeleteError(null);

          mutations.remove(
            subject.id,
            () => {
              toast.success(interpolate(copy.delete.success, { name: subject.name }));
              setDeleting(null);
            },
            setDeleteError,
          );
        }}
      >
        {/*
          The refusal, in the dialog that is still open rather than in a toast
          that fades — see the note on `NamedRecordMutations.remove`. The server's
          own wording, because it names the remedy: "Move or delete them first"
          is the next action, where a generic failure message is a dead end.
        */}
        {deleteError === null ? null : <Alert tone="danger">{deleteError}</Alert>}
      </ConfirmDialog>
    </>
  );
}
