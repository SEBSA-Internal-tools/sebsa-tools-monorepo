import { useCallback, useMemo, useState } from 'react';
import {
  Filter,
  Lock,
  Pencil,
  Power,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { type Role, type User } from '@sdp/contracts';
import { ActiveBadge, RoleBadges } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { EmptyState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { Select, type SelectOption } from '@/components/ui/Select.tsx';
import { Tooltip } from '@/components/ui/Tooltip.tsx';
import { FilterResetButton } from '@/portals/code-review/components/TaskFilterBar.tsx';
import { ALL } from '@/portals/code-review/components/taskFilters.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useDeleteUser, useTransferSuperAdmin, useUpdateUser, useUsers } from '../api/queries.ts';
import { UserFormDialog } from '../components/UserFormDialog.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { RoleMultiSelect } from '../components/RoleMultiSelect.tsx';

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
  cell: (context) => (
    <span className="text-sm font-semibold text-ink-900">{context.getValue()}</span>
  ),
});

const emailColumn = helper.accessor('email', {
  header: labels.email,
  cell: (context) => <span className="text-ink-600 text-sm font-normal">{context.getValue()}</span>,
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
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
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
      if (selectedRoles.length > 0 && !selectedRoles.every((role) => user.roles.includes(role))) {
        return false;
      }
      if (status === 'active' && !user.isActive) return false;
      if (status === 'inactive' && user.isActive) return false;
      if (needle === '') return true;
      return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle);
    });
  }, [users, search, selectedRoles, status]);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setSelectedRoles([]);
    setStatus(ALL);
  }, []);

  const isFiltered = search.trim() !== '' || selectedRoles.length > 0 || status !== ALL;
  const resetPageTrigger = `${search}:${selectedRoles.slice().sort().join(',')}:${status}`;

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
          const mayManage = canManage(user);
          return (
            <div className="flex items-center justify-end gap-1.5">
              {!mayManage ? (
                <Tooltip content="This account can only be managed by a Super Admin.">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-ink-500 select-none"
                    aria-label="Protected: this account can only be managed by a Super Admin"
                  >
                    <Lock className="size-3 text-ink-400" aria-hidden="true" />
                    <span>Protected</span>
                  </button>
                </Tooltip>
              ) : null}
              {mayManage ? (
                <IconButton
                  label={interpolate(admin.users.actions.edit, { name: user.name })}
                  icon={<Pencil className="size-4" />}
                  size="sm"
                  onClick={() => {
                    setEditing(user);
                    setFormOpen(true);
                  }}
                />
              ) : null}
              {mayManage ? (
                <IconButton
                  label={interpolate(
                    user.isActive ? admin.users.actions.deactivate : admin.users.actions.activate,
                    { name: user.name },
                  )}
                  icon={<Power className="size-4" />}
                  tone={user.isActive ? 'danger' : 'success'}
                  size="sm"
                  onClick={() => {
                    if (user.isActive) setDeactivating(user);
                    else setActive(user, true);
                  }}
                />
              ) : null}
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
              {isSuperAdmin && mayManage ? (
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
        alwaysShowPagination
        resetPageIndexTrigger={resetPageTrigger}
        toolbar={
          <div className="flex w-full flex-col gap-3.5">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <SearchField
                  value={search}
                  onValueChange={setSearch}
                  label={admin.users.searchLabel}
                  placeholder={admin.users.searchPlaceholder}
                />
              </div>
              <Button
                variant="adminPrimary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="w-full shrink-0 sm:w-auto"
              >
                <UserPlus className="size-4" aria-hidden="true" />
                {admin.users.add}
              </Button>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,24rem)_minmax(13rem,16rem)_auto]">
              <div className="min-w-0">
                <RoleMultiSelect
                  selectedRoles={selectedRoles}
                  onSelectedRolesChange={setSelectedRoles}
                />
              </div>
              <div className="min-w-0">
                <Select
                  value={status}
                  onValueChange={setStatus}
                  options={STATUS_OPTIONS}
                  label="Status"
                  icon={<Filter className="size-4" />}
                  variant="stacked"
                  aria-label={admin.users.statusAll}
                />
              </div>
              <FilterResetButton
                isFiltered={isFiltered}
                onReset={handleClearFilters}
                className="w-full lg:w-auto"
              />
            </div>

            <div className="flex min-h-5 items-center gap-1.5 text-xs font-medium text-ink-500 select-none">
              <span>
                Showing {visible.length} of {users?.length ?? 0} users
              </span>
              {isFiltered ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-violet-700">Filtered</span>
                </>
              ) : null}
            </div>
          </div>
        }
        filteredEmptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <UsersIcon />
              </EmptyIllustration>
            }
            title={admin.users.emptyFilteredTitle}
            hint={admin.users.emptyFilteredHint}
            action={
              <Button variant="secondary" onClick={handleClearFilters}>
                {admin.users.clearFilters}
              </Button>
            }
          />
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
