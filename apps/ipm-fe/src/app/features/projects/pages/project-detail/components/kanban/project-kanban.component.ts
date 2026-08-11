import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TasksService, type TaskView } from '../../../../../../core/services/tasks.service';
import { ProjectsService } from '../../../../services/projects.service';

export interface WorkflowStage {
  id: string;
  name: string;
  order: number;
}

@Component({
  standalone: true,
  selector: 'project-kanban',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-kanban.component.html',
  styleUrl: './project-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectKanbanComponent implements OnInit, OnDestroy {
  @Input() projectId!: string;

  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);

  // ─── Signals ──────────────────────────────────────────────────────────────
  readonly workflowStages = signal<WorkflowStage[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly isAddingColumn = signal(false);
  readonly isCreatingColumn = signal(false);

  readonly tasks = computed<Record<string, TaskView[]>>(() => {
    const stages = this.workflowStages();
    const allTasks = this.tasksService.tasks();

    const map: Record<string, TaskView[]> = {};
    for (const stage of stages) {
      map[stage.id] = allTasks.filter(
        (t) => t.projectId === this.projectId && t.workflowStageId === stage.id,
      );
    }
    return map;
  });

  // ─── Drag state ───────────────────────────────────────────────────────────
  draggedTask: TaskView | null = null;
  private dragTargetStageId: string | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadWorkflowStages();
  }

  ngOnDestroy(): void {}

  private loadWorkflowStages(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.projectsService.getWorkflowStages(this.projectId).subscribe({
      next: (stages) => {
        this.workflowStages.set(stages);
        this.tasksService.loadTasks(this.projectId, stages);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load workflow stages:', err);
        this.errorMessage.set('Failed to load workflow stages.');
        this.isLoading.set(false);
      },
    });
  }

  // ─── Drag & Drop ──────────────────────────────────────────────────────────
  onDragStart(task: TaskView): void {
    this.draggedTask = task;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, targetStageId: string): void {
    event.preventDefault();

    const task = this.draggedTask;
    this.draggedTask = null;

    if (!task || task.workflowStageId === targetStageId) return;

    const originalStageId = task.workflowStageId;
    this.dragTargetStageId = targetStageId;

    // Optimistic update
    this.applyOptimisticMove(task.id, targetStageId);

    // Network call
    this.tasksService
      .updateTaskStatus(task.id, targetStageId, this.workflowStages())
      .subscribe({
        next: () => {
          this.dragTargetStageId = null;
        },
        error: (err) => {
          console.error('Failed to move task:', err);
          this.applyOptimisticMove(task.id, originalStageId);
          this.dragTargetStageId = null;
          this.errorMessage.set('Failed to move task. Please try again.');
        },
      });
  }

  onDragEnd(): void {
    this.draggedTask = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  private applyOptimisticMove(taskId: string, newStageId: string): void {
    this.tasksService.patchTaskStageLocally(taskId, newStageId, this.workflowStages());
  }

  getTaskInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getPriorityClass(priority: string): string {
    return priority.toLowerCase();
  }

  // ─── Column management ────────────────────────────────────────────────────
  onAddColumn(): void {
    this.newColumnName = '';
    this.isAddingColumn.set(true);
  }

  newColumnName = '';

  saveNewColumn(): void {
    const name = this.newColumnName.trim();

    if (!name) {
      this.errorMessage.set('Column name cannot be empty.');
      return;
    }

    this.isCreatingColumn.set(true);
    this.errorMessage.set('');

    const nextOrder = this.workflowStages().length;

    this.projectsService.createWorkflowStage(this.projectId, name, nextOrder).subscribe({
      next: (newStage) => {
        this.workflowStages.set([...this.workflowStages(), newStage]);
        this.isAddingColumn.set(false);
        this.newColumnName = '';
        this.isCreatingColumn.set(false);
      },
      error: (err) => {
        console.error('Failed to create workflow stage:', err);
        this.errorMessage.set(err?.error?.message || 'Failed to create column.');
        this.isCreatingColumn.set(false);
      },
    });
  }

  cancelAddColumn(): void {
    this.isAddingColumn.set(false);
    this.newColumnName = '';
    this.errorMessage.set('');
  }
}