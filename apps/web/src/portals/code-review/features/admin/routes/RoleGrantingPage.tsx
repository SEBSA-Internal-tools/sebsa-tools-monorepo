import { useMemo, useState } from 'react';
import { KeyRound, Pencil } from 'lucide-react';
import type { User } from '@sdp/contracts';
import { DataTable } from '@/components/common/DataTable.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { RoleBadges } from '@/portals/code-review/components/badges.tsx';
import { useUsers } from '@/portals/code-review/hooks/useUsers.ts';
import { interpolate } from '@/lib/formatters.ts';
import admin from '@/content/admin.json';
import { RoleGrantingDialog } from '../components/RoleGrantingDialog.tsx';

const helper = columnHelper<User>();
const nameColumn = helper.accessor('name', {
  header: admin.roleGranting.columns.name,
  cell: (context) => <span className="text-sm font-bold text-ink-900">{context.getValue()}</span>,
});
const emailColumn = helper.accessor('email', {
  header: admin.roleGranting.columns.email,
  cell: (context) => <span className="text-sm text-brand-blue-600">{context.getValue()}</span>,
});
const rolesColumn = helper.accessor('roles', {
  header: admin.roleGranting.columns.roles,
  cell: (context) => <RoleBadges roles={context.getValue()} />,
});

export function RoleGrantingPage() {
  const { data: users, isPending, isFetching, error, refetch } = useUsers();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return users ?? [];
    return (users ?? []).filter(
      (user) =>
        user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle),
    );
  }, [search, users]);

  const columns = useMemo<ColumnList<User>>(
    () => [
      nameColumn,
      emailColumn,
      rolesColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const user = context.row.original;
          return (
            <div className="flex justify-end">
              <IconButton
                label={interpolate(admin.roleGranting.edit, { name: user.name })}
                icon={<Pencil className="size-4" />}
                size="sm"
                onClick={() => setEditing(user)}
              />
            </div>
          );
        },
      }),
    ],
    [],
  );

  return (
    <section aria-labelledby="role-granting-heading">
      <h2 id="role-granting-heading" className="sr-only">
        {admin.roleGranting.title}
      </h2>
      <DataTable
        data={visible}
        columns={columns}
        getRowId={(user) => user.id}
        totalCount={users?.length ?? 0}
        countNoun={admin.roleGranting.noun}
        caption={admin.roleGranting.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => void refetch()}
        pageSize={15}
        toolbar={
          <div className="min-w-56 flex-1">
            <SearchField
              value={search}
              onValueChange={setSearch}
              label={admin.roleGranting.searchLabel}
              placeholder={admin.roleGranting.searchPlaceholder}
            />
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <KeyRound />
              </EmptyIllustration>
            }
            title={admin.roleGranting.emptyTitle}
            hint={admin.roleGranting.emptyHint}
          />
        }
      />
      {editing === null ? null : (
        <RoleGrantingDialog key={editing.id} user={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
