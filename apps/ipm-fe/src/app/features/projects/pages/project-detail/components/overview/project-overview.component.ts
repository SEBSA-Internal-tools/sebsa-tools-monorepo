import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService, Task, Sprint } from '../../../../services/projects.service';
import type { Project, ProjectStatus } from '@sebsa-pm-tool/shared-models';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  overdue: number;
}

interface SprintStats {
  active: number;
  planned: number;
  completed: number;
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

  private projectsService = inject(ProjectsService);

  taskStats = signal<TaskStats>({
    total: 0,
    completed: 0,
    inProgress: 0,
    todo: 0,
    overdue: 0,
  });

  sprintStats = signal<SprintStats>({
    active: 0,
    planned: 0,
    completed: 0,
  });

  recentTasks = signal<Task[]>([]);
  allSprints = signal<Sprint[]>([]);
  activeSprint = signal<Sprint | null>(null);

  ngOnInit(): void {
    this.loadProjectData();
  }

  private loadProjectData(): void {
    if (!this.project.id) return;

    const tasks = this.projectsService.getTasks(this.project.id);
    const sprints = this.projectsService.getSprints(this.project.id);

    // Calculate task stats
    this.taskStats.set({
      total: tasks.length,
      completed: tasks.filter((t: Task) => t.status === 'done').length,
      inProgress: tasks.filter((t: Task) => t.status === 'inprogress').length,
      todo: tasks.filter((t: Task) => t.status === 'todo').length,
      overdue: this.getOverdueTaskCount(tasks),
    });

    // Calculate sprint stats
    this.sprintStats.set({
      active: sprints.filter((s: Sprint) => s.status === 'active').length,
      planned: sprints.filter((s: Sprint) => s.status === 'planned').length,
      completed: sprints.filter((s: Sprint) => s.status === 'completed').length,
    });

    // Get active sprint
    const active = sprints.find((s: Sprint) => s.status === 'active');
    this.activeSprint.set(active || null);

    // Get recent tasks (last 10)
    const recent = tasks
      .sort((a: Task, b: Task) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
      .slice(0, 10);
    this.recentTasks.set(recent);

    this.allSprints.set(sprints);
  }

  private getOverdueTaskCount(tasks: Task[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter((t: Task) => {
      if (!t.dueDate || t.status === 'done') return false;
      const dueDate = new Date(t.dueDate);
      return dueDate < today;
    }).length;
  }

  getCompletionPercentage(): number {
    const stats = this.taskStats();
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }

  getTaskStatusColor(status: Task['status']): string {
    switch (status) {
      case 'done':
        return '#10b981';
      case 'inprogress':
        return '#3b82f6';
      case 'todo':
        return '#f59e0b';
      case 'new':
        return '#6b7280';
      default:
        return '#9ca3af';
    }
  }

  getTaskStatusIcon(status: Task['status']): string {
    switch (status) {
      case 'done':
        return 'check_circle';
      case 'inprogress':
        return 'schedule';
      case 'todo':
        return 'pending_actions';
      case 'new':
        return 'radio_button_unchecked';
      default:
        return 'help';
    }
  }

  getTaskStatusLabel(status: Task['status']): string {
    switch (status) {
      case 'done':
        return 'Done';
      case 'inprogress':
        return 'In Progress';
      case 'todo':
        return 'To Do';
      case 'new':
        return 'New';
      default:
        return status;
    }
  }

  getPriorityColor(priority: Task['priority']): string {
    switch (priority) {
      case 'High':
        return '#ef4444';
      case 'Medium':
        return '#f59e0b';
      case 'Low':
        return '#3b82f6';
      default:
        return '#9ca3af';
    }
  }

  getSprintStatusLabel(status: Sprint['status']): string {
    switch (status) {
      case 'active':
        return 'Active';
      case 'planned':
        return 'Planned';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  }

  statusClass(): string {
    return this.project.status.toLowerCase().replace(/_/g, '-');
  }

  statusLabel(): string {
    return STATUS_LABELS[this.project.status] ?? this.project.status;
  }

  getSprintStatusBadgeClass(status: Sprint['status']): string {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'planned':
        return 'status-planned';
      default:
        return '';
    }
  }
}
