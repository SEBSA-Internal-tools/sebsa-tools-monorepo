import { useCallback, useMemo, useState } from 'react';
import { FilePlus2, ListChecks } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { TaskStatus } from '@sdp/contracts';
import { DataTable } from '@/components/common/DataTable.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { ROUTES } from '@/config/routes.ts';
import tasks from '@/content/tasks.json';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { BUCKET_PARAM, BUCKET_TO_STATUS, STATUS_TO_BUCKET } from '@/lib/kpiBuckets.ts';
import { useTasks } from '../api/queries.ts';
import {
  buildTaskColumns,
  taskArrowAction,
} from '@/portals/code-review/components/taskColumns.tsx';
import { TaskFilterBar } from '@/portals/code-review/components/TaskFilterBar.tsx';
import {
  ALL,
  EMPTY_TASK_FILTERS,
  filterTasks,
  type TaskFilters,
} from '@/portals/code-review/components/taskFilters.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';

/**
 * My Tasks (screen 16).
 *
 * Filtering happens here rather than through `DataTable`'s own global filter:
 * the wireframe's search spans four fields and the status/priority/cycle selects
 * are domain filters, not column filters. Passing the already-filtered array in
 * keeps one implementation of "which tasks match" — the same one the count line
 * describes.
 *
 * The counter cards above this grid live in `DeveloperLayout`, a different
 * component on a different route, so their selection arrives through the URL
 * rather than through props. See `lib/kpiBuckets.ts`.
 */
export function MyTasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const { data, isPending, isFetching, error, refetch } = useTasks('mine');

  const bucket = useActiveBucket();

  // If a status is explicitly in the URL, or if a bucket is active, sync status
  const currentStatus = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) return statusParam;
    if (bucket) {
      return BUCKET_TO_STATUS[bucket] ?? ALL;
    }
    return filters.status;
  }, [searchParams, bucket, filters.status]);

  const effective = useMemo<TaskFilters>(
    () => ({
      ...filters,
      status: currentStatus,
      bucket: bucket ?? ALL,
    }),
    [filters, currentStatus, bucket],
  );

  const visible = useMemo(() => filterTasks(data ?? [], effective), [data, effective]);

  const handleFiltersChange = useCallback(
    (next: TaskFilters) => {
      setFilters(next);
      const nextParams = new URLSearchParams(searchParams);

      if (next.status !== ALL) {
        nextParams.set('status', next.status);
        const mappedBucket = STATUS_TO_BUCKET[next.status as TaskStatus];
        if (mappedBucket) {
          nextParams.set(BUCKET_PARAM, mappedBucket);
        } else {
          nextParams.delete(BUCKET_PARAM);
        }
      } else {
        nextParams.delete('status');
        nextParams.delete(BUCKET_PARAM);
      }

      // If user resets all filters
      if (
        next.search === '' &&
        next.status === ALL &&
        next.priority === ALL &&
        next.cycle === ALL
      ) {
        nextParams.delete(BUCKET_PARAM);
        nextParams.delete('status');
      }

      const qs = nextParams.toString();
      void navigate(qs ? `${location.pathname}?${qs}` : location.pathname, {
        replace: true,
      });
    },
    [navigate, location.pathname, searchParams],
  );

  const columns = useMemo(
    () =>
      buildTaskColumns({
        renderAction: (task) =>
          taskArrowAction(task, () => {
            void navigate(ROUTES.developer.task(task.id));
          }),
      }),
    [navigate],
  );

  return (
    <section>
      <DataTable
        heading={{
          icon: <ListChecks className="size-5 shrink-0 text-workspace-developer" />,
          title: tasks.list.title,
        }}
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        onRowClick={(task) => {
          void navigate(ROUTES.developer.task(task.id));
        }}
        totalCount={data?.length ?? 0}
        countNoun={tasks.list.noun}
        caption={tasks.list.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={15}
        toolbar={<TaskFilterBar filters={effective} onChange={handleFiltersChange} />}
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                <ListChecks />
              </EmptyIllustration>
            }
            title={tasks.list.emptyTitle}
            hint={tasks.list.emptyHint}
            action={
              <Link to={ROUTES.developer.newTask} className={buttonVariants()}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                {tasks.workspace.newTask}
              </Link>
            }
          />
        }
      />
    </section>
  );
}
