import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/components/ui';
import { CycleBadge, StatusBadge, VersionTag } from './badges.tsx';
import type { TaskStatus } from '@sdp/contracts';

/**
 * Cell renderers shared by every grid, from Components sheets "08 · Tables" and
 * "10 · Detail, Feedback & Rows".
 *
 * These exist so the same datum looks the same everywhere: a Task ID is mono and
 * muted in all six grids, a status always carries its cycle badge, a title
 * always sits beside its version pill. Column definitions then differ only in
 * which cells they use and in what order.
 */

/** Task ID and CRIM ID: monospace so the digits line up down the column. */
export function MonoId({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('font-mono text-xs font-medium text-ink-500', className)}>{value}</span>
  );
}

/** Task title with its version pill — "AASL - CRIM-848  V0". */
export function TitleCell({
  title,
  version = null,
  className,
}: {
  title: string;
  version?: string | null;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="truncate font-bold text-ink-900">{title}</span>
      <VersionTag version={version} />
    </span>
  );
}

/**
 * Status plus the cycle badge, which the grids always show together.
 * `CycleBadge` renders nothing at cycle 1, so this collapses to a single badge
 * on the common case without the caller needing to know that.
 */
export function StatusCell({
  status,
  cycle,
  className,
}: {
  status: TaskStatus;
  cycle: number;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <StatusBadge status={status} />
      <CycleBadge cycle={cycle} />
    </span>
  );
}

/** Emphasised date, as the grids draw the Created column. */
export function DateCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-sm font-medium text-brand-blue-700', className)}>{children}</span>
  );
}

/** Value with a muted em dash when absent, so empty cells are never blank. */
export function OptionalCell({
  value,
  fallback = '—',
  className,
}: {
  value: ReactNode;
  fallback?: string;
  className?: string;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <span className={cn(isEmpty && 'text-ink-400', className)}>{isEmpty ? fallback : value}</span>
  );
}

/**
 * The trailing action button that opens a row (three dots button matching modern dashboard design).
 */
export function RowArrowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-full border border-line/70 text-ink-400 transition-all hover:border-line hover:bg-canvas hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Label-over-value pair used throughout the Task Details and Review screens.
 *
 * A `<dl>` at the group level with `<dt>`/`<dd>` inside would be more semantic,
 * but these are laid out individually in grids of varying shape across the
 * wireframes; `DetailList` below provides the semantic wrapper where a group
 * genuinely exists.
 */
export function DetailRow({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        {icon ? (
          <span className="shrink-0 text-ink-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
      </dt>
      {/*
        `break-words`: the values here include CRIM ids, branch names and — on
        the review screens — repository URLs, none of which contain a space.
        `min-w-0` above lets the grid TRACK shrink; without a break rule the
        unbroken string still paints straight out of it.
      */}
      <dd className="mt-0.5 text-sm font-medium break-words text-ink-900">{children}</dd>
    </div>
  );
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</dl>;
}
