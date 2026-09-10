import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CasesService, CASE_STATUSES, type CaseView } from '../../../../../../core/services/cases.service';
import { TasksService, TASK_STATUSES, type TaskView } from '../../../../../../core/services/tasks.service';
import type { CaseStatus, TaskStatus } from '@sebsa-pm-tool/shared-models';

/** Case & Task board — grouped by status. */
@Component({
  standalone: true,
  selector: 'project-kanban',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-kanban.component.html',
  styleUrl: './project-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectKanbanComponent {
  @Input() projectId!: string;

  private readonly casesService = inject(CasesService);
  private readonly tasksService = inject(TasksService);
  private readonly router = inject(Router);

  readonly caseStatuses = CASE_STATUSES;
  readonly taskStatuses = TASK_STATUSES;
  readonly filterOptions = ['Cases', 'Task'] as const;
  readonly filter = signal<typeof this.filterOptions[number]>('Cases');

  private readonly tasks = signal<TaskView[]>([]);

  readonly cases = computed<Record<string, CaseView[]>>(() => {
    const allCases = this.casesService.cases();
    const map: Record<string, CaseView[]> = {};
    for (const status of this.caseStatuses) {
      map[status.id] = allCases.filter((c) => c.projectId === this.projectId && c.status === status.id);
    }
    return map;
  });

  readonly tasksByStatus = computed<Record<TaskStatus, TaskView[]>>(() => {
    const allTasks = this.tasks();
    const map: Record<TaskStatus, TaskView[]> = {} as Record<TaskStatus, TaskView[]>;
    for (const status of this.taskStatuses) {
      map[status.id as TaskStatus] = allTasks.filter((t) => t.status === status.id);
    }
    return map;
  });

  constructor() {
    effect(() => {
      if (this.projectId && this.filter() === 'Task') {
        this.tasksService.getTasksByProject(this.projectId).subscribe({
          next: (tasks) => this.tasks.set(tasks),
          error: (err) => console.error('Failed to load tasks:', err),
        });
      }
    });
  }

  // ─── Drag state ───────────────────────────────────────────────────────────
  draggedCase: CaseView | null = null;

  onDragStart(kase: CaseView): void {
    this.draggedCase = kase;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, targetStatus: CaseStatus): void {
    event.preventDefault();

    const kase = this.draggedCase;
    this.draggedCase = null;

    if (!kase || kase.status === targetStatus) return;

    const originalStatus = kase.status;
    this.casesService.patchCaseStatusLocally(kase.id, targetStatus);

    this.casesService.updateCaseStatus(kase.id, targetStatus).subscribe({
      error: (err) => {
        console.error('Failed to move case:', err);
        this.casesService.patchCaseStatusLocally(kase.id, originalStatus);
      },
    });
  }

  onDragEnd(): void {
    this.draggedCase = null;
  }

  openCaseDetail(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  openTaskDetail(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  getCaseInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'Epic';
      case 'STORY':
        return 'Story';
      case 'BUG':
        return 'Bug';
      case 'IMPROVEMENT':
        return 'Improvement';
      case 'TEST':
        return 'Test';
      case 'GENERAL':
        return 'General';
      default:
        return type;
    }
  }

  getTypeClass(type: string): string {
    return `type-${type.toLowerCase()}`;
  }
}
