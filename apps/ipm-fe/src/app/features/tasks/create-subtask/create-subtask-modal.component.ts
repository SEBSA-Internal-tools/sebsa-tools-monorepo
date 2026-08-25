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

type AssigneeCandidate = { id: string; name: string; email: string };

export interface SubtaskFormData {
  title: string;
  description: string;
  dueDate: string;
  assigneeIds: string[];
}

/** Lean by design — a Subtask has no priority/sprint/CSO/category, just
 * title, description, due date, and assignees. `projectId` is only needed
 * to scope the assignee picker to project members. */
@Component({
  standalone: true,
  selector: 'app-create-subtask-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-subtask-modal.component.html',
  styleUrl: './create-subtask-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateSubtaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input({ required: true }) projectId = '';
  @Input() taskTitle = '';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<SubtaskFormData>();

  private readonly projectsService = inject(ProjectsService);

  @ViewChild('assigneeDropdownRef') assigneeDropdownRef?: ElementRef<HTMLElement>;

  subtaskTitle = '';
  description = '';
  dueDate = '';
  selectedAssigneeIds: string[] = [];
  assigneeSearch = '';

  readonly availableAssignees = signal<AssigneeCandidate[]>([]);
  readonly isLoadingUsers = signal(false);
  readonly userError = signal('');
  readonly isAssigneeDropdownOpen = signal(false);

  ngOnChanges(): void {
    if (this.isOpen && this.projectId) {
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

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.subtaskTitle.trim()) {
      alert('Please enter a subtask title');
      return;
    }

    const formData: SubtaskFormData = {
      title: this.subtaskTitle,
      description: this.description,
      dueDate: this.dueDate,
      assigneeIds: this.selectedAssigneeIds,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.subtaskTitle = '';
    this.description = '';
    this.dueDate = '';
    this.selectedAssigneeIds = [];
    this.assigneeSearch = '';
    this.isAssigneeDropdownOpen.set(false);
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
