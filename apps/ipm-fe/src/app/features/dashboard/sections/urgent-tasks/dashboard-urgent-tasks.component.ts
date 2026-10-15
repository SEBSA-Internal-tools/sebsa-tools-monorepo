import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

export interface TaskCompletionRequest {
  taskId: string;
  succeed: () => void;
  fail: () => void;
}
import type { DashboardUrgentTask } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-dashboard-urgent-tasks',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-urgent-tasks.component.html',
  styleUrl: './dashboard-urgent-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardUrgentTasksComponent {
  private readonly router = inject(Router);

  @Input() tasks: DashboardUrgentTask[] | null = null;
  @Input() loading = false;

  @Output() taskCompleted = new EventEmitter<TaskCompletionRequest>();

  readonly isCollapsed = signal<boolean>(false);
  readonly completingIds = signal<Set<string>>(new Set());
  readonly completedIds = signal<Set<string>>(new Set());

  readonly completionError = signal('');

  readonly skeletonRows = [1, 2, 3];

  toggleCollapse(): void {
    this.isCollapsed.update((v) => !v);
  }

  navigateToTask(task: DashboardUrgentTask, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/tasks', task.id]);
  }

  navigateToProject(projectId: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/projects', projectId]);
  }

  onCompleteClick(task: DashboardUrgentTask, event: Event): void {
    event.stopPropagation();
    if (this.completingIds().has(task.id) || this.completedIds().has(task.id)) {
      return;
    }

    this.completionError.set('');
    this.completingIds.update(ids => new Set(ids).add(task.id));
    const release = () => this.completingIds.update(ids => {
      const next = new Set(ids);
      next.delete(task.id);
      return next;
    });
    this.taskCompleted.emit({
      taskId: task.id,
      succeed: () => {
        release();
        this.completedIds.update(ids => new Set(ids).add(task.id));
      },
      fail: () => {
        release();
        this.completionError.set('Could not complete "' + task.title + '". Please try again.');
      },
    });
  }

  isTaskDone(taskId: string): boolean {
    return this.completedIds().has(taskId);
  }

  isTaskCompleting(taskId: string): boolean {
    return this.completingIds().has(taskId);
  }

  formatDueDate(dateStr: string | null, isOverdue: boolean): string {
    if (!dateStr) return 'No due date';

    const due = new Date(dateStr);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (isOverdue) {
      const pastDays = Math.abs(diffDays);
      if (pastDays === 0) return 'Overdue (Today)';
      if (pastDays === 1) return 'Overdue (Yesterday)';
      return `Overdue (${pastDays}d ago)`;
    }

    if (diffDays === 0) return 'Due Today';
    if (diffDays === 1) return 'Due Tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;

    return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  trackByTaskId(index: number, task: DashboardUrgentTask): string {
    return task.id;
  }
}
