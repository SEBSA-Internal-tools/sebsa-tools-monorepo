import type { ReactNode } from 'react';
import type { TaskListItem } from '@sdp/contracts';
import { CustomerChip, PriorityPill } from '@/portals/code-review/components/badges.tsx';
import {
  DateCell,
  MonoId,
  OptionalCell,
  RowArrowAction,
  StatusCell,
  TitleCell,
} from '@/portals/code-review/components/cells.tsx';
import { columnHelper, type ColumnList } from '@/components/common/dataTableColumns.ts';
import { formatDate, interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';

/**
 * Column definitions for the task grids.
 *
 * A factory rather than a module constant because each grid differs only in its
 * trailing action and in whether it names the developer or the reviewer — the
 * six grids in the product are the same nine cells in different combinations,
 * and duplicating them is how columns drift apart.
 *
 * Each column is defined as its own `const` and the list assembled afterwards.
 * Inlining them into one conditional array literal collapses TanStack's tuple
 * inference and every `cell` callback silently receives `any`, which typecheck
 * accepts and lint only catches because `no-unsafe-assignment` is on.
 */

const helper = columnHelper<TaskListItem>();
const labels = tasks.list.columns;

const taskCodeColumn = helper.accessor('taskCode', {
  header: labels.taskId,
  cell: (context) => <MonoId value={context.getValue()} />,
});

const titleColumn = helper.accessor('title', {
  header: labels.title,
  cell: (context) => <TitleCell title={context.getValue()} />,
});

const crimIdColumn = helper.accessor('crimId', {
  header: labels.crimId,
  cell: (context) => <MonoId value={context.getValue()} />,
});

const customerColumn = helper.accessor('customerName', {
  header: labels.customer,
  cell: (context) => (
    <CustomerChip
      name={context.getValue()}
      color={context.row.original.customerColor}
      variant="inline"
    />
  ),
});

const developerColumn = helper.accessor('developerName', {
  header: labels.developer,
  cell: (context) => <span className="text-sm">{context.getValue()}</span>,
});

const reviewerColumn = helper.accessor('reviewerName', {
  header: labels.reviewer,
  // "Unassigned" rather than the usual em-dash: in this column an empty value
  // is a state someone acts on, not missing data, and screen 01 names it.
  cell: (context) => <OptionalCell value={context.getValue()} fallback={labels.unassigned} />,
});

const statusColumn = helper.accessor('status', {
  header: labels.status,
  cell: (context) => (
    <StatusCell status={context.getValue()} cycle={context.row.original.reviewCycle} />
  ),
});

const priorityColumn = helper.accessor('priority', {
  header: labels.priority,
  cell: (context) => <PriorityPill priority={context.getValue()} />,
});

const cycleColumn = helper.accessor('reviewCycle', {
  header: labels.cycle,
  cell: (context) => <span className="text-sm tabular-nums">{context.getValue()}</span>,
});

const createdColumn = helper.accessor('createdAt', {
  header: labels.created,
  cell: (context) => <DateCell>{formatDate(context.getValue())}</DateCell>,
});

export interface TaskColumnOptions {
  /** Trailing action cell. Omit for a read-only grid. */
  renderAction?: ((task: TaskListItem) => ReactNode) | undefined;
  /** Show who the task is assigned to — reviewer queues need it, My Tasks does not. */
  showReviewer?: boolean | undefined;
  showDeveloper?: boolean | undefined;
  /**
   * Off for the admin grid (screen 01), which already carries ten columns and
   * draws developer and reviewer instead. Priority is a developer's own triage
   * signal; the admin filters by status and people.
   */
  showPriority?: boolean | undefined;
}

export function buildTaskColumns(options: TaskColumnOptions = {}): ColumnList<TaskListItem> {
  const {
    renderAction,
    showReviewer = false,
    showDeveloper = false,
    showPriority = true,
  } = options;

  const columns: ColumnList<TaskListItem> = [
    taskCodeColumn,
    titleColumn,
    crimIdColumn,
    customerColumn,
  ];

  if (showDeveloper) columns.push(developerColumn);
  if (showReviewer) columns.push(reviewerColumn);

  columns.push(statusColumn);
  if (showPriority) columns.push(priorityColumn);
  columns.push(cycleColumn, createdColumn);

  if (renderAction) {
    columns.push(
      helper.display({
        id: 'actions',
        header: '',
        cell: (context) => renderAction(context.row.original),
      }),
    );
  }

  return columns;
}

/** The trailing view action used by My Tasks and the reviewer queues. */
export function taskArrowAction(
  task: TaskListItem,
  onOpen: () => void,
  text: string = tasks.list.viewTask,
) {
  return (
    <RowArrowAction
      label={interpolate(tasks.list.openTask, { taskCode: task.taskCode })}
      onClick={onOpen}
      text={text}
    />
  );
}

export const taskViewAction = taskArrowAction;
