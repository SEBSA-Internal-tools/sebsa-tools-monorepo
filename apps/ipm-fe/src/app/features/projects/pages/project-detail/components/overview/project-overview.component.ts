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
import { TasksService, type TaskView } from '../../../../../../core/services/tasks.service';
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
  totalTasks: number;
  functionalTasks: number;
  technicalTasks: number;
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

  private tasksService = inject(TasksService);
  private projectsService = inject(ProjectsService);

  sprintStats = signal<SprintStats>({
    active: 0,
    planned: 0,
    completed: 0,
  });

  allSprints = signal<Sprint[]>([]);
  activeSprint = signal<Sprint | null>(null);

  readonly metrics = signal<OverviewMetrics>({
    totalTasks: 0,
    functionalTasks: 0,
    technicalTasks: 0,
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
    this.tasksService.tasks$.subscribe(() => this.loadProjectData());
    this.loadProjectData();
  }

  private loadProjectData(): void {
    if (!this.project.id) return;

    const tasks = this.tasksService.getTasksByProject(this.project.id);

    // Fetch sprints from API
    this.projectsService.getSprintsObservable(this.project.id).subscribe((sprints) => {
      // Calculate sprint stats from API data (status values are uppercase: ACTIVE, PLANNED, COMPLETED)
      this.sprintStats.set({
        active: sprints.filter((s: Sprint) => s.status === 'ACTIVE').length,
        planned: sprints.filter((s: Sprint) => s.status === 'PLANNED').length,
        completed: sprints.filter((s: Sprint) => s.status === 'COMPLETED').length,
      });

      // Get active sprint from API data
      const active = sprints.find((s: Sprint) => s.status === 'ACTIVE');
      this.activeSprint.set(active || null);
      this.allSprints.set(sprints);
    });

    // NEW — populate dashboard signals
    this.metrics.set(this.computeMetrics(tasks));
    this.donutSegments.set(this.computeDonutSegments(tasks));
    this.statusTable.set(this.computeStatusTable(tasks));
    this.techAssignees.set(this.computeTechnicalAssignees(tasks));
    this.funcAssignees.set(this.computeFunctionalAssignees(tasks));
    this.agingTable.set(this.computeAgingTable(tasks));
  }

  private computeMetrics(tasks: TaskView[]): OverviewMetrics {
    const total = tasks.length;
    const functional = tasks.filter((t: TaskView) => t.type === 'FUNCTIONAL').length;
    const technical = tasks.filter((t: TaskView) => t.type === 'TECHNICAL').length;
    const done = tasks.filter((t: TaskView) => t.statusLabel === 'done').length;
    const inProgress = tasks.filter((t: TaskView) => t.statusLabel === 'inprogress').length;

    const rawHealth = total === 0 ? 100 : ((done * 1.0 + inProgress * 0.4) / total) * 100;
    const healthPct = Math.min(100, Math.round(rawHealth));
    const healthLabel: 'Healthy' | 'At Risk' | 'Critical' =
      healthPct >= 75 ? 'Healthy' : healthPct >= 40 ? 'At Risk' : 'Critical';

    return { totalTasks: total, functionalTasks: functional, technicalTasks: technical, healthPct, healthLabel };
  }

  private computeDonutSegments(tasks: TaskView[]): DonutSegment[] {
    const RADIUS = 70;
    const CIRC = 2 * Math.PI * RADIUS;
    const total = tasks.length || 1;

    const priorityCounts = new Map<string, number>();
    tasks.forEach((t: TaskView) => {
      const key = t.priority ?? 'NONE';
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
    return PRIORITY_COLORS[priority] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  }

  private computeStatusTable(tasks: TaskView[]): StatusRow[] {
    const total = tasks.length;

    const statusCounts = new Map<string, number>();
    tasks.forEach((t: TaskView) => {
      const key = t.statusLabel ?? 'unknown';
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

  private computeTechnicalAssignees(tasks: TaskView[]): AssigneeRow[] {
    const technical = tasks.filter((t: TaskView) => t.type === 'TECHNICAL');
    const map = new Map<string, TaskView[]>();
    technical.forEach((t: TaskView) => {
      const key = t.assignee ?? 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()]
      .map(([name, ts]) => ({
        name,
        total: ts.length,
        inProgress: ts.filter((t: TaskView) => t.statusLabel === 'inprogress').length,
        done: ts.filter((t: TaskView) => t.statusLabel === 'done').length,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private computeFunctionalAssignees(tasks: TaskView[]): AssigneeRow[] {
    const functional = tasks.filter((t: TaskView) => t.type === 'FUNCTIONAL');
    const map = new Map<string, TaskView[]>();
    functional.forEach((t: TaskView) => {
      const key = t.assignee ?? 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()]
      .map(([name, ts]) => ({
        name,
        total: ts.length,
        inProgress: ts.filter((t: TaskView) => t.statusLabel === 'inprogress').length,
        done: ts.filter((t: TaskView) => t.statusLabel === 'done').length,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private computeAgingTable(tasks: TaskView[]): AgingRow[] {
    const today = new Date();

    const statusGroups = new Map<string, TaskView[]>();
    tasks.forEach((t: TaskView) => {
      const key = t.statusLabel ?? 'unknown';
      statusGroups.set(key, [...(statusGroups.get(key) ?? []), t]);
    });

    return [...statusGroups.entries()]
      .map(([status, group]) => {
        const days = group.map((t: TaskView) => {
          const ref = t.updatedAt ? new Date(t.updatedAt) : new Date(t.dueDate ?? today);
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
