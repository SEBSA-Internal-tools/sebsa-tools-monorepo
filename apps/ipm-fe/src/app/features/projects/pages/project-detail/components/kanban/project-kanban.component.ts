import { Component, Input, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
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
export class ProjectKanbanComponent implements OnInit {
  @Input() projectId!: string;

  private tasksService = inject(TasksService);
  private projectsService = inject(ProjectsService);

  readonly workflowStages = signal<WorkflowStage[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly isAddingColumn = signal(false);
  readonly isCreatingColumn = signal(false);

  newColumnName = '';
  draggedTask: TaskView | null = null;
  tasks: { [key: string]: TaskView[] } = {};

  ngOnInit(): void {
    this.tasksService.tasks$.subscribe(() => this.loadTasks());
    this.loadWorkflowStages();
  }

  private loadWorkflowStages(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.projectsService.getWorkflowStages(this.projectId).subscribe({
      next: (stages) => {
        this.workflowStages.set(stages);
        this.initializeTasksByStage(stages);
        this.loadTasks();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load workflow stages:', err);
        this.errorMessage.set('Failed to load workflow stages.');
        this.isLoading.set(false);
      },
    });
  }

  private initializeTasksByStage(stages: WorkflowStage[]): void {
    this.tasks = {};
    stages.forEach((stage) => {
      this.tasks[stage.id] = [];
    });
  }

  loadTasks(): void {
    const allTasks = this.tasksService.getTasksByProject(this.projectId);
    const stages = this.workflowStages();

    stages.forEach((stage) => {
      this.tasks[stage.id] = allTasks.filter((t: TaskView) => t.status === stage.id);
    });
  }

  onDragStart(task: TaskView): void {
    this.draggedTask = task;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, newStatus: string): void {
    event.preventDefault();

    if (!this.draggedTask) return;

    const task = this.draggedTask;
    const previousStatus = Object.keys(this.tasks).find(
      (key) => this.tasks[key].some((t) => t.id === task.id)
    );

    if (previousStatus && previousStatus !== newStatus) {
      this.tasks[previousStatus] = this.tasks[previousStatus].filter(
        (t) => t.id !== task.id
      );

      this.tasksService
        .updateTaskStatus(task.id, newStatus, this.workflowStages())
        .subscribe({
          next: (updatedTask) => {
            this.tasks[newStatus] = [...this.tasks[newStatus], updatedTask];
          },
          error: () => {
            this.tasks[previousStatus] = [...this.tasks[previousStatus], task];
          },
        });
    }

    this.draggedTask = null;
  }

  onDragEnd(): void {
    this.draggedTask = null;
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

  onCreateFirstColumn(): void {
    this.newColumnName = '';
    this.isAddingColumn.set(true);
  }

  onAddColumn(): void {
    this.newColumnName = '';
    this.isAddingColumn.set(true);
  }

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
        const updated = [...this.workflowStages(), newStage];
        this.workflowStages.set(updated);
        this.tasks[newStage.id] = [];
        this.isAddingColumn.set(false);
        this.newColumnName = '';
        this.isCreatingColumn.set(false);
      },
      error: (err) => {
        console.error('Failed to create workflow stage:', err);
        const errorMsg = err?.error?.message || 'Failed to create column.';
        this.errorMessage.set(errorMsg);
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