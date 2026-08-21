import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasksService, WorkflowStage } from '../../../core/services/tasks.service';
import { ProjectsService } from '../../projects/services/projects.service';
import type {
  CreateTaskRequest,
  Task,
  TaskCategory,
  TaskCategoryAssignmentEntry,
  TaskDependenciesView,
  TaskDependencyType,
  TaskStatusHistoryEntry,
  UpdateTaskRequest,
} from '@sebsa-pm-tool/shared-models';
import {
  CreateTaskModalComponent,
  type TaskFormData,
} from '../create-task/create-task-modal.component';

interface TaskEditDraft {
  title: string;
  description: string;
  priorityId: string;
  startDate: string;
  dueDate: string;
  storyPoints: number | null;
  isCsoLabeled: boolean;
  category: TaskCategory | '';
  assigneeId: string;
}

@Component({
  standalone: true,
  selector: 'app-task-detail-page',
  imports: [CommonModule, FormsModule, RouterLink, CreateTaskModalComponent],
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
  isSaving = signal(false);
  errorMessage = signal('');
  isAddSubtaskModalOpen = signal(false);

  // ---------------------------------------------------------------------------
  // Live edit — the page has no separate "Edit" flow; every editable field
  // binds directly to `draft`, and a "Save Changes" button appears in the
  // header only once `isDirty` is true.
  // ---------------------------------------------------------------------------
  isDirty = signal(false);
  draft: TaskEditDraft = {
    title: '',
    description: '',
    priorityId: '',
    startDate: '',
    dueDate: '',
    storyPoints: null,
    isCsoLabeled: false,
    category: '',
    assigneeId: '',
  };
  availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);
  availableAssignees = signal<Array<{ id: string; name: string }>>([]);

  workflowStages = signal<WorkflowStage[]>([]);
  statusHistory = signal<TaskStatusHistoryEntry[]>([]);
  categoryHistory = signal<TaskCategoryAssignmentEntry[]>([]);
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
    this.categoryHistory.set([]);
    this.tasksService.getTaskById(taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.populateDraft(task);
        this.isLoading.set(false);
        this.loadWorkflowStages(task.projectId);
        this.loadStatusHistory(taskId);
        this.loadCategoryHistory(taskId);
        this.loadDependencies(taskId);
        this.loadDependencyTaskCandidates(task.projectId, taskId);
        this.loadPriorities(task.projectId);
        this.loadAssignees(task.projectId);
      },
      error: (err) => {
        console.error('Failed to load task:', err);
        this.errorMessage.set('Unable to load task details. The task may not exist or you may not have access.');
        this.isLoading.set(false);
      },
    });
  }

  private loadPriorities(projectId: string): void {
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => this.availablePriorities.set([...priorities].sort((a, b) => a.order - b.order)),
      error: () => this.availablePriorities.set([]),
    });
  }

  private loadAssignees(projectId: string): void {
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => this.availableAssignees.set(members.map((m) => m.user)),
      error: () => this.availableAssignees.set([]),
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

  private loadCategoryHistory(taskId: string): void {
    this.tasksService.getCategoryHistory(taskId).subscribe({
      next: (history) => this.categoryHistory.set(history),
      error: () => this.categoryHistory.set([]),
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

  // ---------------------------------------------------------------------------
  // Live edit — every field-level control below is bound to `draft` via
  // [(ngModel)] and calls markDirty() on change; nothing hits the network
  // until saveChanges() runs.
  // ---------------------------------------------------------------------------

  private populateDraft(task: Task): void {
    this.draft = {
      title: task.title,
      description: task.description ?? '',
      priorityId: task.priorityId,
      startDate: task.startDate ? task.startDate.split('T')[0] : '',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      storyPoints: task.storyPoints,
      isCsoLabeled: task.isCsoLabeled,
      category: task.category ?? '',
      assigneeId: task.assignees[0]?.id ?? '',
    };
    this.isDirty.set(false);
  }

  markDirty(): void {
    this.isDirty.set(true);
  }

  selectedPriorityColor(): string {
    const match = this.availablePriorities().find((p) => p.id === this.draft.priorityId);
    if (match) return match.color ?? '#64748b';
    // Priorities load via a separate request from the task itself, so right
    // after load `availablePriorities` can still be empty — fall back to the
    // priority the task response already carries rather than flashing gray.
    const taskPriority = this.task()?.priority;
    if (taskPriority?.id === this.draft.priorityId) return taskPriority.color ?? '#64748b';
    return '#64748b';
  }

  /** The task's own priority, rendered as an extra <option> only when it
   *  isn't already in `availablePriorities` — covers the window before that
   *  separate request resolves, so the priority pill never shows blank. */
  fallbackPriorityOption(): { id: string; name: string } | null {
    const taskPriority = this.task()?.priority;
    if (!taskPriority) return null;
    if (this.availablePriorities().some((p) => p.id === taskPriority.id)) return null;
    return taskPriority;
  }

  discardChanges(): void {
    const current = this.task();
    if (!current) return;
    this.populateDraft(current);
    this.errorMessage.set('');
  }

  saveChanges(): void {
    const current = this.task();
    if (!current || !this.isDirty()) return;

    if (!this.draft.title.trim()) {
      this.errorMessage.set('Task title cannot be empty.');
      return;
    }
    if (this.draft.isCsoLabeled && !this.draft.category) {
      this.errorMessage.set('Please tag this CSO task as Functional or Technical.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const dto: UpdateTaskRequest = {
      title: this.draft.title,
      description: this.draft.description || undefined,
      priorityId: this.draft.priorityId || undefined,
      startDate: this.draft.startDate || undefined,
      dueDate: this.draft.dueDate || undefined,
      storyPoints: this.draft.storyPoints !== null ? this.draft.storyPoints : undefined,
      isCsoLabeled: this.draft.isCsoLabeled,
      assigneeIds: this.draft.assigneeId ? [this.draft.assigneeId] : [],
      category: this.draft.category || undefined,
    };

    this.tasksService.updateTaskDetails(current.id, dto).subscribe({
      next: (response) => {
        this.task.set(response.task);
        this.populateDraft(response.task);
        this.warnings.set(response.warnings);
        this.isSaving.set(false);
        this.loadCategoryHistory(current.id);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to save changes. Please try again.');
        this.isSaving.set(false);
      },
    });
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
      priorityId: formData.priorityId,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      isCsoLabeled: formData.isCsoLabeled,
      category: formData.category,
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

  getCategoryLabel(category: string): string {
    switch (category) {
      case 'FUNCTIONAL':
        return 'Functional';
      case 'TECHNICAL':
        return 'Technical';
      default:
        return category;
    }
  }

  getCategoryIcon(category: string): string {
    return category === 'TECHNICAL' ? 'terminal' : 'psychology';
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
