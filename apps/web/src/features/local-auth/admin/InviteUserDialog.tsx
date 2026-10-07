import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ROLES } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { Field, Input } from '@/components/ui/Field.tsx';
import { Select } from '@/components/ui/Select.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import { invite as copy } from '../content.ts';
import { MAX_EMAIL_LENGTH, normaliseEmail, validateInviteEmail } from './inviteDisplay.ts';
import { useCreateInvite } from './useInviteActions.ts';

/**
 * Add user — the invite form. Replaces the old "create with a password" dialog
 * for NEW users; editing an existing user still uses `UserFormDialog`.
 *
 * Sends `{ email, fullName?, roleId }`. A single role, as the invite contract
 * has one `roleId`; the role's name is used as its id.
 */
export function InviteUserDialog({
  canManagePrivileged,
  usersKey,
  onClose,
}: {
  canManagePrivileged: boolean;
  /** Query key of the user list, refreshed after a save. */
  usersKey: readonly unknown[];
  onClose: () => void;
}) {
  const formId = useId();
  const createInvite = useCreateInvite(usersKey);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [roleError, setRoleError] = useState<string | undefined>();

  const roleOptions = (
    canManagePrivileged
      ? ROLES
      : ROLES.filter((role) => role === 'Developer' || role === 'Reviewer')
  ).map((role) => ({ value: role, label: common.role[role] }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const emailProblem = validateInviteEmail(email);
    const roleProblem = roleId === '' ? copy.roleRequired : undefined;
    setEmailError(emailProblem);
    setRoleError(roleProblem);
    if (emailProblem !== undefined || roleProblem !== undefined) return;

    const address = normaliseEmail(email);
    const name = fullName.trim();
    createInvite.mutate(
      { email: address, roleId, ...(name === '' ? {} : { fullName: name }) },
      {
        onSuccess: ({ invite }) => {
          if (invite.emailStatus === 'FAILED') {
            toast.warning(copy.sentButEmailFailed);
          } else {
            toast.success(interpolate(copy.sent, { email: address }));
          }
          onClose();
        },
        onError: (cause) => {
          const code = cause instanceof ApiError ? cause.code : '';
          const message = copy.errors[code];
          if (code === 'ROLE_INVALID') setRoleError(message);
          else if (message !== undefined && code !== 'FORBIDDEN') setEmailError(message);
          else toast.error(message ?? copy.generic);
        },
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={copy.addTitle}
      description={copy.addSubtitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="adminPrimary"
            isLoading={createInvite.isPending}
            loadingLabel={copy.submitting}
          >
            {copy.submit}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label={copy.email} required error={emailError}>
          <Input
            type="email"
            autoComplete="off"
            maxLength={MAX_EMAIL_LENGTH + 1}
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
            onBlur={() => {
              if (email !== '') setEmailError(validateInviteEmail(email));
            }}
          />
        </Field>

        <Field label={copy.fullName}>
          <Input
            autoComplete="off"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
            }}
          />
        </Field>

        <Field label={copy.role} required error={roleError}>
          <Select
            value={roleId}
            onValueChange={(value) => {
              setRoleId(value);
              setRoleError(undefined);
            }}
            options={roleOptions}
            placeholder={copy.role}
          />
        </Field>
      </form>
    </Dialog>
  );
}
