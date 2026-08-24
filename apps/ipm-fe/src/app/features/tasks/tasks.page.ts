import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TasksService, type TaskView } from '../../core/services/tasks.service';
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

  selectedProjectId = signal<string>('');
  selectedStageName = signal<string>('');
  selectedPriority = signal<string>('');

  /** Distinct projects among the assigned tasks, sorted for the filter dropdown. */
  availableProjects = computed<Array<{ id: string; name: string }>>(() => {
    const byId = new Map<string, string>();
    for (const task of this.tasks()) {
      byId.set(task.projectId, task.projectName);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Distinct workflow stage names — varies per project, so this is derived
   *  from the actual data rather than a fixed enum. */
  availableStages = computed<string[]>(() => {
    const names = new Set(this.tasks().map((t) => t.stageName));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  /** Distinct priority names among the assigned tasks. */
  availablePriorities = computed<string[]>(() => {
    const names = new Set(this.tasks().map((t) => t.priority));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  filteredTasks = computed<TaskView[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const projectId = this.selectedProjectId();
    const stageName = this.selectedStageName();
    const priority = this.selectedPriority();

    return this.tasks().filter((t) => {
      if (projectId && t.projectId !== projectId) return false;
      if (stageName && t.stageName !== stageName) return false;
      if (priority && t.priority !== priority) return false;
      if (
        query &&
        !t.title.toLowerCase().includes(query) &&
        !t.category?.toLowerCase().includes(query) &&
        !t.priority.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  });

  clearFilters(): void {
    this.selectedProjectId.set('');
    this.selectedStageName.set('');
    this.selectedPriority.set('');
    this.searchQuery.set('');
  }

  hasActiveFilters = computed<boolean>(
    () => !!(this.selectedProjectId() || this.selectedStageName() || this.selectedPriority() || this.searchQuery()),
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

  /** Workflow stage names are project-defined free text (not a fixed enum),
   *  so the badge color is a best-effort guess from common naming rather
   *  than an exact lifecycle mapping. */
  getStageBadgeClass(stageName: string): string {
    const name = stageName.toLowerCase();
    if (name.includes('done') || name.includes('complet')) return 'success';
    if (name.includes('block')) return 'error';
    if (name.includes('progress') || name.includes('review') || name.includes('test') || name.includes('revis')) return 'warning';
    return 'neutral';
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