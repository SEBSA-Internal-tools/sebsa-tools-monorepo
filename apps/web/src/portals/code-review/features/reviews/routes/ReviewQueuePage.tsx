import { useMemo, useState } from 'react';
import { Eye, History, Inbox, ListChecks, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaskListItem } from '@sdp/contracts';
import { Button } from '@/components/ui/Button.tsx';
import { DataTable } from '@/components/common/DataTable.tsx';
import { EmptyState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { WORKSPACE_THEME } from '@/config/workspaceTheme.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import { useActiveBucket } from '@/portals/code-review/hooks/useKpiBucket.ts';
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
import { usePickTask } from '../api/queries.ts';
import { EmptyIllustration } from '@/components/common/EmptyIllustration.tsx';

/**
 * The three reviewer queues (screens 07, 08/10, 09/11).
 *
 * One component, three scopes. They differ only in which server scope they read
 * and which action each row offers — building three near-identical files would
 * mean three places to fix the next column change.
 */

type QueueVariant = 'available' | 'assigned' | 'history';

const COPY = {
  available: reviews.available,
  assigned: { ...reviews.available, ...reviews.assigned },
  history: { ...reviews.available, ...reviews.history },
} as const;

export function ReviewQueuePage({ variant }: { variant: QueueVariant }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const { data, isPending, isFetching, error, refetch } = useTasks(variant);
  const pick = usePickTask();

  // Set by the Changes Requested / Approved counters in `ReviewerLayout`, which
  // navigate here because both slice the same Review History queue.
  const bucket = useActiveBucket();
  const effective = useMemo<TaskFilters>(
    () => ({ ...filters, bucket: bucket ?? ALL }),
    [filters, bucket],
  );

  const visible = useMemo(() => filterTasks(data ?? [], effective), [data, effective]);
  const copy = COPY[variant];

  function handlePick(task: TaskListItem) {
    pick.mutate(task.id, {
      onSuccess: (picked) => {
        toast.success(interpolate(reviews.available.picked, { taskCode: picked.taskCode }));
        void navigate(ROUTES.reviewer.task(picked.id));
      },
      onError: (cause) => {
        /*
         * FL 3.3-02. A 409 means another reviewer won the race — a normal
         * outcome, not a failure — and the server's message names who took it.
         * That is the same treatment every other `ApiError` gets here, so the
         * 409 needs no branch of its own: this used to be a nested ternary whose
         * two arms were byte-identical.
         */
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  const columns = useMemo(() => {
    if (variant === 'available') {
      return buildTaskColumns({
        showDeveloper: true,
        renderAction: (task) => (
          <Button
            /*
             * One of the two row actions in the product that carry a role
             * colour — View on the Review History grid is the other.
             *
             * Pick is the reviewer's own act — claiming a task into their queue —
             * so it wears the reviewer gradient rather than the generic primary
             * violet. The gradient comes from `WORKSPACE_THEME`, never as an
             * inline value; that is the rule that stopped role colours drifting
             * between the Home cards and the workspace headers.
             *
             * Still not applied to the admin grids: Cancel and Delete have to
             * stay red.
             */
            variant="workspace"
            className={WORKSPACE_THEME.reviewer.gradient}
            size="sm"
            onClick={() => {
              handlePick(task);
            }}
            isLoading={pick.isPending && pick.variables === task.id}
            disabled={pick.isPending}
            aria-label={interpolate(reviews.available.pickAria, {
              taskCode: task.taskCode,
            })}
          >
            <UserPlus className="size-3.5" aria-hidden="true" />
            {reviews.available.pick}
          </Button>
        ),
      });
    }

    if (variant === 'history') {
      return buildTaskColumns({
        showDeveloper: true,
        renderAction: (task) => (
          <Button
            /*
             * The reviewer gradient, matching Pick on the Available queue.
             *
             * Asked for by the business so the two reviewer grids read as one
             * surface: Pick claims a task, View reopens one this reviewer has
             * already decided, and both are the reviewer acting on their own
             * work. The class comes from `WORKSPACE_THEME`, never as an inline
             * value — that is what keeps the role colour from drifting between
             * here, the Home cards and the workspace headers.
             *
             * It widens the rule in standards §12, which is updated to match.
             * Still NOT for the admin grids: Cancel and Delete have to stay red,
             * and a role gradient on a destructive action would be worse than
             * merely inconsistent.
             */
            variant="workspace"
            className={WORKSPACE_THEME.reviewer.gradient}
            size="sm"
            onClick={() => {
              void navigate(ROUTES.reviewer.task(task.id));
            }}
            aria-label={interpolate(reviews.history.viewAria, {
              taskCode: task.taskCode,
            })}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {reviews.history.view}
          </Button>
        ),
      });
    }

    return buildTaskColumns({
      showDeveloper: true,
      renderAction: (task) =>
        taskArrowAction(task, () => {
          void navigate(ROUTES.reviewer.task(task.id));
        }),
    });
    // `handlePick` closes over the mutation, which changes identity while a pick
    // is in flight — that is exactly when the button must re-render to show its
    // spinner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, navigate, pick.isPending, pick.variables]);

  return (
    <section>
      <DataTable
        // Wireframes 07/08/09 all title the card and put the count opposite it;
        // this replaces the sr-only heading the section used to carry.
        heading={{
          icon:
            variant === 'available' ? (
              <Inbox className="size-5 shrink-0 text-workspace-reviewer" />
            ) : variant === 'history' ? (
              <History className="size-5 shrink-0 text-workspace-reviewer" />
            ) : (
              <ListChecks className="size-5 shrink-0 text-workspace-reviewer" />
            ),
          title: copy.title,
        }}
        data={visible}
        columns={columns}
        getRowId={(task) => task.id}
        onRowClick={
          variant === 'available'
            ? undefined
            : (task) => {
                void navigate(ROUTES.reviewer.task(task.id));
              }
        }
        totalCount={data?.length ?? 0}
        countNoun={reviews.available.noun}
        caption={copy.caption}
        isLoading={isPending}
        isFetching={isFetching}
        error={error}
        onRetry={() => {
          void refetch();
        }}
        pageSize={15}
        toolbar={
          /*
            The cycle filter is offered on History only.

            The comment here used to claim "every row in a given queue shares its
            status" while actually hiding the CYCLE control, and neither half was
            right: Available carries both Submitted and ReSubmitted, and History
            spans every decided status. Cycle is genuinely useless on the two
            live queues — a task waiting to be picked is almost always on the
            cycle it was submitted at — but History is exactly where "show me the
            ones that went round three times" is worth asking, and the seed
            reaches cycle 6.
          */
          <TaskFilterBar
            filters={filters}
            onChange={setFilters}
            showCycle={variant === 'history'}
          />
        }
        emptyState={
          <EmptyState
            icon={
              <EmptyIllustration>
                {variant === 'available' ? <Inbox /> : <ListChecks />}
              </EmptyIllustration>
            }
            title={copy.emptyTitle}
            hint={copy.emptyHint}
          />
        }
      />
    </section>
  );
}

/** Convenience wrappers so the route table reads as three screens, not one. */
export function AvailableTasksPage() {
  return <ReviewQueuePage variant="available" />;
}

export function MyReviewTasksPage() {
  return <ReviewQueuePage variant="assigned" />;
}

export function ReviewHistoryPage() {
  return <ReviewQueuePage variant="history" />;
}
