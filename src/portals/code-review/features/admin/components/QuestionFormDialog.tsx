import { useState } from 'react';
import { toast } from 'sonner';
import {
  createChecklistQuestionInputSchema,
  type ChecklistCategory,
  type ChecklistQuestion,
  type CreateChecklistQuestionInput,
  type DuplicateOrderStrategy,
  type TaskTypeRecord,
} from '@sdp/contracts';
import { ChoiceDialog } from '@/components/common/ChoiceDialog.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox, Textarea } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { questionAtOrder } from '@/lib/checklistOrdering.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCreateQuestion, useUpdateQuestion } from '../api/checklistAdmin.ts';

/**
 * Add / Edit a checklist question.
 *
 * The task-type checkboxes are the substance of this form. A question declares
 * which task types it applies to (not the category), which is what lets Unit
 * Testing's four questions be shared verbatim by all five task types while
 * Reservation's three belong to Customization alone.
 */

const labels = admin.checklist.questions;

export function QuestionFormDialog({
  question,
  categories,
  taskTypes,
  /** Preselected when the admin adds from within a category. */
  defaultCategoryId,
  onClose,
}: {
  question: ChecklistQuestion | null;
  categories: readonly ChecklistCategory[];
  taskTypes: readonly TaskTypeRecord[];
  defaultCategoryId?: string | undefined;
  onClose: () => void;
}) {
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();

  const [text, setText] = useState(question?.text ?? '');
  const [categoryId, setCategoryId] = useState(
    question?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '',
  );
  const [appliesTo, setAppliesTo] = useState<string[]>(question?.appliesTo ?? []);
  const [order, setOrder] = useState(question === null ? '' : String(question.order));
  const [errors, setErrors] = useState<
    Partial<Record<'text' | 'categoryId' | 'appliesTo', string>>
  >({});

  /**
   * The collision the admin has to resolve before the question can be created.
   *
   * Held as the parsed input plus the question already in the slot, so choosing
   * a strategy is one `mutate` with a field added rather than a re-parse — and
   * so the modal can quote the occupying question's own wording, which is what
   * makes "replace" a decision rather than a gamble.
   */
  const [collision, setCollision] = useState<{
    input: CreateChecklistQuestionInput;
    occupant: ChecklistQuestion;
    categoryName: string;
    order: number;
  } | null>(null);

  const isPending = createQuestion.isPending || updateQuestion.isPending;

  const categoryOptions: SelectOption[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  const onError = (cause: unknown) => {
    toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
  };

  function create(input: CreateChecklistQuestionInput) {
    createQuestion.mutate(input, {
      onSuccess: () => {
        toast.success(labels.created);
        setCollision(null);
        onClose();
      },
      onError: (cause) => {
        /*
          Clearing the collision brings the FORM back, still filled in — the
          Dialog below is bound to `collision === null`, not unmounted.

          That is the useful outcome of a refusal. The server rejects "replace"
          when developers have already answered the occupying question
          (ADR-0006), and the admin's next move is to pick a different order or
          keep both instead. Closing the whole form and making them retype the
          question would punish them for asking.
        */
        setCollision(null);
        onError(cause);
      },
    });
  }

  function submit() {
    const parsed = createChecklistQuestionInputSchema.safeParse({
      text,
      categoryId,
      appliesTo,
      ...(order.trim() === '' ? {} : { order: Number(order) }),
    });

    if (!parsed.success) {
      const next: Partial<Record<'text' | 'categoryId' | 'appliesTo', string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'text' || key === 'categoryId' || key === 'appliesTo') {
          next[key] ??= issue.message;
        }
      }
      setErrors(next);
      return;
    }

    if (question === null) {
      /*
        Ask before posting when the requested order is taken.

        The check is duplicated on the server, which answers 409 for a caller
        that skipped it — this copy exists so the admin is asked a question
        rather than shown an error they then have to undo. Edits are exempt: a
        PATCH keeps the row it already owns, so moving one is a separate concern
        from inserting into an occupied slot.
      */
      const category = categories.find((entry) => entry.id === parsed.data.categoryId);
      const requested = parsed.data.order;
      const occupant =
        category === undefined || requested === undefined
          ? undefined
          : questionAtOrder(category.questions, requested);

      if (occupant !== undefined && category !== undefined && requested !== undefined) {
        setCollision({
          input: parsed.data,
          occupant,
          categoryName: category.name,
          order: requested,
        });
        return;
      }

      create(parsed.data);
      return;
    }

    updateQuestion.mutate(
      { id: question.id, input: parsed.data },
      {
        onSuccess: () => {
          toast.success(labels.updated);
          onClose();
        },
        onError,
      },
    );
  }

  /** Both choices are the same request with a different strategy. */
  function resolveCollision(onDuplicateOrder: DuplicateOrderStrategy) {
    if (collision === null) return;
    create({ ...collision.input, onDuplicateOrder });
  }

  const duplicate = admin.checklist.questions.duplicateOrder;

  return (
    <>
      {/*
        The form steps aside while the collision is being resolved.

        Both dialogs open at once put a second modal on top of the first, and the
        form's own Cancel / Add Question footer stayed visible underneath the
        choice modal's — two action rows on screen, one of them inert, and no way
        to tell which question the buttons belonged to.

        `open` is toggled rather than the component being unmounted, so every
        field the admin typed is still here when they cancel out of the choice
        and come back to change the order.
      */}
      <Dialog
        open={collision === null}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={question === null ? labels.addTitle : labels.editTitle}
        description={question === null ? labels.addSubtitle : labels.editSubtitle}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {common.actions.cancel}
            </Button>
            <Button onClick={submit} isLoading={isPending}>
              {question === null ? labels.add : common.actions.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={labels.textLabel} required error={errors.text}>
            <Textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
              }}
              rows={3}
              placeholder={labels.textPlaceholder}
            />
          </Field>

          {/*
          Category and Order share a row, and Order sits between Category and the
          task types rather than after them.

          Order is meaningless without a category — it is scoped to one — so the
          two belong together, and reading the sentence "this question goes in
          Unit Testing, third" before the checkbox grid is the order the admin
          thinks in. It also stops a 3-character number input spanning the full
          dialog width on its own line.
        */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={labels.categoryLabel} required error={errors.categoryId}>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                options={categoryOptions}
                placeholder={labels.categoryPlaceholder}
                aria-label={labels.categoryLabel}
              />
            </Field>

            <Field label={labels.orderLabel} hint={labels.orderHint}>
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

          <fieldset>
            <legend className="text-sm font-medium text-ink-900">{labels.appliesToLabel}</legend>
            <p className="mt-1 text-xs text-ink-500">{labels.appliesToHint}</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {taskTypes.map((taskType) => (
                <Checkbox
                  key={taskType.id}
                  label={taskType.name}
                  checked={appliesTo.includes(taskType.id)}
                  onCheckedChange={(checked) => {
                    setAppliesTo(
                      checked
                        ? [...appliesTo, taskType.id]
                        : appliesTo.filter((id) => id !== taskType.id),
                    );
                  }}
                />
              ))}
            </div>
            {errors.appliesTo === undefined ? null : (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {errors.appliesTo}
              </p>
            )}
          </fieldset>
        </div>
      </Dialog>

      {/*
        Mounted only while there is a collision to resolve, and keyed on the
        occupying question — the same rule every dialog in this codebase follows
        (ADR-0008), so the copy inside can never be one render behind the record
        it describes.

        `tone="info"` because this is a fork in the road, not a warning. Nothing
        has gone wrong; the admin is being asked which of two valid placements
        they meant.
      */}
      {collision === null ? null : (
        <ChoiceDialog
          key={collision.occupant.id}
          open
          onOpenChange={(next) => {
            if (!next) setCollision(null);
          }}
          tone="info"
          title={interpolate(duplicate.title, { order: collision.order })}
          description={interpolate(duplicate.description, {
            category: collision.categoryName,
          })}
          isPending={createQuestion.isPending}
          secondaryChoice={{
            label: duplicate.replace,
            hint: duplicate.replaceHint,
            onSelect: () => {
              resolveCollision('replace');
            },
          }}
          primaryChoice={{
            label: duplicate.keepBoth,
            hint: interpolate(duplicate.keepBothHint, {
              order: collision.order,
              category: collision.categoryName,
            }),
            onSelect: () => {
              resolveCollision('shift');
            },
          }}
        >
          <p className="text-sm text-ink-700">
            {interpolate(duplicate.body, {
              text: collision.occupant.text,
              order: collision.order,
              category: collision.categoryName,
            })}
          </p>
        </ChoiceDialog>
      )}
    </>
  );
}
