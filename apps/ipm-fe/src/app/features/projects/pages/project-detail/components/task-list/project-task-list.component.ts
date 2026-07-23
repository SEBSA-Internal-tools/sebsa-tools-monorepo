import { Component, Input, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService, type Task } from '../../../../services/projects.service';

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

  private projectsService = inject(ProjectsService);

  tasks: Task[] = [];
  sortBy: 'status' | 'priority' | 'date' = 'status';

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    this.tasks = this.projectsService.getTasks(this.projectId);
    this.sortTasks();
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
          return (statusOrder[a.status as keyof typeof statusOrder] || 999) -
                 (statusOrder[b.status as keyof typeof statusOrder] || 999);
        });
    }
  }

  onSortChange(sort: typeof this.sortBy): void {
    this.sortBy = sort;
    this.sortTasks();
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      new: 'New',
      todo: 'To Do',
      inprogress: 'In Progress',
      done: 'Done',
    };
    return labels[status] || status;
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
