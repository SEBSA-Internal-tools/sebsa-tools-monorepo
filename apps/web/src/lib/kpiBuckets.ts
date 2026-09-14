import type { TaskStatus } from '@sdp/contracts';

/**
 * What each dashboard counter counts.
 *
 * These are NOT new rules. Every entry is lifted verbatim from the
 * `countByStatus(...)` expressions the three workspace layouts already used to
 * render their numbers — the point is that a counter card and the grid it
 * filters now read the same definition, so a card saying 7 can never open a grid
 * of 5.
 *
 * The two "submitted" buckets look redundant and are not:
 *
 * - `awaitingReview` is the DEVELOPER's "Submitted Tasks" card. To a developer,
 *   submitted means "handed over and no longer mine to edit", which is all three
 *   of the statuses a reviewer owns. Counting only `Submitted` would drop the
 *   number to 0 the moment a reviewer picked the task up.
 * - `submitted` is the ADMIN's card, which tracks the literal `Submitted` status
 *   because the admin row also has separate In Review and Changes Requested
 *   cards beside it.
 *
 * `approved` folds in `Delivered` on every dashboard: delivery is what happens
 * *after* approval (spec p.12), so an approved task that has shipped has not
 * stopped being approved.
 *
 * In `lib/` rather than beside `filterTasks` in `components/taskFilters.ts`
 * because `hooks/useKpiBucket.ts` needs it too, and the boundary graph forbids
 * `hooks → components`. Framework-free, so it stays testable as a pure value.
 */
export const KPI_BUCKETS = {
  draft: ['Draft'],
  submitted: ['Submitted'],
  awaitingReview: ['Submitted', 'ReSubmitted', 'InReview'],
  inReview: ['InReview'],
  changesRequested: ['ChangesRequested'],
  approved: ['Approved', 'Delivered'],
} as const satisfies Record<string, readonly TaskStatus[]>;

export type KpiBucket = keyof typeof KPI_BUCKETS;

/** The query-string key the dashboard cards write and the grids read. */
export const BUCKET_PARAM = 'bucket';

/**
 * The bucket state lives in the URL, not in a store.
 *
 * The cards are rendered by the workspace LAYOUT and the grid they filter is
 * rendered by a child ROUTE, so there is no component that owns both. The three
 * candidates were lifting state into the layout and passing it through
 * `Outlet context` (invisible coupling, and the reviewer cards navigate between
 * tabs so the state would have to survive a route change anyway), a Zustand
 * store (client state that is really navigation state), or the URL.
 *
 * The URL wins outright: a filtered dashboard becomes a link, browser Back steps
 * out of the filter, and the reviewer's "Changes Requested" card can carry its
 * filter across a tab change in one `navigate()`.
 */
export function isKpiBucket(value: string | null | undefined): value is KpiBucket {
  return typeof value === 'string' && Object.hasOwn(KPI_BUCKETS, value);
}

/** Statuses for a bucket, or `null` when the value is not a bucket at all. */
export function bucketStatuses(value: string | null | undefined): readonly TaskStatus[] | null {
  return isKpiBucket(value) ? KPI_BUCKETS[value] : null;
}

export const BUCKET_TO_STATUS: Record<KpiBucket, TaskStatus> = {
  draft: 'Draft',
  submitted: 'Submitted',
  awaitingReview: 'Submitted',
  inReview: 'InReview',
  changesRequested: 'ChangesRequested',
  approved: 'Approved',
};

export const STATUS_TO_BUCKET: Partial<Record<TaskStatus, KpiBucket>> = {
  Draft: 'draft',
  Submitted: 'awaitingReview',
  ChangesRequested: 'changesRequested',
  Approved: 'approved',
};
