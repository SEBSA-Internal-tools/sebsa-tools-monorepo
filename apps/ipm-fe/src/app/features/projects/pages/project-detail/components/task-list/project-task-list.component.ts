import { Component, Input, ChangeDetectionStrategy, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TasksService, type TaskView, type WorkflowStage } from '../../../../../../core/services/tasks.service';
import { ProjectsService } from '../../../../services/projects.service';
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
  private projectsService = inject(ProjectsService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  tasks: TaskView[] = [];
  workflowStages: WorkflowStage[] = [];
  sortBy: 'status' | 'priority' | 'date' = 'status';

  ngOnInit(): void {
    this.loadWorkflowStages();
    this.tasksService.tasks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTasks());
  }

  private loadWorkflowStages(): void {
    if (!this.projectId) return;
    this.projectsService.getWorkflowStages(this.projectId).subscribe({
      next: (stages) => {
        this.workflowStages = stages;
        this.loadTasks();
      },
      error: (err) => {
        console.error('Failed to load workflow stages:', err);
      },
    });
  }

  loadTasks(): void {
    if (!this.projectId) return;
    this.tasks = this.tasksService.getTasksByProject(this.projectId);
    this.sortTasks();
    this.cdr.markForCheck();
  }

  openTask(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  getStageName(task: TaskView): string {
    if (!task || !task.workflowStageId) {
      return 'NEW';
    }
    const stage = this.workflowStages.find((s) => s.id === task.workflowStageId);
    if (!stage) {
      return 'UNKNOWN';
    }
    if (stage.order === 0 || stage.name.toLowerCase() === 'backlog') {
      return 'NEW';
    }
    return stage.name.toUpperCase();
  }

  getStatusBadgeClass(task: TaskView): string {
    const stageName = this.getStageName(task).toLowerCase();
    if (stageName === 'new') return 'new';
    if (stageName.includes('todo') || stageName.includes('to do')) return 'todo';
    if (stageName.includes('progress') || stageName.includes('in progress')) return 'inprogress';
    if (stageName.includes('done') || stageName.includes('complete')) return 'done';
    return 'inprogress';
  }

  sortTasks(): void {
    switch (this.sortBy) {
      case 'priority':
        this.tasks.sort((a, b) => {
          const priorityOrder = { High: 0, Medium: 1, Low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999) -
                 (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999);
        });
        break;
      case 'date':
        this.tasks.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
        break;
      case 'status':
      default:
        this.tasks.sort((a, b) => {
          const orderA = this.workflowStages.find((s) => s.id === a.workflowStageId)?.order ?? 999;
          const orderB = this.workflowStages.find((s) => s.id === b.workflowStageId)?.order ?? 999;
          return orderA - orderB;
        });
    }
  }

  onSortChange(sort: typeof this.sortBy): void {
    this.sortBy = sort;
    this.sortTasks();
  }

  getStatusLabel(statusLabel: string): string {
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
