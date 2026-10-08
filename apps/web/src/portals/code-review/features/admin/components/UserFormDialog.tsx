import { useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_EMAIL_LENGTH,
  ROLES,
  createUserInputSchema,
  emailAddressSchema,
  type Role,
  type User,
} from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox, Textarea } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useCreateUser, useUpdateUser } from '../api/queries.ts';

/**
 * Add User (screen 02's modal) and Edit User, which is the same three fields.
 *
 * One component rather than two: the fields, the validation and the role
 * checkboxes are identical, and the only difference is which mutation runs and
 * what the buttons say. Two dialogs would be two places for the role list to
 * drift.
 *
 * Validation is `createUserInputSchema` from `@sdp/contracts` — the same schema
 * the handler parses, so a message shown here is the message the server would
 * give. Creating a user does not set a password: the server makes the account
 * INVITED and emails a one-time link to the set-password screen.
 */

interface FormState {
  name: string;
  email: string;
  roles: Role[];
  reason: string;
}

const EMPTY: FormState = { name: '', email: '', roles: [], reason: '' };
const PRIVILEGED_ROLES: readonly Role[] = ['Admin', 'SuperAdmin'];

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
  canManagePrivileged,
  onClose,
}: {
  /** `null` creates; a user edits that user. */
  user: User | null;
  canManagePrivileged: boolean;
  onClose: () => void;
}) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [form, setForm] = useState<FormState>(() =>
    user === null
      ? EMPTY
      : { name: user.name, email: user.email, roles: [...user.roles], reason: '' },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const isPending = createUser.isPending || updateUser.isPending;
  const availableRoles = canManagePrivileged
    ? ROLES
    : ROLES.filter((role) => role === 'Developer' || role === 'Reviewer');
  const privilegedChange =
    user === null
      ? form.roles.some((role) => PRIVILEGED_ROLES.includes(role))
      : PRIVILEGED_ROLES.some((role) => user.roles.includes(role) !== form.roles.includes(role));

  function submit() {
    if (privilegedChange && form.reason.trim() === '') {
      setErrors((current) => ({ ...current, reason: admin.users.privileged.reasonRequired }));
      return;
    }
    const parsed = createUserInputSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'roles' || key === 'reason') {
          next[key] ??= issue.message;
        }
      }
      setErrors(next);
      return;
    }

    const onError = (cause: unknown) => {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    };

    if (user === null) {
      createUser.mutate(parsed.data, {
        onSuccess: (created) => {
          toast.success(
            interpolate(admin.users.created, { name: created.name, email: created.email }),
          );
          onClose();
        },
        onError,
      });
    } else {
      updateUser.mutate(
        { userId: user.id, input: parsed.data },
        {
          onSuccess: (updated) => {
            toast.success(interpolate(admin.users.updated, { name: updated.name }));
            onClose();
          },
          onError,
        },
      );
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
          <Button variant="adminPrimary" onClick={submit} isLoading={isPending}>
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
            inputMode="email"
            autoComplete="off"
            maxLength={MAX_EMAIL_LENGTH + 1}
            value={form.email}
            onChange={(event) => {
              setForm({ ...form, email: event.target.value });
              setErrors((current) => {
                const { email: _email, ...remaining } = current;
                return remaining;
              });
            }}
            onBlur={() => {
              if (form.email.trim() === '') return;
              const message = emailAddressSchema.safeParse(form.email).error?.issues[0]?.message;
              if (message !== undefined) setErrors((current) => ({ ...current, email: message }));
            }}
            placeholder={admin.users.emailPlaceholder}
          />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-900">
            {admin.users.rolesLabel}
          </legend>
          <div className="flex flex-wrap gap-4">
            {availableRoles.map((role) => (
              <Checkbox
                key={role}
                label={common.role[role]}
                checked={form.roles.includes(role)}
                onCheckedChange={(checked) => {
                  setForm({
                    ...form,
                    roles: checked
                      ? [
                          ...form.roles,
                          ...(role === 'SuperAdmin' && !form.roles.includes('Admin')
                            ? (['Admin'] as Role[])
                            : []),
                          role,
                        ]
                      : form.roles.filter(
                          (current) =>
                            current !== role && !(role === 'Admin' && current === 'SuperAdmin'),
                        ),
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

        {privilegedChange ? (
          <Field label={admin.users.privileged.reasonLabel} required error={errors.reason}>
            <Textarea
              value={form.reason}
              onChange={(event) => {
                setForm({ ...form, reason: event.target.value });
                setErrors((current) => {
                  const { reason: _reason, ...remaining } = current;
                  return remaining;
                });
              }}
              rows={3}
              placeholder={admin.users.privileged.reasonPlaceholder}
            />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}
