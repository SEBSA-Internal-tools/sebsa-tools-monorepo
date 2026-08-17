import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasksService, WorkflowStage } from '../../core/services/tasks.service';
import { ProjectsService } from '../projects/services/projects.service';
import type {
  CreateTaskRequest,
  Task,
  TaskDependenciesView,
  TaskDependencyType,
  TaskStatusHistoryEntry,
  UpdateTaskRequest,
} from '@sebsa-pm-tool/shared-models';
import { EditTaskModalComponent } from './components/edit-task-modal/edit-task-modal.component';
import {
  CreateTaskModalComponent,
  type TaskFormData,
} from '../projects/components/modals/create-task/create-task-modal.component';

@Component({
  standalone: true,
  selector: 'app-task-detail-page',
  imports: [CommonModule, FormsModule, RouterLink, EditTaskModalComponent, CreateTaskModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
})
export class TaskDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private tasksService = inject(TasksService);
  private projectsService = inject(ProjectsService);

  task = signal<Task | null>(null);
  isLoading = signal(false);
  errorMessage = signal('');
  isEditModalOpen = signal(false);
  isAddSubtaskModalOpen = signal(false);

  workflowStages = signal<WorkflowStage[]>([]);
  statusHistory = signal<TaskStatusHistoryEntry[]>([]);
  dependencies = signal<TaskDependenciesView | null>(null);
  warnings = signal<string[]>([]);

  // --- Add-dependency mini-form state ---
  newDependencyType: TaskDependencyType = 'BLOCKS';
  dependencyTaskSearch = '';
  selectedDependencyTaskId = '';
  availableDependencyTasks = signal<Array<{ id: string; title: string }>>([]);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const taskId = params.get('id');
      if (!taskId) {
        this.router.navigate(['/tasks']);
        return;
      }
      this.loadTask(taskId);
    });
  }

  private loadTask(taskId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.warnings.set([]);
    this.dependencies.set(null);
    this.statusHistory.set([]);
    this.tasksService.getTaskById(taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.isLoading.set(false);
        this.loadWorkflowStages(task.projectId);
        this.loadStatusHistory(taskId);
        this.loadDependencies(taskId);
        this.loadDependencyTaskCandidates(task.projectId, taskId);
      },
      error: (err) => {
        console.error('Failed to load task:', err);
        this.errorMessage.set('Unable to load task details. The task may not exist or you may not have access.');
        this.isLoading.set(false);
      },
    });
  }

  private loadWorkflowStages(projectId: string): void {
    this.projectsService.getWorkflowStages(projectId).subscribe({
      next: (stages) => this.workflowStages.set([...stages].sort((a, b) => a.order - b.order)),
      error: () => this.workflowStages.set([]),
    });
  }

  private loadStatusHistory(taskId: string): void {
    this.tasksService.getStatusHistory(taskId).subscribe({
      next: (history) => this.statusHistory.set(history),
      error: () => this.statusHistory.set([]),
    });
  }

  private loadDependencies(taskId: string): void {
    this.tasksService.getDependencies(taskId).subscribe({
      next: (view) => this.dependencies.set(view),
      error: () => this.dependencies.set(null),
    });
  }

  private loadDependencyTaskCandidates(projectId: string, excludeTaskId: string): void {
    this.tasksService.searchTasksInProject(projectId).subscribe({
      next: (tasks) =>
        this.availableDependencyTasks.set(
          tasks.filter((t) => t.id !== excludeTaskId).map((t) => ({ id: t.id, title: t.title })),
        ),
      error: () => this.availableDependencyTasks.set([]),
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

  deleteTask(): void {
    const current = this.task();
    if (!current) return;

    if (!confirm(`Delete "${current.title}"? This cannot be undone.`)) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.tasksService.deleteTask(current.id).subscribe({
      next: () => {
        if (current.parentTask) {
          this.router.navigate(['/tasks', current.parentTask.id]);
        } else {
          this.router.navigate(['/projects', current.projectId]);
        }
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to delete task.');
        this.isLoading.set(false);
      },
    });
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
        this.warnings.set(response.warnings);
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

  dismissWarnings(): void {
    this.warnings.set([]);
  }

  // ---------------------------------------------------------------------------
  // Status/Flow Stepper — clicking a stage moves the task there directly,
  // same PATCH path as Kanban drag-drop, so dependency warnings surface here too.
  // ---------------------------------------------------------------------------

  onStageClick(stageId: string): void {
    const current = this.task();
    if (!current || stageId === current.workflowStageId) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tasksService.updateTaskDetails(current.id, { workflowStageId: stageId }).subscribe({
      next: (response) => {
        this.task.set(response.task);
        this.warnings.set(response.warnings);
        this.isLoading.set(false);
        this.loadStatusHistory(current.id);
      },
      error: () => {
        this.errorMessage.set('Failed to update task status.');
        this.isLoading.set(false);
      },
    });
  }

  /** The most recent history entry that landed the task in `stageId`, if any
   *  — used to show "since <date>" under the current stage in the stepper. */
  enteredStageAt(stageId: string): string | null {
    const matching = this.statusHistory().filter((h) => h.toStage.id === stageId);
    if (matching.length === 0) return null;
    return matching[matching.length - 1].changedAt;
  }

  /** Whether `stage` sits before the task's current stage in the project's
   *  workflow order — drives the stepper's "completed" styling. */
  isPastStage(stage: WorkflowStage): boolean {
    const current = this.task();
    if (!current) return false;
    const currentStage = this.workflowStages().find((s) => s.id === current.workflowStageId);
    if (!currentStage) return false;
    return stage.order < currentStage.order;
  }

  // ---------------------------------------------------------------------------
  // Add Subtask
  // ---------------------------------------------------------------------------

  openAddSubtaskModal(): void {
    this.isAddSubtaskModalOpen.set(true);
  }

  closeAddSubtaskModal(): void {
    this.isAddSubtaskModalOpen.set(false);
  }

  onCreateSubtask(formData: TaskFormData): void {
    const current = this.task();
    if (!current) return;

    const dto: CreateTaskRequest = {
      projectId: current.projectId,
      parentTaskId: current.id,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priority: formData.priority,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      isCsoLabeled: formData.isCsoLabeled,
    };

    this.isLoading.set(true);
    this.tasksService.createTask(dto, this.workflowStages()).subscribe({
      next: () => {
        this.closeAddSubtaskModal();
        this.loadTask(current.id);
      },
      error: () => {
        this.errorMessage.set('Failed to create subtask. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  navigateToSubtask(subtaskId: string): void {
    this.router.navigate(['/tasks', subtaskId]);
  }

  // ---------------------------------------------------------------------------
  // Dependencies (FSD §5.5)
  // ---------------------------------------------------------------------------

  getFilteredDependencyTasks(): Array<{ id: string; title: string }> {
    const term = this.dependencyTaskSearch.trim().toLowerCase();
    return this.availableDependencyTasks().filter(
      (t) => !term || t.title.toLowerCase().includes(term),
    );
  }

  selectDependencyTask(taskId: string): void {
    this.selectedDependencyTaskId = taskId;
    this.dependencyTaskSearch = '';
  }

  selectedDependencyTaskTitle(): string {
    return this.availableDependencyTasks().find((t) => t.id === this.selectedDependencyTaskId)?.title ?? '';
  }

  clearDependencyTask(): void {
    this.selectedDependencyTaskId = '';
  }

  addDependency(): void {
    const current = this.task();
    if (!current || !this.selectedDependencyTaskId) return;

    this.errorMessage.set('');
    this.tasksService
      .createDependency(current.id, {
        targetTaskId: this.selectedDependencyTaskId,
        type: this.newDependencyType,
      })
      .subscribe({
        next: () => {
          this.selectedDependencyTaskId = '';
          this.dependencyTaskSearch = '';
          this.loadDependencies(current.id);
        },
        error: (err) => {
          this.errorMessage.set(err?.error?.message || 'Failed to add dependency.');
        },
      });
  }

  removeDependency(dependencyId: string): void {
    const current = this.task();
    if (!current) return;
    if (!confirm('Remove this dependency?')) return;

    this.tasksService.removeDependency(current.id, dependencyId).subscribe({
      next: () => this.loadDependencies(current.id),
      error: () => this.errorMessage.set('Failed to remove dependency.'),
    });
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

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
}
