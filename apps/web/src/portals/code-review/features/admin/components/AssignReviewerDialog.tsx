import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TaskListItem, User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useAssignReviewer } from '../api/queries.ts';

/**
 * Assign or reassign a reviewer (screen 01's person-plus row action).
 *
 * The developer who raised the task is filtered out of the list. That is a
 * courtesy, not the control: the handler rejects the same pairing, because the
 * self-review bar has to hold whether or not the request came from this dialog.
 */
export function AssignReviewerDialog({
  task,
  users,
  onClose,
}: {
  /** The task being assigned. The caller mounts this only when there is one. */
  task: TaskListItem;
  users: readonly User[];
  onClose: () => void;
}) {
  const assign = useAssignReviewer();
  // Seeded on mount rather than copied in from an effect: the caller mounts a
  // fresh dialog per task, so there is no stale selection to clear.
  const [reviewerId, setReviewerId] = useState(task.reviewerId ?? '');

  const eligible = useMemo(
    () =>
      users.filter(
        (user) => user.isActive && user.roles.includes('Reviewer') && user.id !== task.developerId,
      ),
    [users, task.developerId],
  );

  const options: SelectOption[] = eligible.map((user) => ({
    value: user.id,
    label: user.name,
  }));

  function submit() {
    if (reviewerId === '') return;
    const reviewerName = eligible.find((user) => user.id === reviewerId)?.name ?? '';

    assign.mutate(
      { taskId: task.id, reviewerId },
      {
        onSuccess: () => {
          toast.success(
            interpolate(admin.tasks.assign.success, {
              taskCode: task.taskCode,
              name: reviewerName,
            }),
          );
          onClose();
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={admin.tasks.assign.title}
      description={interpolate(admin.tasks.assign.description, {
        taskCode: task.taskCode,
      })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button
            onClick={submit}
            disabled={reviewerId === '' || eligible.length === 0}
            isLoading={assign.isPending}
          >
            {assign.isPending ? admin.tasks.assign.submitting : admin.tasks.assign.submit}
          </Button>
        </>
      }
    >
      <Field label={admin.tasks.assign.label} hint={admin.tasks.assign.ownerExcluded}>
        <Select
          value={reviewerId}
          onValueChange={setReviewerId}
          options={options}
          placeholder={admin.tasks.assign.placeholder}
          disabled={eligible.length === 0}
          aria-label={admin.tasks.assign.label}
        />
      </Field>

      {eligible.length === 0 ? (
        <p className="mt-3 text-sm text-danger">{admin.tasks.assign.noReviewers}</p>
      ) : null}

      {task.reviewerName === null ? null : (
        <p className="mt-3 text-sm text-ink-500">
          {interpolate(admin.tasks.assign.currentReviewer, {
            name: task.reviewerName,
          })}
        </p>
      )}
    </Dialog>
  );
}
