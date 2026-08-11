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

  /**
   * The Kanban column map is a `computed()` Signal derived from the service's
   * task signal and the local workflowStages signal. Angular re-evaluates it
   * automatically whenever either dependency emits a new value — this is what
   * makes `OnPush` + Signal components update without `markForCheck()`.
   *
   * Every derivation produces a brand-new object reference, so Angular's
   * identity check always triggers a template re-render on change.
   */
  readonly tasks = computed<Record<string, TaskView[]>>(() => {
    const stages = this.workflowStages();
    const allTasks = this.tasksService.tasks();

    // Build a fresh map on every emission — new object reference = CD trigger.
    const map: Record<string, TaskView[]> = {};
    for (const stage of stages) {
      map[stage.id] = allTasks.filter(
        (t) => t.projectId === this.projectId && t.workflowStageId === stage.id,
      );
    }
    return map;
  });

  // ─── Drag state (not reactive — purely imperative during a gesture) ───────
  draggedTask: TaskView | null = null;
  /**
   * Optimistic drag target — stores the stageId the user dropped onto while
   * we await the PATCH response. Cleared on success or rollback.
   */
  private dragTargetStageId: string | null = null;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadWorkflowStages();
  }

  ngOnDestroy(): void {
    // No manual unsubscription needed — computed() signals are GC'd when the
    // component is destroyed; RxJS subscriptions are one-shot HTTP calls.
  }

  private loadWorkflowStages(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.projectsService.getWorkflowStages(this.projectId).subscribe({
      next: (stages) => {
        this.workflowStages.set(stages);
        // Tell the service to fetch tasks for this project + stages so the
        // computed() map populates immediately.
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

  /**
   * Optimistic drag-and-drop:
   * 1. Immediately move the task in the service's signal state so the UI
   *    responds without waiting for the network round-trip.
   * 2. Fire the PATCH to the backend.
   * 3. On success — the service's tap() replaces the task with the confirmed
   *    server payload, which re-triggers the computed() map cleanly.
   * 4. On error — roll back by restoring the task to its original stage in
   *    the service state, which again re-triggers the computed() map.
   */
  onDrop(event: DragEvent, targetStageId: string): void {
    event.preventDefault();

    const task = this.draggedTask;
    this.draggedTask = null;

    if (!task || task.workflowStageId === targetStageId) return;

    const originalStageId = task.workflowStageId;
    this.dragTargetStageId = targetStageId;

    // ── Optimistic update ──────────────────────────────────────────────────
    // Move the task in the service's signal so computed() re-derives the map
    // instantly — no visible lag to the user.
    this.applyOptimisticMove(task.id, targetStageId);

    // ── Network call ───────────────────────────────────────────────────────
    this.tasksService
      .updateTaskStatus(task.id, targetStageId, this.workflowStages())
      .subscribe({
        next: () => {
          // The service's tap() already updated the signal with the confirmed
          // server payload. computed() re-derives automatically. Nothing to do.
          this.dragTargetStageId = null;
        },
        error: (err) => {
          console.error('Failed to move task:', err);
          // ── Rollback ────────────────────────────────────────────────────
          // Move the task back to its original stage in the service signal.
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

  /**
   * Applies a stage move directly to the service's task signal without a
   * network call. Used for both optimistic updates and rollbacks.
   */
  private applyOptimisticMove(taskId: string, newStageId: string): void {
    // We access the internal signal via the service's public tasks() signal.
    // Because setState() is private we optimistically patch the local computed
    // by mutating the service state through its exposed updateTaskStatus mock.
    // Instead, we directly update the service's internal state by triggering
    // a local-only signal update. Since TasksService._tasks is private, we
    // leverage the fact that computed() reads from tasksService.tasks() —
    // we inject a temporary patched view by setting the service signal.
    //
    // Best pattern: expose a lightweight patchTaskStage() on the service.
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
        // Append to the workflowStages signal — computed() re-derives the map
        // immediately and renders the new empty column with no extra code.
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