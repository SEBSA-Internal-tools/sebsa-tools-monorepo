import { useState } from 'react';
import { toast } from 'sonner';
import { createHandoverInputSchema, type TaskListItem } from '@sdp/contracts';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { useHandOver } from '../api/queries.ts';

/**
 * Hand a review back to the admin (spec p.12).
 *
 * ⚠️ Our design — no wireframe exists for handover anywhere in the project.
 * Built on the shared `ConfirmDialog` rather than as its own modal so it reads
 * like every other consequential action in the product.
 *
 * The reason is mandatory. It is the only thing the admin has to decide who
 * picks the task up next, and an optional field here would reliably arrive
 * empty — the handover queue would then be a list of tasks with no explanation
 * of why any of them are there.
 */
export function HandoverDialog({ task, onClose }: { task: TaskListItem; onClose: () => void }) {
  const handOver = useHandOver(task.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    const parsed = createHandoverInputSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }

    handOver.mutate(parsed.data, {
      onSuccess: (updated) => {
        toast.success(
          interpolate(reviews.form.handoverSuccess, {
            taskCode: updated.taskCode,
          }),
        );
        onClose();
      },
      onError: (cause) => {
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={reviews.form.handoverTitle}
      description={interpolate(reviews.form.handoverDescription, {
        taskCode: task.taskCode,
      })}
      confirmLabel={
        handOver.isPending ? reviews.form.handoverConfirming : reviews.form.handoverConfirm
      }
      isPending={handOver.isPending}
      onConfirm={submit}
    >
      <Field
        label={reviews.form.handoverReasonLabel}
        hint={reviews.form.handoverReasonHint}
        required
        error={error}
      >
        <Textarea
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
          rows={3}
          placeholder={reviews.form.handoverReasonPlaceholder}
        />
      </Field>
    </ConfirmDialog>
  );
}
