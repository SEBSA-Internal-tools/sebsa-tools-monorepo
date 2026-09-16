import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';
import { AuthService } from '../../../../core/services/auth.service';
import {
  CsoOverviewService,
  type CsoTaskView,
} from '../../../../core/services/cso-overview.service';
import { ProjectsService } from '../../../projects/services/projects.service';

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

interface KpiCard {
  id: string;
  title: string;
  value: string | number;
  icon: string;
  accent: string;
  badge?: { label: string; cls: string };
}

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
}

interface ResolutionPoint { label: string; resolved: number; }

interface DateBucket { label: string; start: Date; end: Date; }

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
  standalone: true,
  selector: 'cso-kpi-dashboard-tab',
  imports: [CommonModule, FormsModule],
  templateUrl: './cso-kpi-dashboard-tab.component.html',
  styleUrl: './cso-kpi-dashboard-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoKpiDashboardTabComponent implements OnInit {
  private readonly csoService = inject(CsoOverviewService);
  private readonly projectsService = inject(ProjectsService);
  private readonly authService = inject(AuthService);

  // ─── Tab state ─────────────────────────────────────────────────────────────
  readonly activeTab = signal<DashboardTab>('team');

  // ─── Loading (from service signal) ─────────────────────────────────────────
  readonly isLoading = this.csoService.isLoading;

  // ─── Projects data ─────────────────────────────────────────────────────────
  readonly allProjects = signal<ProjectSummary[]>([]);

  readonly csoProjects = computed<ProjectSummary[]>(() =>
    this.allProjects().filter((p) => p.isCsoProject),
  );

  readonly activeCustomers = computed<Set<string>>(() => {
    const customers = new Set<string>();
    this.csoProjects().forEach((p) => {
      customers.add(p.customer.id);
    });
    return customers;
  });

  // ─── Permission gate ───────────────────────────────────────────────────────
  /** Only ADMIN, EXECUTIVE, and SUPER_ADMIN may view the Management Dashboard */
  readonly isManagementAllowed = computed<boolean>(() => {
    const role = this.authService.currentUser()?.systemRole;
    return MANAGEMENT_ROLES.includes(role as (typeof MANAGEMENT_ROLES)[number]);
  });

  // ─── Current user ──────────────────────────────────────────────────────────
  private readonly currentUserName = computed<string>(
    () => this.authService.currentUser()?.name ?? '',
  );

  // ─── Active dataset ────────────────────────────────────────────────────────
  /** Team tab → cases assigned to the logged-in user. Management → all cases. */
  readonly activeTasks = computed<CsoTaskView[]>(() => {
    const all = this.csoService.tasks();
    return this.activeTab() === 'team'
      ? all.filter((t) => t.assignee === this.currentUserName())
      : all;
  });

  // ─── Trend range (shared between priority and resolution charts) ────────────
  readonly trendRange = signal<TrendRange>('30D');

  // ─── 9 KPI Cards ──────────────────────────────────────────────────────────
  readonly kpiCards = computed<KpiCard[]>(() => {
    const tasks = this.activeTasks();
    const openTasks = tasks.filter((t) => t.statusLabel !== 'done');
    const closedTasks = tasks.filter((t) => t.statusLabel === 'done');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const newTasks = tasks.filter((t) => {
      const refDate = t.createdAt || t.updatedAt || t.dueDate;
      if (!refDate) return false;
      const d = new Date(refDate);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo && d <= now;
    });

    const criticalHighOpen = openTasks.filter((t) =>
      ['CRITICAL', 'HIGH'].includes((t.priority || '').toUpperCase()),
    );

    const avgAge =
      openTasks.length > 0
        ? Math.round(
            openTasks.reduce((sum, t) => {
              const refDate = t.createdAt || t.updatedAt || t.dueDate;
              const days = refDate
                ? Math.max(
                    0,
                    Math.floor(
                      (now.getTime() - new Date(refDate).getTime()) / 86_400_000,
                    ),
                  )
                : 0;
              return sum + days;
            }, 0) / openTasks.length,
          )
        : 0;

    // Team vs Management scoped projects & customers count
    const activeProjectIds = new Set(tasks.map((t) => t.projectId).filter(Boolean));
    const activeCustomerNames = new Set(tasks.map((t) => t.customerName).filter(Boolean));

    const projectsCount =
      this.activeTab() === 'team'
        ? activeProjectIds.size
        : this.csoProjects().length;

    const customersCount =
      this.activeTab() === 'team'
        ? activeCustomerNames.size
        : this.activeCustomers().size;

    // SLA Compliance: Percentage of cases completed on time or open and not overdue
    const nonOverdueCount = tasks.filter((t) => {
      if (!t.dueDate) return true;
      const due = new Date(t.dueDate);
      if (isNaN(due.getTime())) return true;
      return t.statusLabel === 'done' || due >= now;
    }).length;

    const slaCompliancePct =
      tasks.length > 0
        ? Math.round((nonOverdueCount / tasks.length) * 100)
        : 100;

    const slaLabel =
      slaCompliancePct >= 90 ? 'Compliant'
      : slaCompliancePct >= 70 ? 'At Risk'
      : 'Non-Compliant';

    const slaCls =
      slaCompliancePct >= 90 ? 'compliant'
      : slaCompliancePct >= 70 ? 'at-risk'
      : 'non-compliant';

    return [
      { id: 'total',         title: 'Total CSO Cases',          value: tasks.length,              icon: 'folder_open',         accent: '#6366f1' },
      { id: 'open',          title: 'Open Cases',               value: openTasks.length,          icon: 'inbox',               accent: '#0ea5e9' },
      { id: 'closed',        title: 'Closed Cases',             value: closedTasks.length,        icon: 'check_circle',        accent: '#10b981' },
      { id: 'new7d',         title: 'New Cases (Last 7 Days)',   value: newTasks.length,           icon: 'new_releases',        accent: '#8b5cf6' },
      { id: 'critHigh',      title: 'Critical / High Open',     value: criticalHighOpen.length,   icon: 'priority_high',       accent: '#ef4444' },
      { id: 'projects',      title: 'Active CSO Projects',      value: projectsCount,             icon: 'business',            accent: '#f97316' },
      { id: 'avgAge',        title: 'Average Case Age',         value: `${avgAge}d`,              icon: 'schedule',            accent: '#f59e0b' },
      { id: 'customers',     title: 'Active Customers',         value: customersCount,            icon: 'group',             accent: '#06b6d4' },
      {
        id: 'slaCompliance',
        title: 'SLA Compliance %',
        value: `${slaCompliancePct}%`,
        icon: 'verified',
        accent: '#10b981',
        badge: { label: slaLabel, cls: slaCls },
      },
    ];
  });

  // ─── Case Count by Statuses ────────────────────────────────────────────────
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
    const total = openTasks.length || 1;
    const now = new Date();

    const buckets: Omit<AgeRow, 'count' | 'pct'>[] = [
      { label: '0 – 3 days',   minDays: 0,  maxDays: 3 },
      { label: '4 – 7 days',   minDays: 4,  maxDays: 7 },
      { label: '8 – 14 days',  minDays: 8,  maxDays: 14 },
      { label: '15 – 30 days', minDays: 15, maxDays: 30 },
      { label: '> 30 days',    minDays: 31, maxDays: null },
    ];

    return buckets.map((b) => {
      const count = openTasks.filter((t) => {
        const refDate = t.createdAt || t.updatedAt || t.dueDate;
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
      openTasks.some((t) => t.priority === p),
    );

    if (buckets.length === 0 || priorities.length === 0) return [];

    // Count open tasks per bucket per priority
    const data: Record<string, Record<string, number>> = {};
    buckets.forEach((b) => {
      data[b.label] = {};
      priorities.forEach((p) => (data[b.label][p] = 0));
    });

    openTasks.forEach((t) => {
      const refDate = t.createdAt || t.updatedAt || t.dueDate;
      if (!refDate) return;
      const d = new Date(refDate);
      if (isNaN(d.getTime())) return;
      const bucket = buckets.find((b) => d >= b.start && d < b.end);
      if (bucket) data[bucket.label][t.priority] = (data[bucket.label][t.priority] ?? 0) + 1;
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
      return { priority: p, color: PRIORITY_COLORS[p] ?? '#d1d5db', points };
    });
  });

  readonly trendBucketLabels = computed<string[]>(() =>
    this.buildDateBuckets(this.trendRange()).map((b) => b.label),
  );

  // ─── Resolution Trend ─────────────────────────────────────────────────────
  readonly resolutionPoints = computed<ResolutionPoint[]>(() => {
    const closedTasks = this.activeTasks().filter((t) => t.statusLabel === 'done');
    const buckets = this.buildDateBuckets(this.trendRange());
    const counts: Record<string, number> = {};
    buckets.forEach((b) => (counts[b.label] = 0));

    // TODO: replace dueDate with closedAt when backend provides it
    closedTasks.forEach((t) => {
      if (!t.dueDate) return;
      const d = new Date(t.dueDate);
      const bucket = buckets.find((b) => d >= b.start && d < b.end);
      if (bucket) counts[bucket.label]++;
    });

    return buckets.map((b) => ({ label: b.label, resolved: counts[b.label] }));
  });

  readonly resolutionSvgLine = computed<string>(() => {
    const pts = this.resolutionPoints();
    if (pts.length === 0) return '';
    const maxVal = Math.max(1, ...pts.map((p) => p.resolved));
    const W = 720, H = 130, padY = 10;
    return pts
      .map((p, i) => {
        const x = pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W;
        const y = padY + H - (p.resolved / maxVal) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  readonly resolutionSvgArea = computed<string>(() => {
    const pts = this.resolutionPoints();
    if (pts.length === 0) return '';
    const maxVal = Math.max(1, ...pts.map((p) => p.resolved));
    const W = 720, H = 130, padY = 10, bottom = padY + H;
    const coords = pts.map((p, i) => ({
      x: pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W,
      y: padY + H - (p.resolved / maxVal) * H,
    }));
    const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L');
    return `M${coords[0].x.toFixed(1)},${bottom} L${line} L${coords[coords.length - 1].x.toFixed(1)},${bottom} Z`;
  });

  // ─── Workload by Members — Donut ──────────────────────────────────────────
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
    const closedTasks = this.activeTasks().filter((t) => t.statusLabel === 'done');
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
      if (!t.dueDate || !t.customerName) return;
      // TODO: replace dueDate with createdAt when backend provides it
      const month = t.dueDate.slice(0, 7); // "YYYY-MM"
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

    // Load projects data
    this.projectsService.getProjects().subscribe({
      next: (projects) => this.allProjects.set(projects),
    });

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
      const start = new Date(end.getTime() - bucketDays * 86_400_000);
      const label = start.toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
      });
      buckets.push({ label, start, end });
    }
    return buckets;
  }
}
