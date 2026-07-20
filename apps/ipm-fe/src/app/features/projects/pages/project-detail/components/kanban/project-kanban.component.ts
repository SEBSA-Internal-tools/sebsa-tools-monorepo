import { Component, Input, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService, type Task } from '../../../../services/projects.service';

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

  private projectsService = inject(ProjectsService);

  draggedTask: Task | null = null;

  columns = [
    { id: 'new', label: 'NEW', color: '#94a3b8' },
    { id: 'todo', label: 'TO DO', color: '#f59e0b' },
    { id: 'inprogress', label: 'IN PROGRESS', color: '#3b82f6' },
    { id: 'done', label: 'DONE', color: '#10b981' },
  ];

  tasks: { [key: string]: Task[] } = {
    new: [],
    todo: [],
    inprogress: [],
    done: [],
  };

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    const allTasks = this.projectsService.getTasks(this.projectId);
    this.tasks = {
      new: allTasks.filter((t: Task) => t.status === 'new'),
      todo: allTasks.filter((t: Task) => t.status === 'todo'),
      inprogress: allTasks.filter((t: Task) => t.status === 'inprogress'),
      done: allTasks.filter((t: Task) => t.status === 'done'),
    };
  }

  onDragStart(task: Task): void {
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

      task.status = newStatus as Task['status'];
      this.projectsService.updateTaskStatus(task.id, newStatus);

      this.tasks[newStatus] = [...this.tasks[newStatus], task];
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
}
