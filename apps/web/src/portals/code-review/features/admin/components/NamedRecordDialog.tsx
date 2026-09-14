import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import common from '@/content/common.json';

/**
 * Name + order, which is the whole of a Category and the whole of a Task Type.
 *
 * One dialog for both rather than two near-identical ones. The fields, the
 * validation and the "blank order means append" rule are the same, and the only
 * difference is the copy the caller passes in.
 *
 * Mounted only while open and keyed on the subject, so it seeds from `useState`
 * rather than copying props into state from an effect.
 */
export function NamedRecordDialog({
  title,
  description,
  nameLabel,
  namePlaceholder,
  orderLabel,
  orderHint,
  submitLabel,
  initial,
  isPending,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  nameLabel: string;
  namePlaceholder: string;
  orderLabel: string;
  orderHint: string;
  submitLabel: string;
  /** `null` creates. */
  initial: { name: string; order: number } | null;
  isPending: boolean;
  /** `order` is `undefined` when the field was left blank — the server appends. */
  onSubmit: (values: { name: string; order: number | undefined }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [order, setOrder] = useState(initial === null ? '' : String(initial.order));
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    if (name.trim() === '') {
      setError(nameLabel === '' ? 'Required' : `${nameLabel} is required`);
      return;
    }

    const parsedOrder = order.trim() === '' ? undefined : Number(order);
    if (parsedOrder !== undefined && (!Number.isInteger(parsedOrder) || parsedOrder < 0)) {
      setError(orderHint);
      return;
    }

    onSubmit({ name: name.trim(), order: parsedOrder });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button onClick={submit} isLoading={isPending}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={nameLabel} required error={error}>
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder={namePlaceholder}
          />
        </Field>

        <Field label={orderLabel} hint={orderHint}>
          <Input
            type="number"
            min={0}
            value={order}
            onChange={(event) => {
              setOrder(event.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
