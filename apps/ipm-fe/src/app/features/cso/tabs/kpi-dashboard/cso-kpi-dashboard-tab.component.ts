import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardInsightsComponent } from '../../../../core/components/dashboard-insights/dashboard-insights.component';
import { summarizeWork, workInsights } from '../../../../core/utils/work-insights';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import {
  CsoOverviewService,
  type CsoTaskView,
} from '../../../../core/services/cso-overview.service';

type DashboardTab = 'team' | 'management';
type TrendRange = '7D' | '30D' | '90D';

/** Roles that may access the CSO Management Dashboard */
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EXECUTIVE'] as const;

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#7c3aed',
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#d1d5db',
};

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const MEMBER_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#84cc16',
];

// ─── Interfaces ──────────────────────────────────────────────────────────────


interface StatusRow { status: string; count: number; pct: number; }

interface AgeRow {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  pct: number;
}

interface WorkloadSegment {
  memberName: string;
  count: number;
  color: string;
  dasharray: string;
  dashoffset: number;
}

interface MemberOpenRow {
  memberName: string;
  totalOpen: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface MemberCompletionRow {
  memberName: string;
  completed: number;
  // TODO: add totalTimeHours, avgTimeHours, avgCsat, slaMetPct
  //       when backend provides closedAt, csatScore, resolvedWithinSla
}

interface CustomerMonthRow {
  month: string;
  customerName: string;
  count: number;
}

interface TrendLine {
  priority: string;
  color: string;
  points: string; // SVG polyline points attribute
  counts: number[];
}


interface DateBucket { label: string; start: Date; end: Date; }

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  selector: 'cso-kpi-dashboard-tab',
  imports: [CommonModule, FormsModule, RouterLink, DashboardInsightsComponent],
  templateUrl: './cso-kpi-dashboard-tab.component.html',
  styleUrl: './cso-kpi-dashboard-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoKpiDashboardTabComponent implements OnInit {
  private readonly csoService = inject(CsoOverviewService);
  private readonly authService = inject(AuthService);

  // ─── Tab state ─────────────────────────────────────────────────────────────
  readonly activeTab = signal<DashboardTab>('team');

  // ─── Loading (from service signal) ─────────────────────────────────────────
  readonly isLoading = this.csoService.isLoading;
  readonly loadError = this.csoService.errorMessage;
  readonly loadedAt = this.csoService.loadedAt;
  readonly detailsWarning = this.csoService.detailsWarning;

  // ─── Projects data ─────────────────────────────────────────────────────────
  readonly isManagementAllowed = computed<boolean>(() => {
    const role = this.authService.currentUser()?.systemRole;
    return MANAGEMENT_ROLES.includes(role as (typeof MANAGEMENT_ROLES)[number]);
  });

  // ─── Current user ──────────────────────────────────────────────────────────

  // ─── Active dataset ────────────────────────────────────────────────────────
  /** Team tab → cases assigned to the logged-in user. Management → all cases. */
  readonly activeTasks = computed<CsoTaskView[]>(() => {
    const all = this.csoService.tasks();
    return this.activeTab() === 'team'
      ? all.filter((t) => !!this.authService.currentUser()?.id && t.assigneeIds?.includes(this.authService.currentUser()!.id))
      : this.isManagementAllowed() ? all : [];
  });

  // ─── Trend range (shared between priority and resolution charts) ────────────
  readonly trendRange = signal<TrendRange>('30D');

  // ─── 9 KPI Cards ──────────────────────────────────────────────────────────
  readonly snapshotItems = computed(() => this.activeTasks().map(task => ({
    id: task.id, title: task.title, status: task.rawStatus ?? (task.statusLabel === 'done' ? 'DONE' : 'IN_PROGRESS'),
    dueDate: task.dueDate, createdAt: task.createdAt, assigneeIds: task.assigneeIds,
  })));
  readonly snapshot = computed(() => summarizeWork(this.snapshotItems()));
  readonly insights = computed(() => workInsights(this.snapshotItems()));
  readonly highPriorityOpen = computed(() => this.activeTasks().filter(task => task.statusLabel !== 'done' && ['CRITICAL', 'HIGH'].includes(task.priority.toUpperCase())).length);
  readonly overdueCases = computed(() => this.snapshot().overdue.slice(0, 5));
  reload(): void { this.csoService.load({}); }

  readonly caseStatusTable = computed<StatusRow[]>(() => {
    const tasks = this.activeTasks();
    const total = tasks.length || 1;
    const map = new Map<string, number>();
    tasks.forEach((t) =>
      map.set(t.statusLabel, (map.get(t.statusLabel) ?? 0) + 1),
    );
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({
        status,
        count,
        pct: Math.round((count / total) * 100),
      }));
  });

  // ─── Case Count by Case Age ────────────────────────────────────────────────
  readonly caseAgeTable = computed<AgeRow[]>(() => {
    const openTasks = this.activeTasks().filter((t) => t.statusLabel !== 'done');
    const datedTasks = openTasks.filter(t => !!t.createdAt && Number.isFinite(Date.parse(t.createdAt)) && Date.parse(t.createdAt) <= Date.now());
    const total = datedTasks.length || 1;
    const now = new Date();

    const buckets: Omit<AgeRow, 'count' | 'pct'>[] = [
      { label: '0 – 3 days',   minDays: 0,  maxDays: 3 },
      { label: '4 – 7 days',   minDays: 4,  maxDays: 7 },
      { label: '8 – 14 days',  minDays: 8,  maxDays: 14 },
      { label: '15 – 30 days', minDays: 15, maxDays: 30 },
      { label: '> 30 days',    minDays: 31, maxDays: null },
    ];

    return buckets.map((b) => {
      const count = datedTasks.filter((t) => {
        const refDate = t.createdAt;
        if (!refDate) return false;
        const age = Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(refDate).getTime()) / 86_400_000,
          ),
        );
        return age >= b.minDays && (b.maxDays === null || age <= b.maxDays);
      }).length;
      return { ...b, count, pct: Math.round((count / total) * 100) };
    });
  });

  // ─── Open Cases by Priority Trend ─────────────────────────────────────────
  readonly priorityTrendLines = computed<TrendLine[]>(() => {
    const openTasks = this.activeTasks().filter((t) => t.statusLabel !== 'done');
    const buckets = this.buildDateBuckets(this.trendRange());
    const priorities = PRIORITY_ORDER.filter((p) =>
      openTasks.some((t) => t.priority.toUpperCase() === p),
    );

    if (buckets.length === 0 || priorities.length === 0) return [];

    // Count open tasks per bucket per priority
    const data: Record<string, Record<string, number>> = {};
    buckets.forEach((b) => {
      data[b.label] = {};
      priorities.forEach((p) => (data[b.label][p] = 0));
    });

    openTasks.forEach((t) => {
      const refDate = t.createdAt;
      if (!refDate) return;
      const d = new Date(refDate);
      if (isNaN(d.getTime())) return;
      const bucket = buckets.find((b) => d >= b.start && d < b.end);
      if (bucket) data[bucket.label][t.priority.toUpperCase()] = (data[bucket.label][t.priority.toUpperCase()] ?? 0) + 1;
    });

    const maxVal = Math.max(
      1,
      ...buckets.flatMap((b) => priorities.map((p) => data[b.label][p])),
    );
    const W = 720, H = 130, padY = 10;

    return priorities.map((p) => {
      const points = buckets
        .map((b, i) => {
          const x = buckets.length === 1 ? W / 2 : (i / (buckets.length - 1)) * W;
          const y = padY + H - (data[b.label][p] / maxVal) * H;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      return { priority: p, color: PRIORITY_COLORS[p] ?? '#d1d5db', points, counts: buckets.map(bucket => data[bucket.label][p]) };
    });
  });

  readonly trendBucketLabels = computed<string[]>(() =>
    this.buildDateBuckets(this.trendRange()).map((b) => b.label),
  );

  // ─── Resolution Trend ─────────────────────────────────────────────────────
  readonly workloadSegments = computed<WorkloadSegment[]>(() => {
    const openTasks = this.activeTasks().filter((t) => t.statusLabel !== 'done');
    const total = openTasks.length || 1;
    const RADIUS = 70;
    const CIRC = 2 * Math.PI * RADIUS;

    const memberMap = new Map<string, number>();
    openTasks.forEach((t) => {
      const key = t.assignee ?? 'Unassigned';
      memberMap.set(key, (memberMap.get(key) ?? 0) + 1);
    });

    const sorted = [...memberMap.entries()].sort((a, b) => b[1] - a[1]);
    let offset = 0;
    return sorted.map(([memberName, count], idx) => {
      const arc = (count / total) * CIRC;
      const seg: WorkloadSegment = {
        memberName,
        count,
        color: MEMBER_COLORS[idx % MEMBER_COLORS.length],
        dasharray: `${arc.toFixed(2)} ${(CIRC - arc).toFixed(2)}`,
        dashoffset: -offset,
      };
      offset += arc;
      return seg;
    });
  });

  readonly activeMember = signal<string | null>(null);

  readonly totalOpenCount = computed<number>(() =>
    this.workloadSegments().reduce((s, seg) => s + seg.count, 0),
  );

  // ─── Open Cases by Each Member ────────────────────────────────────────────
  readonly memberOpenRows = computed<MemberOpenRow[]>(() => {
    const openTasks = this.activeTasks().filter((t) => t.statusLabel !== 'done');
    const map = new Map<string, CsoTaskView[]>();
    openTasks.forEach((t) => {
      const key = t.assignee ?? 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()]
      .map(([memberName, tasks]) => ({
        memberName,
        totalOpen: tasks.length,
        critical: tasks.filter((t) => t.priority === 'CRITICAL').length,
        high:     tasks.filter((t) => t.priority === 'HIGH').length,
        medium:   tasks.filter((t) => t.priority === 'MEDIUM').length,
        low:      tasks.filter((t) => t.priority === 'LOW').length,
      }))
      .sort((a, b) => b.totalOpen - a.totalOpen);
  });

  // ─── Cases Completed by Member & Time Spent ───────────────────────────────
  readonly memberCompletionRows = computed<MemberCompletionRow[]>(() => {
    const closedTasks = this.activeTasks().filter((t) => t.rawStatus === 'DONE');
    const map = new Map<string, number>();
    closedTasks.forEach((t) => {
      const key = t.assignee ?? 'Unassigned';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    // TODO: add totalTimeHours, avgTimeHours, avgCsat, slaMetPct
    //       when backend provides closedAt, csatScore, resolvedWithinSla
    return [...map.entries()]
      .map(([memberName, completed]) => ({ memberName, completed }))
      .sort((a, b) => b.completed - a.completed);
  });

  // ─── Cases by Customer Over Time ──────────────────────────────────────────
  readonly monthFrom = signal<string>('');
  readonly monthTo   = signal<string>('');

  readonly customerMonthlyData = computed<CustomerMonthRow[]>(() => {
    const tasks = this.activeTasks();
    const from = this.monthFrom();
    const to   = this.monthTo();
    const rows: CustomerMonthRow[] = [];

    tasks.forEach((t) => {
      if (!t.createdAt || !t.customerName || !Number.isFinite(Date.parse(t.createdAt))) return;
      const month = t.createdAt.slice(0, 7); // "YYYY-MM"
      if (from && month < from) return;
      if (to   && month > to)   return;

      const existing = rows.find(
        (r) => r.month === month && r.customerName === t.customerName,
      );
      if (existing) existing.count++;
      else rows.push({ month, customerName: t.customerName!, count: 1 });
    });

    return rows.sort((a, b) =>
      a.month !== b.month
        ? a.month.localeCompare(b.month)
        : a.customerName.localeCompare(b.customerName),
    );
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Load CSO tasks from the service
    this.csoService.load({});



    // All computed signals will automatically react when data arrives
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  setActiveTab(tab: DashboardTab): void {
    this.activeTab.set(tab);
  }

  setTrendRange(range: string): void {
    this.trendRange.set(range as TrendRange);
  }

  onMemberSegmentClick(memberName: string): void {
    this.activeMember.update((m) => (m === memberName ? null : memberName));
  }

  getMemberCount(memberName: string): number {
    return (
      this.workloadSegments().find((s) => s.memberName === memberName)?.count ?? 0
    );
  }

  // ─── Template helpers ─────────────────────────────────────────────────────
  protected getPriorityColor(priority: string): string {
    return PRIORITY_COLORS[priority] ?? PRIORITY_COLORS['NONE'];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────
  private buildDateBuckets(range: TrendRange): DateBucket[] {
    const now = new Date();
    const days = range === '7D' ? 7 : range === '30D' ? 30 : 90;
    const bucketDays = days <= 7 ? 1 : 7; // daily for 7D, weekly otherwise
    const count = Math.ceil(days / bucketDays);
    const buckets: DateBucket[] = [];

    for (let i = count - 1; i >= 0; i--) {
      const end   = new Date(now.getTime() - i * bucketDays * 86_400_000);
      const start = new Date(Math.max(end.getTime() - bucketDays * 86_400_000, now.getTime() - days * 86_400_000));
      const label = start.toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
      });
      buckets.push({ label, start, end });
    }
    return buckets;
  }
}
