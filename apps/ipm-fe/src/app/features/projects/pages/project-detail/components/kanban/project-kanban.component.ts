import { Component, Input, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TasksService, type WorkflowStage, type TaskView } from '../../../../../../core/services/tasks.service';

type KanbanStatus = 'new' | 'todo' | 'inprogress' | 'done';
interface KanbanColumn {
  id: KanbanStatus;
  label: string;
  color: string;
}

@Component({
  standalone: true,
  selector: 'project-kanban',
  imports: [CommonModule],
  templateUrl: './project-kanban.component.html',
  styleUrl: './project-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class ProjectKanbanComponent implements OnInit {
  @Input() projectId!: string;
  @Input() workflowStages: WorkflowStage[] = [];

  private tasksService = inject(TasksService);

  draggedTask: TaskView | null = null;

  columns: KanbanColumn[] = [
    { id: 'new', label: 'NEW', color: '#94a3b8' },
    { id: 'todo', label: 'TO DO', color: '#f59e0b' },
    { id: 'inprogress', label: 'IN PROGRESS', color: '#3b82f6' },
    { id: 'done', label: 'DONE', color: '#10b981' },
  ];

  tasks: Record<KanbanStatus, TaskView[]> = {
    new: [],
    todo: [],
    inprogress: [],
    done: [],
  };

  ngOnInit(): void {
    this.tasksService.tasks$.subscribe(() => this.loadTasks());
    this.loadTasks();
  }

  loadTasks(): void {
    const allTasks = this.tasksService.getTasksByProject(this.projectId);
    this.tasks = {
      new: allTasks.filter((t) => t.status === 'new'),
      todo: allTasks.filter((t) => t.status === 'todo'),
      inprogress: allTasks.filter((t) => t.status === 'inprogress'),
      done: allTasks.filter((t) => t.status === 'done'),
    };
  }

  onDragStart(task: TaskView): void {
    this.draggedTask = task;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, newStatus: KanbanStatus): void {
    event.preventDefault();

    if (!this.draggedTask) {
      return;
    }

    const task = this.draggedTask;

    const previousStatus = Object.entries(this.tasks).find(([, tasks]) =>
      tasks.some((t) => t.id === task.id),
    )?.[0] as KanbanStatus | undefined;

    if (!previousStatus || previousStatus === newStatus) {
      this.draggedTask = null;
      return;
    }

    // Remove the task from the previous column immediately
    this.tasks = {
      ...this.tasks,
      [previousStatus]: this.tasks[previousStatus].filter(
        (t) => t.id !== task.id,
      ),
    };
    this.tasksService
      .updateTaskStatus(task.id, newStatus, this.workflowStages)
      .subscribe({
        next: (updatedTask) => {
          this.tasks = {
            ...this.tasks,
            [newStatus]: [
              ...this.tasks[newStatus],
              {
                ...updatedTask,
                status: newStatus,
              },
            ],
          };
        },

        error: (error) => {
          console.error('Failed to update task status:', error);
          this.tasks = {
            ...this.tasks,
            [previousStatus]: [
              ...this.tasks[previousStatus],
              task,
            ],
          };
        },
      });

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
}
