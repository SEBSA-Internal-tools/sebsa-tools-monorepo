import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  Task,
  TaskCategory,
  UpdateTaskRequest,
  UserAdminSummary,
} from '@sebsa-pm-tool/shared-models';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { ProjectsService } from '../../projects/services/projects.service';

@Component({
  standalone: true,
  selector: 'app-edit-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-task-modal.component.html',
  styleUrl: './edit-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;
  /** Backward-compatible priority label */
  priority = '';
  readonly availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<UpdateTaskRequest>();

  private readonly userAdminService = inject(UserAdminService);
  private readonly projectsService = inject(ProjectsService);

  /** Set priority by selecting a dynamic priority object */
  selectPriority(prio: { id: string; name: string }) {
    this.priorityId = prio.id;
    this.priority = prio.name;
  }

  taskTitle = '';
  priorityId?: string;
  startDate = '';
  dueDate = '';
  storyPoints: number | null = null;
  description = '';
  isCsoLabeled = false;
  selectedAssigneeId = '';
  selectedCategory: TaskCategory | '' = '';

  readonly availableAssignees = signal<UserAdminSummary[]>([]);

  ngOnChanges(): void {
    if (this.isOpen && this.task) {
      this.taskTitle = this.task.title || '';
      this.priorityId = this.task.priorityId;
      this.priority = this.task.priority?.name?.toUpperCase() || '';
      this.startDate = this.task.startDate ? this.task.startDate.split('T')[0] : '';
      this.dueDate = this.task.dueDate ? this.task.dueDate.split('T')[0] : '';
      this.storyPoints = this.task.storyPoints ?? null;
      this.description = this.task.description || '';
      this.isCsoLabeled = this.task.isCsoLabeled;
      this.selectedAssigneeId = this.task.assignees[0]?.id ?? '';
      this.selectedCategory = this.task.category ?? '';
      this.loadAssignees();
      if (this.task.projectId) {
        this.loadPriorities(this.task.projectId);
      }
    }
  }

  private loadAssignees(): void {
    this.userAdminService.listAll().subscribe({
      next: (users) => this.availableAssignees.set(users.filter((u) => u.isActive)),
      error: () => this.availableAssignees.set([]),
    });
  }

  /** Fetch priorities from GET /api/projects/:id/priorities */
  private loadPriorities(projectId: string): void {
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        const sorted = [...priorities].sort((a, b) => a.order - b.order);
        this.availablePriorities.set(sorted);
      },
      error: () => this.availablePriorities.set([]),
    });
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }
    if (this.isCsoLabeled && !this.selectedCategory) {
      alert('Please tag this CSO task as Functional or Technical');
      return;
    }

    const formData: UpdateTaskRequest = {
      title: this.taskTitle,
      priorityId: this.priorityId,
      startDate: this.startDate || undefined,
      dueDate: this.dueDate || undefined,
      storyPoints: this.storyPoints !== null ? this.storyPoints : undefined,
      description: this.description || undefined,
      isCsoLabeled: this.isCsoLabeled,
      assigneeIds: this.selectedAssigneeId ? [this.selectedAssigneeId] : [],
      category: this.selectedCategory || undefined,
    };

    this.submitted.emit(formData);
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
