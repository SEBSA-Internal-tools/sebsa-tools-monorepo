import { useState } from 'react';
import { toast } from 'sonner';
import type { Role, User } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { Checkbox } from '@/components/ui/controls.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useReplaceUserRoles } from '@/portals/code-review/hooks/useUsers.ts';

const GRANTABLE_ROLES: readonly Role[] = ['Developer', 'Reviewer', 'Admin'];

export function RoleGrantingDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const replaceRoles = useReplaceUserRoles();
  const [roles, setRoles] = useState<Role[]>(() => [...user.roles]);
  const [error, setError] = useState<string>();

  async function submit() {
    if (roles.length === 0) {
      setError(admin.roleGranting.required);
      return;
    }

    try {
      await replaceRoles.mutateAsync({ userId: user.id, roles });
      toast.success(interpolate(admin.roleGranting.updated, { name: user.name }));
      onClose();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={admin.roleGranting.dialogTitle}
      description={interpolate(admin.roleGranting.dialogDescription, { name: user.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {common.actions.cancel}
          </Button>
          <Button onClick={() => void submit()} isLoading={replaceRoles.isPending}>
            {replaceRoles.isPending ? admin.roleGranting.saving : admin.roleGranting.save}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-ink-900">
          {admin.roleGranting.rolesLabel}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {GRANTABLE_ROLES.map((role) => (
            <Checkbox
              key={role}
              label={common.role[role]}
              checked={roles.includes(role)}
              onCheckedChange={(checked) => {
                setError(undefined);
                setRoles(
                  checked ? [...roles, role] : roles.filter((assigned) => assigned !== role),
                );
              }}
            />
          ))}
        </div>
        {error === undefined ? null : (
          <p role="alert" className="mt-3 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </fieldset>
    </Dialog>
  );
}
