import { useCallback, useMemo, useState } from 'react';
import { Building2, Pencil, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer } from '@sdp/contracts';
import { ActiveBadge, CustomerChip } from '@/portals/code-review/components/badges.tsx';
import { ConfirmDialog } from '@/components/common/ConfirmDialog.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { MonoId, OptionalCell } from '@/portals/code-review/components/cells.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { IconButton, SearchField } from '@/components/ui/controls.tsx';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCustomers } from '@/portals/code-review/hooks/useReferenceData.ts';
import admin from '@/content/admin.json';
import common from '@/content/common.json';
import { useDeleteCustomer, useUpdateCustomer } from '../api/queries.ts';
import { CustomerFormDialog } from '../components/CustomerFormDialog.tsx';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';

/**
 * Admin — Customers (screen 03).
 *
 * The same three row actions as Users, and the same asymmetry: deactivating is
 * routine, deleting is refused by the handler once the customer has tasks — the
 * `code` is baked into every Task ID it ever issued, so those rows would lose
 * their customer entirely.
 */

const helper = columnHelper<Customer>();
const labels = admin.customers.columns;

/* Each column its own `const` — see the note in `taskColumns.tsx`. */

const nameColumn = helper.accessor('name', {
  header: labels.name,
  cell: (context) => (
    <CustomerChip name={context.getValue()} color={context.row.original.color} variant="inline" />
  ),
});

const codeColumn = helper.accessor('code', {
  header: labels.code,
  cell: (context) => <MonoId value={context.getValue()} />,
});

const descriptionColumn = helper.accessor('description', {
  header: labels.description,
  cell: (context) => <OptionalCell value={context.getValue()} />,
});

const statusColumn = helper.accessor('isActive', {
  header: labels.status,
  cell: (context) => <ActiveBadge isActive={context.getValue()} />,
});

export function AdminCustomersPage() {
  const { data: customers, isPending, isFetching, error, refetch } = useCustomers();
  const { mutate: mutateCustomer, isPending: isUpdating } = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isFormOpen, setFormOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return customers ?? [];

    return (customers ?? []).filter(
      (customer) =>
        customer.name.toLowerCase().includes(needle) ||
        customer.code.toLowerCase().includes(needle) ||
        customer.description.toLowerCase().includes(needle),
    );
  }, [customers, search]);

  const setActive = useCallback(
    (customer: Customer, isActive: boolean) => {
      mutateCustomer(
        { customerId: customer.id, input: { isActive } },
        {
          onSuccess: () => {
            toast.success(
              interpolate(
                isActive ? admin.customers.activate.success : admin.customers.deactivate.success,
                { name: customer.name },
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
    [mutateCustomer],
  );

  const columns = useMemo<ColumnList<Customer>>(
    () => [
      nameColumn,
      codeColumn,
      descriptionColumn,
      statusColumn,
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => {
          const customer = context.row.original;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <IconButton
                label={interpolate(admin.customers.actions.edit, {
                  name: customer.name,
                })}
                icon={<Pencil className="size-4" />}
                size="sm"
                onClick={() => {
                  setEditing(customer);
                  setFormOpen(true);
                }}
              />
              <IconButton
                label={interpolate(
                  customer.isActive
                    ? admin.customers.actions.deactivate
                    : admin.customers.actions.activate,
                  { name: customer.name },
                )}
                icon={<Power className="size-4" />}
                tone={customer.isActive ? 'danger' : 'success'}
                size="sm"
                onClick={() => {
                  if (customer.isActive) setDeactivating(customer);
                  else setActive(customer, true);
                }}
              />
              <IconButton
                label={interpolate(admin.customers.actions.delete, {
                  name: customer.name,
                })}
                icon={<Trash2 className="size-4" />}
                tone="danger"
                size="sm"
                onClick={() => {
                  setDeleting(customer);
                }}
              />
            </div>
          );
        },
      }),
    ],
    [setActive],
  );

  return (
    <section aria-labelledby="admin-customers-heading">
      <h2 id="admin-customers-heading" className="sr-only">
        {admin.customers.title}
      </h2>

      <DataTable
        data={visible}
        columns={columns}
        getRowId={(customer) => customer.id}
        getRowAccent={(customer) => customer.color}
        totalCount={customers?.length ?? 0}
        countNoun={admin.customers.noun}
        caption={admin.customers.caption}
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
                label={admin.customers.searchLabel}
                placeholder={admin.customers.searchPlaceholder}
              />
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Building2 className="size-4" aria-hidden="true" />
              {admin.customers.add}
            </Button>
          </div>
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <Building2 />
              </EmptyIllustration>
            }
            title={admin.customers.emptyTitle}
            hint={admin.customers.emptyHint}
          />
        }
      />

      {isFormOpen ? (
        <CustomerFormDialog
          key={editing?.id ?? 'new'}
          customer={editing}
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
        title={admin.customers.deactivate.title}
        description={interpolate(admin.customers.deactivate.description, {
          name: deactivating?.name ?? '',
        })}
        confirmLabel={admin.customers.deactivate.confirm}
        isPending={isUpdating}
        onConfirm={() => {
          if (deactivating !== null) setActive(deactivating, false);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={admin.customers.delete.title}
        description={interpolate(admin.customers.delete.description, {
          name: deleting?.name ?? '',
        })}
        confirmLabel={admin.customers.delete.confirm}
        isPending={deleteCustomer.isPending}
        onConfirm={() => {
          if (deleting === null) return;
          const customer = deleting;

          deleteCustomer.mutate(customer.id, {
            onSuccess: () => {
              toast.success(
                interpolate(admin.customers.delete.success, {
                  name: customer.name,
                }),
              );
              setDeleting(null);
            },
            onError: (cause) => {
              toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
      />
    </section>
  );
}
