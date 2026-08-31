import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  inject,
  signal,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../projects/services/projects.service';
import {
  PriorityModalComponent,
  PriorityFormData,
} from '../../projects/components/modals/priority-modal/priority-modal.component';

type AssigneeCandidate = { id: string; name: string; email: string };

export interface TaskFormData {
  title: string;
  /** Array of user UUIDs — matches `assigneeIds` in POST /api/tasks */
  assigneeIds: string[];
  /** UUID of the selected priority */
  priorityId?: string;
  dueDate: string;
  description: string;
}

/** Creates a Task under a fixed, already-known Case — `caseId`/`projectId`
 * are always supplied by the caller (case detail page, task detail's Add
 * Subtask... no: subtasks use their own modal now). Unlike the old
 * combined Task modal, there's no type/CSO/category picker here anymore —
 * those live on the parent Case. */
@Component({
  standalone: true,
  selector: 'app-create-task-modal',
  imports: [CommonModule, FormsModule, PriorityModalComponent],
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input({ required: true }) projectId = '';
  @Input() caseTitle = '';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskFormData>();

  private readonly projectsService = inject(ProjectsService);

  @ViewChild('assigneeDropdownRef') assigneeDropdownRef?: ElementRef<HTMLElement>;

  taskTitle = '';
  selectedAssigneeIds: string[] = [];
  assigneeSearch = '';
  priorityId?: string;
  priority = '';
  readonly availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);

  selectPriority(prio: { id: string; name: string }) {
    this.priorityId = prio.id;
    this.priority = prio.name;
  }

  dueDate = '';
  description = '';

  readonly availableAssignees = signal<AssigneeCandidate[]>([]);
  readonly isLoadingUsers = signal(false);
  readonly userError = signal('');
  readonly isAssigneeDropdownOpen = signal(false);
  readonly isPriorityModalOpen = signal(false);

  ngOnChanges(): void {
    if (this.isOpen && this.projectId) {
      this.loadPriorities(this.projectId);
      this.loadAssignees(this.projectId);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isAssigneeDropdownOpen()) return;
    const target = event.target as Node;
    const isInsideDropdown = this.assigneeDropdownRef?.nativeElement?.contains(target);
    if (!isInsideDropdown) {
      this.isAssigneeDropdownOpen.set(false);
      this.assigneeSearch = '';
    }
  }

  private loadAssignees(projectId: string): void {
    this.isLoadingUsers.set(true);
    this.userError.set('');
    this.selectedAssigneeIds = [];
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => {
        this.availableAssignees.set(members.map((m) => m.user));
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.userError.set('Could not load project members.');
        this.availableAssignees.set([]);
        this.isLoadingUsers.set(false);
      },
    });
  }

  private loadPriorities(projectId: string): void {
    this.priorityId = undefined;
    this.priority = '';
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        const sorted = [...priorities].sort((a, b) => a.order - b.order);
        this.availablePriorities.set(sorted);
        if (sorted.length > 0) this.selectPriority(sorted[0]);
      },
      error: () => this.availablePriorities.set([]),
    });
  }

  openAddPriorityModal(): void {
    if (!this.projectId) return;
    this.isPriorityModalOpen.set(true);
  }

  closePriorityModal(): void {
    this.isPriorityModalOpen.set(false);
  }

  onPrioritySubmit(formData: PriorityFormData): void {
    if (!this.projectId) return;
    this.projectsService
      .createProjectPriority(this.projectId, { name: formData.name, color: formData.color ?? undefined, order: formData.order })
      .subscribe({
        next: (created) => {
          this.closePriorityModal();
          this.projectsService.getProjectPriorities(this.projectId).subscribe({
            next: (priorities) => {
              const sorted = [...priorities].sort((a, b) => a.order - b.order);
              this.availablePriorities.set(sorted);
              const createdPrio = sorted.find((p) => p.id === created.id) || sorted[0];
              if (createdPrio) this.selectPriority(createdPrio);
            },
          });
        },
        error: (err) => {
          console.error('Failed to create priority:', err);
          alert(err.error?.message || 'Failed to create priority.');
        },
      });
  }

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const formData: TaskFormData = {
      title: this.taskTitle,
      assigneeIds: this.selectedAssigneeIds,
      priorityId: this.priorityId,
      dueDate: this.dueDate,
      description: this.description,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.taskTitle = '';
    this.selectedAssigneeIds = [];
    this.assigneeSearch = '';
    this.isAssigneeDropdownOpen.set(false);
    this.priorityId = undefined;
    this.dueDate = '';
    this.description = '';
    this.availableAssignees.set([]);
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  toggleAssigneeDropdown(event?: Event): void {
    event?.stopPropagation();
    this.isAssigneeDropdownOpen.update((isOpen) => !isOpen);
  }

  openAssigneeDropdown(): void {
    this.isAssigneeDropdownOpen.set(true);
  }

  onAssigneeSearch(): void {
    if (!this.isAssigneeDropdownOpen()) this.isAssigneeDropdownOpen.set(true);
  }

  getFilteredAssignees(): AssigneeCandidate[] {
    const term = this.assigneeSearch.trim().toLowerCase();
    if (!term) return this.availableAssignees();
    return this.availableAssignees().filter(
      (user) => user.name.toLowerCase().includes(term) || user.email?.toLowerCase().includes(term),
    );
  }

  isAssigneeSelected(userId: string): boolean {
    return this.selectedAssigneeIds.includes(userId);
  }

  toggleAssignee(userId: string): void {
    if (this.isAssigneeSelected(userId)) {
      this.selectedAssigneeIds = this.selectedAssigneeIds.filter((id) => id !== userId);
    } else {
      this.selectedAssigneeIds = [...this.selectedAssigneeIds, userId];
    }
  }

  removeAssignee(userId: string, event: Event): void {
    event.stopPropagation();
    this.selectedAssigneeIds = this.selectedAssigneeIds.filter((id) => id !== userId);
  }

  clearAssignees(event: Event): void {
    event.stopPropagation();
    this.selectedAssigneeIds = [];
  }

  selectedAssignees(): AssigneeCandidate[] {
    return this.availableAssignees().filter((user) => this.selectedAssigneeIds.includes(user.id));
  }

  getUserInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}
