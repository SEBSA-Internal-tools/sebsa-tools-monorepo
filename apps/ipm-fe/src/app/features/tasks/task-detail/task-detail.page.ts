import { Component, ChangeDetectionStrategy, OnInit, inject, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasksService, TASK_STATUSES } from '../../../core/services/tasks.service';
import { SubtasksService } from '../../../core/services/subtasks.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { TaskTypesService } from '../../../core/services/task-types.service';
import type {
  CreateSubtaskRequest,
  Task,
  TaskCategory,
  TaskDependenciesView,
  TaskDependencyType,
  TaskStatus,
  TaskStatusHistoryEntry,
  TaskType,
  TaskComplexityLevel,
  Subtask,
  UpdateSubtaskRequest,
  UpdateTaskRequest,
} from '@sebsa-pm-tool/shared-models';
import {
  CreateSubtaskModalComponent,
  type SubtaskFormData,
} from '../create-subtask/create-subtask-modal.component';
import { ActivityFeedComponent } from '../../../core/components/activity-feed/activity-feed.component';
import { CommentSectionComponent } from '../../../core/components/comment-section/comment-section.component';
import { TaskAttachmentsComponent } from '../../../core/components/task-attachments/task-attachments.component';
import { CustomSelectComponent } from '../../../core/components/custom-select/custom-select.component';
import { CustomDatepickerComponent } from '../../../core/components/custom-datepicker/custom-datepicker.component';
import { ConfirmationService } from '../../../core/services/confirmation.service';

interface TaskEditDraft {
  title: string;
  description: string;
  priorityId: string;
  startDate: string;
  dueDate: string;
  storyPoints: number | null;
  assigneeId: string;
  category: TaskCategory | '';
  taskTypeId: string;
  complexityLevelId: string;
}

@Component({
  standalone: true,
  selector: 'app-task-detail-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CreateSubtaskModalComponent,
    ActivityFeedComponent,
    CommentSectionComponent,
    TaskAttachmentsComponent,
    CustomSelectComponent,
    CustomDatepickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
})
export class TaskDetailPageComponent implements OnInit {
  private readonly confirmation = inject(ConfirmationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private tasksService = inject(TasksService);
  private subtasksService = inject(SubtasksService);
  private projectsService = inject(ProjectsService);
  private taskTypesService = inject(TaskTypesService);
  private cdr = inject(ChangeDetectorRef);

  task = signal<Task | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  isAddSubtaskModalOpen = signal(false);
  /** Non-null while the subtask modal is open in edit mode. */
  editingSubtask = signal<Subtask | null>(null);

  isDirty = signal(false);
  draft: TaskEditDraft = {
    title: '',
    description: '',
    priorityId: '',
    startDate: '',
    dueDate: '',
    storyPoints: null,
    assigneeId: '',
    category: '',
    taskTypeId: '',
    complexityLevelId: '',
  };
  availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);
  availableAssignees = signal<Array<{ id: string; name: string }>>([]);
  projectMembers = signal<Array<{ id: string; name: string }>>([]);
  availableTaskTypes = signal<TaskType[]>([]);
  private readonly complexityLevels = signal<TaskComplexityLevel[]>([]);

  readonly statuses = TASK_STATUSES;
  statusHistory = signal<TaskStatusHistoryEntry[]>([]);
  subtasks = signal<Subtask[]>([]);
  dependencies = signal<TaskDependenciesView | null>(null);
  warnings = signal<string[]>([]);

  // --- Add-dependency mini-form state ---
  newDependencyType: TaskDependencyType = 'BLOCKS';
  readonly dependencyTypeOptions: Array<{ value: TaskDependencyType; label: string }> = [
    { value: 'BLOCKS', label: 'Blocks' },
    { value: 'RELATES_TO', label: 'Relates To' },
    { value: 'DUPLICATE_OF', label: 'Duplicate Of' },
  ];
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
    this.subtasks.set([]);
    this.tasksService.getTaskById(taskId).subscribe({
      next: (task) => {
        this.task.set(task);
        this.populateDraft(task);
        this.isLoading.set(false);
        this.loadStatusHistory(taskId);
        this.loadSubtasks(taskId);
        this.loadDependencies(taskId);
        this.loadDependencyTaskCandidates(task.caseId, taskId);
        this.loadPriorities(task.case.projectId);
        this.loadAssignees(task.case.projectId);
        this.loadTaskTypes();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load task:', err);
        this.errorMessage.set('Unable to load task details. The task may not exist or you may not have access.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadPriorities(projectId: string): void {
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        this.availablePriorities.set([...priorities].sort((a, b) => a.order - b.order));
        this.cdr.markForCheck();
      },
      error: () => {
        this.availablePriorities.set([]);
        this.cdr.markForCheck();
      },
    });
  }

  private loadAssignees(projectId: string): void {
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => {
        const userList: Array<{ id: string; name: string }> = members.map((m) => ({ id: m.user.id, name: m.user.name }));
        this.projectMembers.set([...userList]);
        const currentAssignees = this.task()?.assignees ?? [];
        for (const a of currentAssignees) {
          if (!userList.some((u) => u.id === a.id)) {
            userList.push({ id: a.id, name: a.name });
          }
        }
        this.availableAssignees.set(userList);
        this.cdr.markForCheck();
      },
      error: () => {
        this.projectMembers.set([]);
        const currentAssignees = (this.task()?.assignees ?? []).map((a) => ({ id: a.id, name: a.name }));
        this.availableAssignees.set(currentAssignees);
        this.cdr.markForCheck();
      },
    });
  }

  private loadTaskTypes(): void {
    this.taskTypesService.list().subscribe({
      next: (types) => this.availableTaskTypes.set(types.filter((t) => t.isActive)),
      error: () => this.availableTaskTypes.set([]),
    });
  }

  onTaskTypeSelect(taskTypeId: string): void {
    this.draft.taskTypeId = taskTypeId;
    this.draft.complexityLevelId = '';
    this.markDirty();
    this.loadComplexityLevels(taskTypeId);
  }

  availableComplexityLevels() {
    return this.complexityLevels();
  }

  /** Complexity levels are child config entries, fetched for the chosen task
   * type rather than arriving nested with it. */
  private loadComplexityLevels(taskTypeId: string | undefined): void {
    if (!taskTypeId) {
      this.complexityLevels.set([]);
      return;
    }

    this.taskTypesService.listComplexityLevels(taskTypeId).subscribe({
      next: (levels) => this.complexityLevels.set(levels),
      error: () => this.complexityLevels.set([]),
    });
  }

  private loadStatusHistory(taskId: string): void {
    this.tasksService.getStatusHistory(taskId).subscribe({
      next: (history) => this.statusHistory.set(history),
      error: () => this.statusHistory.set([]),
    });
  }

  private loadSubtasks(taskId: string): void {
    this.subtasksService.getByTask(taskId).subscribe({
      next: (subtasks) => this.subtasks.set(subtasks),
      error: () => this.subtasks.set([]),
    });
  }

  private loadDependencies(taskId: string): void {
    this.tasksService.getDependencies(taskId).subscribe({
      next: (view) => this.dependencies.set(view),
      error: () => this.dependencies.set(null),
    });
  }

  private loadDependencyTaskCandidates(caseId: string, excludeTaskId: string): void {
    this.tasksService.searchTasksInCase(caseId).subscribe({
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
  // Live edit
  // ---------------------------------------------------------------------------

  private populateDraft(task: Task): void {
    this.draft = {
      title: task.title,
      description: task.description ?? '',
      priorityId: task.priorityId,
      startDate: '',
      dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
      storyPoints: null,
      assigneeId: task.assignees[0]?.id ?? '',
      category: task.category ?? '',
      taskTypeId: task.taskTypeId ?? '',
      complexityLevelId: task.complexityLevelId ?? '',
    };
    if (task.assignees && task.assignees.length > 0) {
      const current = this.availableAssignees();
      const merged = [...current];
      for (const a of task.assignees) {
        if (!merged.some((u) => u.id === a.id)) {
          merged.push({ id: a.id, name: a.name });
        }
      }
      this.availableAssignees.set(merged);
    }
    this.isDirty.set(false);
    this.cdr.markForCheck();
  }

  currentAssigneeName(): string {
    const assigneeId = this.draft.assigneeId;
    if (!assigneeId) return '';
    const match = this.availableAssignees().find((u) => u.id === assigneeId);
    if (match) return match.name;
    const currentAssignee = this.task()?.assignees?.find((u) => u.id === assigneeId);
    if (currentAssignee) return currentAssignee.name;
    return '';
  }

  markDirty(): void {
    this.isDirty.set(true);
  }

  selectedPriorityColor(): string {
    const match = this.availablePriorities().find((p) => p.id === this.draft.priorityId);
    if (match) return match.color ?? '#64748b';
    const taskPriority = this.task()?.priority;
    if (taskPriority?.id === this.draft.priorityId) return taskPriority.color ?? '#64748b';
    return '#64748b';
  }

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
    if (current.case.isCsoLabeled && !this.draft.category) {
      this.errorMessage.set('Please tag this CSO task as Functional or Technical.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const dto: UpdateTaskRequest = {
      title: this.draft.title,
      description: this.draft.description || undefined,
      priorityId: this.draft.priorityId || undefined,
      dueDate: this.draft.dueDate || undefined,
      assigneeIds: this.draft.assigneeId ? [this.draft.assigneeId] : [],
      category: this.draft.category || undefined,
      taskTypeId: this.draft.taskTypeId || undefined,
      complexityLevelId: this.draft.complexityLevelId || undefined,
    };

    this.tasksService.updateTaskDetails(current.id, dto).subscribe({
      next: (response) => {
        this.task.set(response.task);
        this.populateDraft(response.task);
        this.warnings.set(response.warnings);
        this.isSaving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to save changes. Please try again.');
        this.isSaving.set(false);
      },
    });
  }

  async deleteTask(): Promise<void> {
    const current = this.task();
    if (!current) return;

    if (!(await this.confirmation.confirm({ title: 'Delete task', message: `Delete "${current.title}"?`, consequence: 'This task will be permanently deleted and cannot be restored.', confirmLabel: 'Delete task' }))) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.tasksService.deleteTask(current.id).subscribe({
      next: () => this.router.navigate(['/cases', current.caseId]),
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
  // Status Stepper — clicking a status moves the task there directly, same
  // PATCH path as the Task board drag-drop, so dependency warnings surface
  // here too.
  // ---------------------------------------------------------------------------

  onStatusClick(status: TaskStatus): void {
    const current = this.task();
    if (!current || status === current.status) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tasksService.updateTaskDetails(current.id, { status }).subscribe({
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

  enteredStatusAt(status: TaskStatus): string | null {
    const matching = this.statusHistory().filter((h) => h.toStatus === status);
    if (matching.length === 0) return null;
    return matching[matching.length - 1].changedAt;
  }

  isPastStatus(status: { id: TaskStatus }): boolean {
    const current = this.task();
    if (!current) return false;
    const currentIndex = this.statuses.findIndex((s) => s.id === current.status);
    const statusIndex = this.statuses.findIndex((s) => s.id === status.id);
    return statusIndex < currentIndex;
  }

  // ---------------------------------------------------------------------------
  // Subtasks
  // ---------------------------------------------------------------------------

  openAddSubtaskModal(): void {
    this.isAddSubtaskModalOpen.set(true);
  }

  openEditSubtaskModal(subtask: Subtask): void {
    this.editingSubtask.set(subtask);
  }

  closeSubtaskModal(): void {
    this.isAddSubtaskModalOpen.set(false);
    this.editingSubtask.set(null);
  }

  /** The modal emits `submitted` before `closed`, so `editingSubtask` is
   * still set here when the modal was opened for editing. */
  onSubmitSubtask(formData: SubtaskFormData): void {
    const editing = this.editingSubtask();
    if (editing) {
      this.onUpdateSubtask(editing, formData);
    } else {
      this.onCreateSubtask(formData);
    }
  }

  private onCreateSubtask(formData: SubtaskFormData): void {
    const current = this.task();
    if (!current) return;

    const dto: CreateSubtaskRequest = {
      title: formData.title,
      description: formData.description || undefined,
      dueDate: formData.dueDate || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      subtaskTypeId: formData.subtaskTypeId,
    };

    this.isLoading.set(true);
    this.subtasksService.create(current.id, dto).subscribe({
      next: () => {
        this.closeSubtaskModal();
        this.isLoading.set(false);
        this.loadSubtasks(current.id);
      },
      error: () => {
        this.errorMessage.set('Failed to create subtask. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  private onUpdateSubtask(existing: Subtask, formData: SubtaskFormData): void {
    const dto = this.buildSubtaskUpdate(existing, formData);
    if (Object.keys(dto).length === 0) return;

    this.errorMessage.set('');
    this.subtasksService.update(existing.id, dto).subscribe({
      next: (updated) =>
        this.subtasks.update((list) => list.map((s) => (s.id === updated.id ? updated : s))),
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to update subtask. Please try again.');
      },
    });
  }

  /** Only changed fields are sent, so an untouched save doesn't log a
   * no-op activity entry or re-notify existing assignees. Cleared fields
   * are sent as `null`. */
  private buildSubtaskUpdate(existing: Subtask, formData: SubtaskFormData): UpdateSubtaskRequest {
    const dto: UpdateSubtaskRequest = {};

    if (formData.title !== existing.title) dto.title = formData.title;

    const description = formData.description || null;
    if (description !== (existing.description || null)) dto.description = description;

    const dueDate = formData.dueDate || null;
    if (dueDate !== (existing.dueDate ? existing.dueDate.split('T')[0] : null)) dto.dueDate = dueDate;

    const subtaskTypeId = formData.subtaskTypeId || null;
    if (subtaskTypeId !== existing.subtaskTypeId) dto.subtaskTypeId = subtaskTypeId;

    if (formData.status && formData.status !== existing.status) dto.status = formData.status;

    const before = existing.assignees.map((a) => a.id).sort().join(',');
    const after = [...formData.assigneeIds].sort().join(',');
    if (before !== after) dto.assigneeIds = formData.assigneeIds;

    return dto;
  }

  async deleteSubtask(subtask: Subtask): Promise<void> {
    if (!(await this.confirmation.confirm({ title: 'Delete subtask', message: `Delete "${subtask.title}"?`, consequence: 'This subtask will be permanently deleted and cannot be restored.', confirmLabel: 'Delete subtask' }))) return;

    this.errorMessage.set('');
    this.subtasksService.delete(subtask.id).subscribe({
      next: () => this.subtasks.update((list) => list.filter((s) => s.id !== subtask.id)),
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to delete subtask. Please try again.');
      },
    });
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
      .createDependency(current.id, { targetTaskId: this.selectedDependencyTaskId, type: this.newDependencyType })
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

  async removeDependency(dependencyId: string): Promise<void> {
    const current = this.task();
    if (!current) return;
    if (!(await this.confirmation.confirm({ title: 'Remove dependency', message: 'Remove this dependency from the task?', consequence: 'The link between these tasks will be removed. The tasks themselves will remain.', confirmLabel: 'Remove dependency' }))) return;

    this.tasksService.removeDependency(current.id, dependencyId).subscribe({
      next: () => this.loadDependencies(current.id),
      error: () => this.errorMessage.set('Failed to remove dependency.'),
    });
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
