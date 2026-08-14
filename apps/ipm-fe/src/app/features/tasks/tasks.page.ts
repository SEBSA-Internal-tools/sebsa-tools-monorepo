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

  filteredTasks = computed<TaskView[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const allTasks = this.tasks();
    if (!query) return allTasks;
    return allTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.category?.toLowerCase().includes(query) ||
        t.priority.toLowerCase().includes(query),
    );
  });

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
    switch (status) {
      case 'new':
        return 'New';
      case 'todo':
        return 'To Do';
      case 'inprogress':
        return 'In Progress';
      case 'done':
        return 'Done';
      default:
        return status;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'new':
        return 'status-new';
      case 'todo':
        return 'status-todo';
      case 'inprogress':
        return 'status-inprogress';
      case 'done':
        return 'status-done';
      default:
        return 'status-todo';
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