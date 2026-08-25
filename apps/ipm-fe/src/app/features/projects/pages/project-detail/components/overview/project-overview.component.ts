import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService, type Sprint } from '../../../../services/projects.service';
import { CasesService, type CaseView } from '../../../../../../core/services/cases.service';
import type { Project, ProjectStatus } from '@sebsa-pm-tool/shared-models';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#d1d5db',
};

const FALLBACK_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ec4899'];

interface SprintStats {
  active: number;
  planned: number;
  completed: number;
}

interface OverviewMetrics {
  totalCases: number;
  functionalCases: number;
  technicalCases: number;
  healthPct: number;
  healthLabel: 'Healthy' | 'At Risk' | 'Critical';
}

interface DonutSegment {
  priority: string;
  count: number;
  color: string;
  dasharray: string;
  dashoffset: number;
}

interface StatusRow {
  status: string;
  count: number;
  pct: number;
}

interface AssigneeRow {
  name: string;
  total: number;
  inProgress: number;
  done: number;
}

interface AgingRow {
  status: string;
  count: number;
  avgDays: number;
  minDays: number;
  maxDays: number;
}

/** Cases are the level Task used to be tracked at before the Case hierarchy
 * split — this dashboard reads Cases now, and the "done"/"in progress"
 * buckets map from the fixed CaseStatus enum instead of a per-project
 * workflow-stage position. */
@Component({
  standalone: true,
  selector: 'project-overview',
  imports: [CommonModule],
  templateUrl: './project-overview.component.html',
  styleUrl: './project-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectOverviewComponent implements OnInit {
  @Input() project!: Project;

  private casesService = inject(CasesService);
  private projectsService = inject(ProjectsService);

  sprintStats = signal<SprintStats>({
    active: 0,
    planned: 0,
    completed: 0,
  });

  allSprints = signal<Sprint[]>([]);
  activeSprint = signal<Sprint | null>(null);

  readonly metrics = signal<OverviewMetrics>({
    totalCases: 0,
    functionalCases: 0,
    technicalCases: 0,
    healthPct: 0,
    healthLabel: 'Healthy',
  });

  readonly donutSegments = signal<DonutSegment[]>([]);
  readonly activePriority = signal<string | null>(null);
  readonly statusTable = signal<StatusRow[]>([]);
  readonly techAssignees = signal<AssigneeRow[]>([]);
  readonly funcAssignees = signal<AssigneeRow[]>([]);
  readonly agingTable = signal<AgingRow[]>([]);

  ngOnInit(): void {
    this.casesService.cases$.subscribe(() => this.loadProjectData());
    this.loadProjectData();
  }

  private isDone(kase: CaseView): boolean {
    return kase.status === 'DONE' || kase.status === 'CANCELLED';
  }

  private isInProgress(kase: CaseView): boolean {
    return kase.status === 'IN_PROGRESS' || kase.status === 'IN_REVIEW' || kase.status === 'BLOCKED';
  }

  private loadProjectData(): void {
    if (!this.project.id) return;

    const cases = this.casesService.getCasesByProject(this.project.id);

    this.projectsService.getSprintsObservable(this.project.id).subscribe((sprints) => {
      this.sprintStats.set({
        active: sprints.filter((s: Sprint) => s.status === 'ACTIVE').length,
        planned: sprints.filter((s: Sprint) => s.status === 'PLANNED').length,
        completed: sprints.filter((s: Sprint) => s.status === 'COMPLETED').length,
      });

      const active = sprints.find((s: Sprint) => s.status === 'ACTIVE');
      this.activeSprint.set(active || null);
      this.allSprints.set(sprints);
    });

    this.metrics.set(this.computeMetrics(cases));
    this.donutSegments.set(this.computeDonutSegments(cases));
    this.statusTable.set(this.computeStatusTable(cases));
    this.techAssignees.set(this.computeAssignees(cases, 'TECHNICAL'));
    this.funcAssignees.set(this.computeAssignees(cases, 'FUNCTIONAL'));
    this.agingTable.set(this.computeAgingTable(cases));
  }

  private computeMetrics(cases: CaseView[]): OverviewMetrics {
    const total = cases.length;
    const functional = cases.filter((c) => c.tag === 'FUNCTIONAL').length;
    const technical = cases.filter((c) => c.tag === 'TECHNICAL').length;
    const done = cases.filter((c) => this.isDone(c)).length;
    const inProgress = cases.filter((c) => this.isInProgress(c)).length;

    const rawHealth = total === 0 ? 100 : ((done * 1.0 + inProgress * 0.4) / total) * 100;
    const healthPct = Math.min(100, Math.round(rawHealth));
    const healthLabel: 'Healthy' | 'At Risk' | 'Critical' =
      healthPct >= 75 ? 'Healthy' : healthPct >= 40 ? 'At Risk' : 'Critical';

    return { totalCases: total, functionalCases: functional, technicalCases: technical, healthPct, healthLabel };
  }

  private computeDonutSegments(cases: CaseView[]): DonutSegment[] {
    const RADIUS = 70;
    const CIRC = 2 * Math.PI * RADIUS;
    const total = cases.length || 1;

    const priorityCounts = new Map<string, number>();
    cases.forEach((c) => {
      const key = c.priority ?? 'NONE';
      priorityCounts.set(key, (priorityCounts.get(key) ?? 0) + 1);
    });

    const sorted = [...priorityCounts.entries()].sort((a, b) => b[1] - a[1]);

    let offset = 0;
    return sorted.map(([priority, count], idx) => {
      const arc = (count / total) * CIRC;
      const seg: DonutSegment = {
        priority,
        count,
        color: this.getPriorityColor(priority, idx),
        dasharray: `${arc} ${CIRC - arc}`,
        dashoffset: -offset,
      };
      offset += arc;
      return seg;
    });
  }

  private getPriorityColor(priority: string, index: number): string {
    return PRIORITY_COLORS[priority.toUpperCase()] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  private computeStatusTable(cases: CaseView[]): StatusRow[] {
    const total = cases.length;

    const statusCounts = new Map<string, number>();
    cases.forEach((c) => {
      const key = c.status ?? 'unknown';
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    });

    return [...statusCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({
        status,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
      }));
  }

  private computeAssignees(cases: CaseView[], tag: 'TECHNICAL' | 'FUNCTIONAL'): AssigneeRow[] {
    const filtered = cases.filter((c) => c.tag === tag);
    const map = new Map<string, CaseView[]>();
    filtered.forEach((c) => {
      const key = c.assignee ?? 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), c]);
    });
    return [...map.entries()]
      .map(([name, cs]) => ({
        name,
        total: cs.length,
        inProgress: cs.filter((c) => this.isInProgress(c)).length,
        done: cs.filter((c) => this.isDone(c)).length,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private computeAgingTable(cases: CaseView[]): AgingRow[] {
    const today = new Date();

    const statusGroups = new Map<string, CaseView[]>();
    cases.forEach((c) => {
      const key = c.status ?? 'unknown';
      statusGroups.set(key, [...(statusGroups.get(key) ?? []), c]);
    });

    return [...statusGroups.entries()]
      .map(([status, group]) => {
        const days = group.map((c) => {
          const ref = c.updatedAt ? new Date(c.updatedAt) : new Date(c.dueDate || today);
          return Math.max(0, Math.floor((today.getTime() - ref.getTime()) / 86_400_000));
        });
        return {
          status,
          count: group.length,
          avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
          minDays: days.length ? Math.min(...days) : 0,
          maxDays: days.length ? Math.max(...days) : 0,
        };
      })
      .sort((a, b) => b.avgDays - a.avgDays);
  }

  onSegmentClick(priority: string): void {
    this.activePriority.update((p) => (p === priority ? null : priority));
  }

  getPriorityCount(priority: string): number {
    return this.donutSegments().find((s) => s.priority === priority)?.count ?? 0;
  }

  healthClass(): string {
    const label = this.metrics().healthLabel;
    return label === 'Healthy' ? 'healthy' : label === 'At Risk' ? 'at-risk' : 'critical';
  }

  healthLabel(): string {
    return this.metrics().healthLabel;
  }

  statusClass(): string {
    return this.project.status.toLowerCase().replace(/_/g, '-');
  }

  statusLabel(): string {
    return STATUS_LABELS[this.project.status] ?? this.project.status;
  }
}
