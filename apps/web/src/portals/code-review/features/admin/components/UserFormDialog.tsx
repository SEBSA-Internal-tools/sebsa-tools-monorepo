import { useState } from 'react';
import { toast } from 'sonner';
import { ROLES, createUserInputSchema, type Role, type User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCreateUser, useReplaceUserRoles, useUpdateUser } from '../api/queries.ts';

/**
 * Add User (screen 02's modal) and Edit User, which is the same three fields.
 *
 * One component rather than two: the fields, the validation and the role
 * checkboxes are identical, and the only difference is which mutation runs and
 * what the buttons say. Two dialogs would be two places for the role list to
 * drift.
 *
 * Validation is `createUserInputSchema` from `@sdp/types` — the same schema the
 * handler parses, so a message shown here is the message the server would give.
 */

interface FormState {
  name: string;
  email: string;
  roles: Role[];
}

const EMPTY: FormState = { name: '', email: '', roles: [] };

/**
 * Mounted only while open, and keyed on the subject by the caller.
 *
 * That is what lets the form seed itself in `useState` instead of copying props
 * into state from an effect. Seeding via an effect is the pattern that already
 * cost this codebase a bug on the review form — a refetch re-ran it and
 * discarded what the user had typed.
 */
export function UserFormDialog({
  user,
  onClose,
  availableRoles = ['Developer', 'Reviewer'],
  editRoles = true,
}: {
  /** `null` creates; a user edits that user. */
  user: User | null;
  onClose: () => void;
  availableRoles?: readonly Role[];
  /** Allows callers to limit role changes while preserving the shared user form. */
  editRoles?: boolean;
}) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const replaceRoles = useReplaceUserRoles();

  const [form, setForm] = useState<FormState>(() =>
    user === null ? EMPTY : { name: user.name, email: user.email, roles: [...user.roles] },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const isPending = createUser.isPending || updateUser.isPending || replaceRoles.isPending;

  async function submit() {
    const parsed = createUserInputSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'roles') next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    const onError = (cause: unknown) => {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    };

    if (user === null) {
      try {
        const created = await createUser.mutateAsync(parsed.data);
        toast.success(interpolate(admin.users.created, { name: created.name }));
        onClose();
      } catch (cause) {
        onError(cause);
      }
    } else {
      try {
        const updated = await updateUser.mutateAsync({
          userId: user.id,
          input: { name: parsed.data.name, email: parsed.data.email },
        });
        if (editRoles) {
          await replaceRoles.mutateAsync({ userId: user.id, roles: parsed.data.roles });
        }
        toast.success(interpolate(admin.users.updated, { name: updated.name }));
        onClose();
      } catch (cause) {
        onError(cause);
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={user === null ? admin.users.addTitle : admin.users.editTitle}
      description={user === null ? admin.users.addSubtitle : admin.users.editSubtitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button onClick={() => void submit()} isLoading={isPending}>
            {user === null
              ? isPending
                ? admin.users.creating
                : admin.users.create
              : isPending
                ? admin.users.saving
                : admin.users.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={admin.users.nameLabel} required error={errors.name}>
          <Input
            value={form.name}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value });
            }}
            placeholder={admin.users.namePlaceholder}
          />
        </Field>

        <Field label={admin.users.emailLabel} required error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(event) => {
              setForm({ ...form, email: event.target.value });
            }}
            placeholder={admin.users.emailPlaceholder}
          />
        </Field>

        {user !== null && !editRoles ? null : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-900">
              {admin.users.rolesLabel}
            </legend>
            <div className="flex flex-wrap gap-4">
              {ROLES.filter((role) => availableRoles.includes(role)).map((role) => (
                <Checkbox
                  key={role}
                  label={common.role[role]}
                  checked={form.roles.includes(role)}
                  onCheckedChange={(checked) => {
                    setForm({
                      ...form,
                      roles: checked
                        ? [...form.roles, role]
                        : form.roles.filter((current) => current !== role),
                    });
                  }}
                />
              ))}
            </div>
            {errors.roles === undefined ? null : (
              <p role="alert" className="mt-2 text-xs font-medium text-danger">
                {errors.roles}
              </p>
            )}
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
