import { useMemo, useState } from 'react';
import { ClipboardList, Eye, Trash2, UserPlus, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaskListItem } from '@sdp/contracts';
import { DataTable } from '@/components/common/DataTable.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { buildTaskColumns } from '@/portals/code-review/components/taskColumns.tsx';
import { IconButton, Textarea } from '@/components/ui/controls.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { canAssignReviewer, canCancelTask, canDeleteTask } from '@/lib/statusMachine.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCustomers } from '@/portals/code-review/hooks/useReferenceData.ts';
import { useCancelTask, useDeleteTask, useUsers } from '../api/queries.ts';
import { AdminTaskFilterBar } from '../components/AdminTaskFilterBar.tsx';
import { AssignReviewerDialog } from '../components/AssignReviewerDialog.tsx';
import {
  EMPTY_ADMIN_FILTERS,
  filterAdminTasks,
  type AdminTaskFilters,
} from '../components/adminTaskFilters.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';

/**
 * Admin — Tasks (screen 01).
 *
 * Which row actions appear is decided by `statusMachine`, not by the wireframe's
 * drawing: the wireframe shows a cancel icon on an Approved row, which the
 * lifecycle does not permit. Following the machine keeps the buttons honest —
 * and the handlers re-check every one of them, so a stale button is a dead
 * click rather than an unauthorised write.
 */
export function AdminTasksPage() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: tasks, isPending, isFetching, error, refetch } = useTasks('all');
  const { data: users } = useUsers();
  const { data: customers } = useCustomers();
  // Set by the counter cards in `AdminLayout` — see `lib/kpiBuckets.ts`.
  const bucket = useActiveBucket();

  const [filters, setFilters] = useState<AdminTaskFilters>(EMPTY_ADMIN_FILTERS);
  const [assigning, setAssigning] = useState<TaskListItem | null>(null);
  const [cancelling, setCancelling] = useState<TaskListItem | null>(null);
  const [deleting, setDeleting] = useState<TaskListItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const cancelTask = useCancelTask();
  const deleteTask = useDeleteTask();

  const effective = useMemo<AdminTaskFilters>(
    () => ({ ...filters, bucket: bucket ?? ALL }),
    [filters, bucket],
  );

  const visible = useMemo(() => filterAdminTasks(tasks ?? [], effective), [tasks, effective]);

  const actor = useMemo(
    () => ({ userId: user?.id ?? '', roles: user?.roles ?? [] }),
    [user?.id, user?.roles],
  );

  const columns = useMemo(
    () =>
      buildTaskColumns({
        showDeveloper: true,
        showReviewer: true,
        showPriority: false,
        renderAction: (task) => (
          <div className="flex items-center justify-end gap-0.5">
            <IconButton
              label={interpolate(admin.tasks.actions.view, {
                taskCode: task.taskCode,
              })}
              icon={<Eye className="size-4" />}
              size="sm"
              onClick={() => {
                void navigate(ROUTES.developer.task(task.id));
              }}
            />
            {canAssignReviewer(actor, task) ? (
              <IconButton
                label={interpolate(admin.tasks.actions.assign, {
                  taskCode: task.taskCode,
                })}
                icon={<UserPlus className="size-4" />}
                size="sm"
                onClick={() => {
                  setAssigning(task);
                }}
              />
            ) : null}
            {canCancelTask(actor, task) ? (
              <IconButton
                label={interpolate(admin.tasks.actions.cancel, {
                  taskCode: task.taskCode,
                })}
                icon={<XCircle className="size-4" />}
                tone="danger"
                size="sm"
                onClick={() => {
                  setCancelReason('');
                  setCancelling(task);
                }}
              />
            ) : null}
            {canDeleteTask(actor, task) ? (
              <IconButton
                label={interpolate(admin.tasks.actions.delete, {
                  taskCode: task.taskCode,
                })}
                icon={<Trash2 className="size-4" />}
                tone="danger"
                size="sm"
                onClick={() => {
                  setDeleting(task);
                }}
              />
            ) : null}
          </div>
        ),
      }),
    [actor, navigate],
  );

  function confirmCancel() {
    if (cancelling === null) return;
    const task = cancelling;

    cancelTask.mutate(
      { taskId: task.id, reason: cancelReason },
      {
        onSuccess: () => {
          toast.success(
            interpolate(admin.tasks.cancel.success, {
              taskCode: task.taskCode,
            }),
          );
          setCancelling(null);
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  function confirmDelete() {
    if (deleting === null) return;
    const task = deleting;

    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(interpolate(admin.tasks.delete.success, { taskCode: task.taskCode }));
        setDeleting(null);
      },
      onError: (cause) => {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  return (
    <section aria-labelledby="admin-tasks-heading">
      <h2 id="admin-tasks-heading" className="sr-only">
        {admin.tasks.title}
      </h2>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        totalCount={tasks?.length ?? 0}
        countNoun={admin.tasks.noun}
        caption={admin.tasks.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={15}
        toolbar={
          <AdminTaskFilterBar
            filters={filters}
            onChange={setFilters}
            customers={customers ?? []}
            users={users ?? []}
          />
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <ClipboardList />
              </EmptyIllustration>
            }
            title={admin.tasks.emptyTitle}
            hint={admin.tasks.emptyHint}
          />
        }
      />

      {assigning === null ? null : (
        <AssignReviewerDialog
          key={assigning.id}
          task={assigning}
          users={users ?? []}
          onClose={() => {
            setAssigning(null);
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title={admin.tasks.cancel.title}
        description={interpolate(admin.tasks.cancel.description, {
          taskCode: cancelling?.taskCode ?? '',
        })}
        confirmLabel={
          cancelTask.isPending ? admin.tasks.cancel.confirming : admin.tasks.cancel.confirm
        }
        // "Cancel" would be the dismissive AND the destructive word on this one
        // dialog, so the dismissive button says what it keeps instead.
        cancelLabel={admin.tasks.cancel.keep}
        onConfirm={confirmCancel}
        isPending={cancelTask.isPending}
      >
        <Field label={admin.tasks.cancel.reasonLabel}>
          <Textarea
            value={cancelReason}
            onChange={(event) => {
              setCancelReason(event.target.value);
            }}
            rows={3}
            placeholder={admin.tasks.cancel.reasonPlaceholder}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={admin.tasks.delete.title}
        description={interpolate(admin.tasks.delete.description, {
          taskCode: deleting?.taskCode ?? '',
        })}
        confirmLabel={
          deleteTask.isPending ? admin.tasks.delete.confirming : admin.tasks.delete.confirm
        }
        onConfirm={confirmDelete}
        isPending={deleteTask.isPending}
      />
    </section>
  );
}
