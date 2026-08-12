import { Component, Input, ChangeDetectionStrategy, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TasksService, type TaskListView } from '../../../../../../core/services/tasks.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  standalone: true,
  selector: 'project-task-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-task-list.component.html',
  styleUrl: './project-task-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTaskListComponent implements OnInit {
  @Input() projectId!: string;

  private tasksService = inject(TasksService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  tasks: TaskListView[] = [];
  sortBy: 'status' | 'priority' | 'date' = 'status';

  ngOnInit(): void {
    this.tasksService.tasks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTasks());
    this.loadTasks();
  }

  loadTasks(): void {
    this.tasksService.getTaskList(this.projectId).subscribe((tasks) => {
      this.tasks = tasks;
      this.sortTasks();
      this.cdr.markForCheck();
    });
  }

  openTask(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  sortTasks(): void {
    switch (this.sortBy) {
      case 'priority':
        this.tasks.sort((a, b) => {
          const priorityOrder = { High: 0, Medium: 1, Low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 999) -
                 (priorityOrder[b.priority as keyof typeof priorityOrder] || 999);
        });
        break;
      case 'date':
        this.tasks.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
        break;
      case 'status':
      default:
        this.tasks.sort((a, b) => {
          const statusOrder = { new: 0, todo: 1, inprogress: 2, done: 3 };
          return (statusOrder[a.statusLabel as keyof typeof statusOrder] || 999) -
                 (statusOrder[b.statusLabel as keyof typeof statusOrder] || 999);
        });
    }
  }

  onSortChange(sort: typeof this.sortBy): void {
    this.sortBy = sort;
    this.sortTasks();
  }

  getStatusLabel(statusLabel: TaskListView['statusLabel']): string {
    const labels: { [key: string]: string } = {
      new: 'New',
      todo: 'To Do',
      inprogress: 'In Progress',
      done: 'Done',
    };
    return labels[statusLabel] || statusLabel;
  }

  getPriorityClass(priority: string): string {
    return priority.toLowerCase();
  }

  getTaskInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
