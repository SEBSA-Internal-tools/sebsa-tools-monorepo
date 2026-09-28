import { useCallback, useMemo, useState } from 'react';
import { Pencil, Power, ShieldCheck, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ROLES, type Role, type User } from '@sdp/contracts';
import { ActiveBadge, RoleBadges } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useDeleteUser, useTransferSuperAdmin, useUpdateUser, useUsers } from '../api/queries.ts';
import { UserFormDialog } from '../components/UserFormDialog.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';

/**
 * Admin — Users (screen 02).
 *
 * Three row actions, matching the wireframe: edit, activate/deactivate, delete.
 * Deactivate is the everyday one and delete is the exception — the handler
 * refuses to delete anyone who appears on a task, because their name is on rows
 * the audit trail and Reports still count.
 */

const helper = columnHelper<User>();
const labels = admin.users.columns;

const ROLE_OPTIONS: SelectOption[] = [
  { value: ALL, label: admin.users.roleAll },
  ...ROLES.map((role) => ({ value: role, label: common.role[role] })),
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: ALL, label: admin.users.statusAll },
  { value: 'active', label: admin.users.statusActive },
  { value: 'inactive', label: admin.users.statusInactive },
];

/*
 * Each column is its own `const`, as in `taskColumns.tsx`.
 *
 * Assembling them inline in one array literal collapses TanStack's tuple
 * inference and every `cell` callback silently receives `any` — which typecheck
 * accepts and only `no-unsafe-assignment` catches.
 */

const nameColumn = helper.accessor('name', {
  header: labels.name,
  cell: (context) => <span className="text-sm font-bold text-ink-900">{context.getValue()}</span>,
});

const emailColumn = helper.accessor('email', {
  header: labels.email,
  cell: (context) => <span className="text-sm text-brand-blue-600">{context.getValue()}</span>,
});

const rolesColumn = helper.accessor('roles', {
  header: labels.roles,
  cell: (context) => <RoleBadges roles={context.getValue()} />,
});

const statusColumn = helper.accessor('isActive', {
  header: labels.status,
  cell: (context) => <ActiveBadge isActive={context.getValue()} />,
});

export function AdminUsersPage({
  availableRoles,
  editRoles = true,
}: {
  availableRoles?: readonly Role[];
  editRoles?: boolean;
} = {}) {
  const { data: users, isPending, isFetching, error, refetch } = useUsers();
  const { data: actor } = useCurrentUser();
  // Destructured because `mutate` is referentially stable while the mutation
  // object is not — which is what lets the column definitions memoise honestly
  // instead of being pinned with a lint suppression.
  const { mutate: mutateUser, isPending: isUpdating } = useUpdateUser();
  const deleteUser = useDeleteUser();
  const transferSuperAdmin = useTransferSuperAdmin();
  const isSuperAdmin = actor?.roles.includes('Super Admin') === true;
  const assignableRoles: readonly Role[] =
    availableRoles ??
    (isSuperAdmin ? ['Developer', 'Reviewer', 'Admin'] : ['Developer', 'Reviewer']);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const [editing, setEditing] = useState<User | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [transferring, setTransferring] = useState<User | null>(null);

  const canManage = useCallback(
    (user: User) =>
      isSuperAdmin ||
      !user.roles.some((assigned) => assigned === 'Admin' || assigned === 'Super Admin'),
    [isSuperAdmin],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (users ?? []).filter((user) => {
      if (role !== ALL && !user.roles.includes(role as (typeof ROLES)[number])) return false;
      if (status === 'active' && !user.isActive) return false;
      if (status === 'inactive' && user.isActive) return false;
      if (needle === '') return true;
      return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle);
    });
  }, [users, search, role, status]);

  const setActive = useCallback(
    (user: User, isActive: boolean) => {
      mutateUser(
        { userId: user.id, input: { isActive } },
        {
          onSuccess: () => {
            toast.success(
              interpolate(
                isActive ? admin.users.activate.success : admin.users.deactivate.success,
                { name: user.name },
              ),
            );
            setDeactivating(null);
          },
          onError: (cause) => {
            toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
          },
        },
      );
    },
    [mutateUser],
  );

  const columns = useMemo<ColumnList<User>>(
    () => [
      nameColumn,
      emailColumn,
      rolesColumn,
      statusColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const user = context.row.original;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <IconButton
                label={interpolate(admin.users.actions.edit, {
                  name: user.name,
                })}
                icon={<Pencil className="size-4" />}
                size="sm"
                disabled={!canManage(user)}
                onClick={() => {
                  setEditing(user);
                  setFormOpen(true);
                }}
              />
              <IconButton
                label={interpolate(
                  user.isActive ? admin.users.actions.deactivate : admin.users.actions.activate,
                  { name: user.name },
                )}
                icon={<Power className="size-4" />}
                tone={user.isActive ? 'danger' : 'success'}
                size="sm"
                disabled={!canManage(user)}
                onClick={() => {
                  // Activating is harmless and immediate; deactivating locks
                  // someone out, so only that direction asks.
                  if (user.isActive) setDeactivating(user);
                  else setActive(user, true);
                }}
              />
              {isSuperAdmin &&
              user.isActive &&
              user.id !== actor?.id &&
              user.roles.includes('Admin') &&
              !user.roles.includes('Super Admin') ? (
                <IconButton
                  label={interpolate(admin.users.actions.transferSuperAdmin, {
                    name: user.name,
                  })}
                  icon={<ShieldCheck className="size-4" />}
                  size="sm"
                  onClick={() => {
                    setTransferring(user);
                  }}
                />
              ) : null}
              {isSuperAdmin ? (
                <IconButton
                  label={interpolate(admin.users.actions.delete, {
                    name: user.name,
                  })}
                  icon={<Trash2 className="size-4" />}
                  tone="danger"
                  size="sm"
                  disabled={!canManage(user)}
                  onClick={() => {
                    setDeleting(user);
                  }}
                />
              ) : null}
            </div>
          );
        },
      }),
    ],
    [actor?.id, canManage, isSuperAdmin, setActive],
  );

  return (
    <section aria-labelledby="admin-users-heading">
      <h2 id="admin-users-heading" className="sr-only">
        {admin.users.title}
      </h2>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(user) => user.id}
        totalCount={users?.length ?? 0}
        countNoun={admin.users.noun}
        caption={admin.users.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={15}
        toolbar={
          <div className="flex w-full flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <SearchField
                value={search}
                onValueChange={setSearch}
                label={admin.users.searchLabel}
                placeholder={admin.users.searchPlaceholder}
              />
            </div>
            <div className="w-44">
              <Select
                value={role}
                onValueChange={setRole}
                options={ROLE_OPTIONS}
                aria-label={admin.users.roleAll}
              />
            </div>
            <div className="w-44">
              <Select
                value={status}
                onValueChange={setStatus}
                options={STATUS_OPTIONS}
                aria-label={admin.users.statusAll}
              />
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {admin.users.add}
            </Button>
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <UsersIcon />
              </EmptyIllustration>
            }
            title={admin.users.emptyTitle}
            hint={admin.users.emptyHint}
          />
        }
      />

      {isFormOpen ? (
        <UserFormDialog
          key={editing?.id ?? 'new'}
          user={editing}
          availableRoles={assignableRoles}
          editRoles={editRoles && editing?.roles.includes('Super Admin') !== true}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={admin.users.deactivate.title}
        description={interpolate(admin.users.deactivate.description, {
          name: deactivating?.name ?? '',
        })}
        confirmLabel={admin.users.deactivate.confirm}
        isPending={isUpdating}
        onConfirm={() => {
          if (deactivating !== null) setActive(deactivating, false);
        }}
      />

      {isSuperAdmin ? (
        <>
          <ConfirmDialog
            open={transferring !== null}
            onOpenChange={(open) => {
              if (!open) setTransferring(null);
            }}
            title={admin.users.transferSuperAdmin.title}
            description={interpolate(admin.users.transferSuperAdmin.description, {
              name: transferring?.name ?? '',
            })}
            confirmLabel={admin.users.transferSuperAdmin.confirm}
            isPending={transferSuperAdmin.isPending}
            onConfirm={() => {
              if (transferring === null) return;
              const user = transferring;
              transferSuperAdmin.mutate(user.id, {
                onSuccess: () => {
                  toast.success(
                    interpolate(admin.users.transferSuperAdmin.success, { name: user.name }),
                  );
                  setTransferring(null);
                },
                onError: (cause) => {
                  toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
                },
              });
            }}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => {
              if (!open) setDeleting(null);
            }}
            title={admin.users.delete.title}
            description={interpolate(admin.users.delete.description, {
              name: deleting?.name ?? '',
            })}
            confirmLabel={admin.users.delete.confirm}
            isPending={deleteUser.isPending}
            onConfirm={() => {
              if (deleting === null) return;
              const user = deleting;

              deleteUser.mutate(user.id, {
                onSuccess: () => {
                  toast.success(interpolate(admin.users.delete.success, { name: user.name }));
                  setDeleting(null);
                },
                onError: (cause) => {
                  toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
                },
              });
            }}
          />
        </>
      ) : null}
    </section>
  );
}
