import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TaskListItem, User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useAssignReviewer } from '../api/queries.ts';

/**
 * Assign or reassign a reviewer (screen 01's person-plus row action).
 *
 * Supports initial assignment for Submitted/ReSubmitted tasks and
 * re-assignment with mandatory reason for InReview tasks.
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
  const isReassign = task.status === 'InReview';

  // Seeded on mount: for reassign, start empty so admin explicitly selects a new reviewer
  const [reviewerId, setReviewerId] = useState(isReassign ? '' : (task.reviewerId ?? ''));
  const [reason, setReason] = useState('');

  const eligible = useMemo(
    () =>
      users.filter(
        (user) =>
          user.isActive &&
          user.roles.includes('Reviewer') &&
          user.id !== task.developerId &&
          (!isReassign || user.id !== task.reviewerId),
      ),
    [users, task.developerId, task.reviewerId, isReassign],
  );

  const options: SelectOption[] = eligible.map((user) => ({ value: user.id, label: user.name }));

  function submit() {
    if (reviewerId === '') return;
    if (isReassign && reason.trim() === '') return;
    const reviewerName = eligible.find((user) => user.id === reviewerId)?.name ?? '';

    assign.mutate(
      { taskId: task.id, reviewerId, reason: isReassign ? reason.trim() : undefined },
      {
        onSuccess: () => {
          toast.success(
            interpolate(
              isReassign ? '{taskCode} reassigned to {name}.' : admin.tasks.assign.success,
              {
                taskCode: task.taskCode,
                name: reviewerName,
              },
            ),
          );
          onClose();
        },
        onError: (cause) => {
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  const isSubmitDisabled =
    reviewerId === '' || eligible.length === 0 || (isReassign && reason.trim() === '');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isReassign ? 'Reassign Reviewer' : admin.tasks.assign.title}
      description={
        isReassign
          ? `Choose a new reviewer to take over ${task.taskCode}.`
          : interpolate(admin.tasks.assign.description, {
              taskCode: task.taskCode,
            })
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button
            variant="adminPrimary"
            onClick={submit}
            disabled={isSubmitDisabled}
            isLoading={assign.isPending}
          >
            {assign.isPending
              ? isReassign
                ? 'Reassigning…'
                : admin.tasks.assign.submitting
              : isReassign
                ? 'Reassign Reviewer'
                : admin.tasks.assign.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={isReassign ? 'New Reviewer' : admin.tasks.assign.label}
          hint={admin.tasks.assign.ownerExcluded}
        >
          <Select
            value={reviewerId}
            onValueChange={setReviewerId}
            options={options}
            placeholder={isReassign ? 'Select a new reviewer' : admin.tasks.assign.placeholder}
            disabled={eligible.length === 0}
            aria-label={isReassign ? 'New Reviewer' : admin.tasks.assign.label}
          />
        </Field>

        {isReassign ? (
          <Field label="Reassignment Reason (required)">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this reviewer being reassigned?"
            />
          </Field>
        ) : null}

        {eligible.length === 0 ? (
          <p className="text-sm text-danger">{admin.tasks.assign.noReviewers}</p>
        ) : null}

        {task.reviewerName === null ? null : (
          <p className="text-sm text-ink-500">
            {interpolate(admin.tasks.assign.currentReviewer, { name: task.reviewerName })}
          </p>
        )}
      </div>
    </Dialog>
  );
}
