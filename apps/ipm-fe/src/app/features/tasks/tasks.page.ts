import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TasksService, TASK_STATUSES, type TaskView } from '../../core/services/tasks.service';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'app-tasks-page',
  imports: [CommonModule, FormsModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task.page.html',
  styleUrls: ['./task.page.scss'],
})
export class TasksPageComponent implements OnInit {
  private authService = inject(AuthService);
  private tasksService = inject(TasksService);
  private router = inject(Router);

  tasks = signal<TaskView[]>([]);
  searchQuery = signal<string>('');
  isLoading = signal(false);
  errorMessage = signal('');

  readonly statuses = TASK_STATUSES;
  selectedCaseId = signal<string>('');
  selectedStatus = signal<string>('');
  selectedPriority = signal<string>('');

  /** Distinct cases among the assigned tasks, sorted for the filter dropdown. */
  availableCases = computed<Array<{ id: string; title: string }>>(() => {
    const byId = new Map<string, string>();
    for (const task of this.tasks()) {
      byId.set(task.caseId, task.caseTitle);
    }
    return [...byId.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  /** Distinct priority names among the assigned tasks. */
  availablePriorities = computed<string[]>(() => {
    const names = new Set(this.tasks().map((t) => t.priority));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  filteredTasks = computed<TaskView[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const caseId = this.selectedCaseId();
    const status = this.selectedStatus();
    const priority = this.selectedPriority();

    return this.tasks().filter((t) => {
      if (caseId && t.caseId !== caseId) return false;
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (
        query &&
        !t.title.toLowerCase().includes(query) &&
        !t.caseTitle?.toLowerCase().includes(query) &&
        !t.priority.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  });

  clearFilters(): void {
    this.selectedCaseId.set('');
    this.selectedStatus.set('');
    this.selectedPriority.set('');
    this.searchQuery.set('');
  }

  hasActiveFilters = computed<boolean>(
    () => !!(this.selectedCaseId() || this.selectedStatus() || this.selectedPriority() || this.searchQuery()),
  );

  ngOnInit(): void {
    const user = this.authService.currentUser();

    if (!user) {
      this.errorMessage.set(
        'You must be logged in to view your assigned tasks.',
      );
      return;
    }
    this.loadAssignedTasks();
  }

  private loadAssignedTasks(): void {
    this.isLoading.set(true);
    this.tasksService.getMyAssignedTasks().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.isLoading.set(false);
      },

      error: (error) => {
        console.error('Failed to load assigned tasks:', error);

        this.errorMessage.set(
          'Unable to load assigned tasks. Please try again later.',
        );
        this.isLoading.set(false);
      },
    });
  }

  trackByTaskId(_index: number, task: TaskView): string {
    return task.id;
  }

  navigateToTask(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  getStatusLabel(status: string): string {
    return this.statuses.find((s) => s.id === status)?.name ?? status;
  }

  getStageBadgeClass(status: string): string {
    switch (status) {
      case 'DONE':
        return 'success';
      case 'CANCELLED':
      case 'BLOCKED':
        return 'error';
      case 'IN_PROGRESS':
      case 'IN_REVIEW':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'High':
        return 'priority-high';
      case 'Medium':
        return 'priority-medium';
      case 'Low':
        return 'priority-low';
      default:
        return 'priority-medium';
    }
  }
}
