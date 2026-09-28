import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileEdit,
  Inbox,
  KeyRound,
  ListChecks,
  ScanSearch,
  Send,
  Shield,
  ScrollText,
  Users,
} from 'lucide-react';
import type { TaskListItem, TaskStatus } from '@sdp/contracts';
import { StatCard } from '@/components/common/KpiCard.tsx';
import { StatCardSkeleton } from '@/components/common/Skeleton.tsx';
import { PageHeader } from '@/components/common/PageHeader.tsx';
import { RouteTabs } from '@/components/ui/Tabs.tsx';
import { ROUTES } from '@/config/routes.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { useBucketSelection } from '@/portals/code-review/hooks/useKpiBucket.ts';
import { useTasks } from '@/portals/code-review/hooks/useTasks.ts';
import admin from '@/content/admin.json';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { Reveal } from '@/components/common/Reveal.tsx';
import { WorkspaceOutlet } from '@/components/common/WorkspaceOutlet.tsx';

/**
 * Admin workspace chrome (screens 01–06): header, six counters, tab strip.
 *
 * Unlike the reviewer's four scoped queries, all six counters come from ONE
 * `scope=all` query. That is correct here and only here: an admin is authorised
 * to see every task, so counting client-side reveals nothing they could not
 * already read from the grid below — and six queries for six numbers over the
 * same rows would be six chances for the header to disagree with the table.
 *
 * Each tab is a real route, not a Radix panel. Figma draws tabs; the previous
 * Next.js app used separate pages. Routing them satisfies both — deep links and
 * browser Back work, and the strip still looks like the wireframe.
 */

function countByStatus(tasks: readonly TaskListItem[], status: TaskStatus): number {
  return tasks.filter((task) => task.status === status).length;
}

export function AdminLayout() {
  const { data: user } = useCurrentUser();
  const { data: tasks, isPending } = useTasks('all');
  const bucket = useBucketSelection();
  const grid = ROUTES.admin.root;
  const isSuperAdmin = user?.roles.includes('Super Admin') === true;

  const all = tasks ?? [];

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title={admin.workspace.title}
        subtitle={interpolate(admin.workspace.subtitle, {
          name: user?.name ?? '',
        })}
        icon={<Shield className="size-5" />}
        tone="admin"
      />

      {/*
        Six counters in ONE row from `lg` up, matching the Power App reference.

        The previous ramp held six across only at `2xl` and stacked three-by-two
        below it, which ate roughly a third of the viewport before the admin had
        seen a single task. `size="compact"` is what makes six fit at 1024: the
        default density needs about 190px a card, which "Changes Requested" over
        a four-digit number does not get in a sixth of that width.

        Below `lg` it steps 3 → 2 rather than going single-column, because these
        are short numeric cards and a phone-width column of six is a scroll.
      */}
      <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {isPending ? (
          Array.from({ length: 6 }, (_, index) => <StatCardSkeleton key={index} size="compact" />)
        ) : (
          <>
            <StatCard
              label={admin.kpis.total}
              value={all.length}
              tone="violet"
              size="compact"
              icon={<ClipboardList className="size-4" />}
              // Total is the "show everything again" control, so the row has no
              // dead card and there is an obvious way back from a filter.
              isActive={bucket.isUnfiltered(grid)}
              onSelect={() => {
                bucket.clear(grid);
              }}
            />
            <StatCard
              label={admin.kpis.draft}
              value={countByStatus(all, 'Draft')}
              tone="neutral"
              size="compact"
              icon={<FileEdit className="size-4" />}
              isActive={bucket.isActive('draft', grid)}
              onSelect={() => {
                bucket.select('draft', grid);
              }}
            />
            <StatCard
              label={admin.kpis.submitted}
              value={countByStatus(all, 'Submitted')}
              tone="blue"
              size="compact"
              icon={<Send className="size-4" />}
              isActive={bucket.isActive('submitted', grid)}
              onSelect={() => {
                bucket.select('submitted', grid);
              }}
            />
            <StatCard
              label={admin.kpis.inReview}
              value={countByStatus(all, 'InReview')}
              tone="violet"
              size="compact"
              icon={<ScanSearch className="size-4" />}
              isActive={bucket.isActive('inReview', grid)}
              onSelect={() => {
                bucket.select('inReview', grid);
              }}
            />
            <StatCard
              label={admin.kpis.changesRequested}
              value={countByStatus(all, 'ChangesRequested')}
              tone="amber"
              size="compact"
              icon={<AlertCircle className="size-4" />}
              isActive={bucket.isActive('changesRequested', grid)}
              onSelect={() => {
                bucket.select('changesRequested', grid);
              }}
            />
            <StatCard
              label={admin.kpis.approved}
              value={countByStatus(all, 'Approved') + countByStatus(all, 'Delivered')}
              tone="green"
              size="compact"
              icon={<CheckCircle2 className="size-4" />}
              isActive={bucket.isActive('approved', grid)}
              onSelect={() => {
                bucket.select('approved', grid);
              }}
            />
          </>
        )}
      </Reveal>

      <RouteTabs
        label={admin.workspace.title}
        tabs={[
          {
            to: ROUTES.admin.root,
            label: admin.workspace.tabs.tasks,
            icon: <ClipboardList className="size-4" />,
            end: true,
          },
          {
            to: ROUTES.admin.users,
            label: admin.workspace.tabs.users,
            icon: <Users className="size-4" />,
          },
          {
            to: ROUTES.admin.customers,
            label: admin.workspace.tabs.customers,
            icon: <Building2 className="size-4" />,
          },
          {
            to: ROUTES.admin.checklist,
            label: admin.workspace.tabs.checklist,
            icon: <ClipboardCheck className="size-4" />,
          },
          {
            to: ROUTES.admin.handovers,
            label: admin.workspace.tabs.handovers,
            icon: <Inbox className="size-4" />,
          },
          {
            to: ROUTES.admin.reports,
            label: admin.workspace.tabs.reports,
            icon: <ListChecks className="size-4" />,
          },
          {
            to: ROUTES.admin.activity,
            label: admin.workspace.tabs.activity,
            icon: <ScrollText className="size-4" />,
          },
          ...(isSuperAdmin
            ? [
                {
                  to: ROUTES.admin.roles,
                  label: admin.workspace.tabs.roles,
                  icon: <KeyRound className="size-4" />,
                },
              ]
            : []),
        ]}
      />

      <WorkspaceOutlet />
    </PageContainer>
  );
}
