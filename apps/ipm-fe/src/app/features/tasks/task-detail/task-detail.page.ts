import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TasksService } from '../../../core/services/tasks.service';
import type { Task, UpdateTaskRequest } from '@sebsa-pm-tool/shared-models';
import { EditTaskModalComponent } from '../edit-task/edit-task-modal.component';

@Component({
  standalone: true,
  selector: 'app-task-detail-page',
  imports: [CommonModule, EditTaskModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
})
export class TaskDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private tasksService = inject(TasksService);

  task = signal<Task | null>(null);
  isLoading = signal(false);
  errorMessage = signal('');
  isEditModalOpen = signal(false);

  ngOnInit(): void {
    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) {
      this.router.navigate(['/tasks']);
      return;
    }
    this.loadTask(taskId);
  }

  private loadTask(taskId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tasksService.getTaskById(taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load task:', err);
        this.errorMessage.set('Unable to load task details. The task may not exist or you may not have access.');
        this.isLoading.set(false);
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  onEditTask(): void {
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
  }

  handleEditSubmit(dto: UpdateTaskRequest): void {
    const currentTask = this.task();

    if (!currentTask) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.tasksService.updateTaskDetails(currentTask.id, dto).subscribe({
      next: (response) => {
        this.task.set(response.task);
        this.isLoading.set(false);
        this.closeEditModal();
      },

      error: (err) => {
        console.error('Failed to update task:', err);
        this.errorMessage.set(
          'Failed to update task. Please try again.',
        );
        this.isLoading.set(false);
      },
    });
  }

  getStatusLabel(stageId: string): string {
    // Since we don't have workflow stages context here, show the raw stage
    return 'Active';
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'CRITICAL':
        return 'priority-critical';
      case 'HIGH':
        return 'priority-high';
      case 'MEDIUM':
        return 'priority-medium';
      case 'LOW':
        return 'priority-low';
      default:
        return 'priority-medium';
    }
  }

  getPriorityLabel(priority: string): string {
    switch (priority) {
      case 'CRITICAL':
        return 'Critical';
      case 'HIGH':
        return 'High';
      case 'MEDIUM':
        return 'Medium';
      case 'LOW':
        return 'Low';
      default:
        return priority;
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'Epic';
      case 'STORY':
        return 'Story';
      case 'TASK':
        return 'Task';
      case 'BUG':
        return 'Bug';
      case 'IMPROVEMENT':
        return 'Improvement';
      case 'TEST':
        return 'Test';
      case 'SUBTASK':
        return 'Subtask';
      default:
        return type;
    }
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'bolt';
      case 'STORY':
        return 'auto_stories';
      case 'TASK':
        return 'task_alt';
      case 'BUG':
        return 'bug_report';
      case 'IMPROVEMENT':
        return 'trending_up';
      case 'TEST':
        return 'science';
      case 'SUBTASK':
        return 'subdirectory_arrow_right';
      default:
        return 'task';
    }
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  navigateToSubtask(subtaskId: string): void {
    this.router.navigate(['/tasks', subtaskId]);
  }
}
