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
import { SprintService } from '../../projects/services/sprint.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { TasksService } from '../../../core/services/tasks.service';
import type { SprintSummary } from '@sebsa-pm-tool/shared-models';
import type { UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import type { TaskCategory } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../projects/services/projects.service';
import {
  PriorityModalComponent,
  PriorityFormData,
} from '../../projects/components/modals/priority-modal/priority-modal.component';

export interface TaskFormData {
  title: string;
  projectId: string;
  /** Array of user UUIDs — matches `assigneeIds` in POST /api/tasks */
  assigneeIds: string[];
  /** UUID of the selected priority */
  priorityId?: string;
  /** Task type: EPIC | STORY | TASK | BUG | IMPROVEMENT */
  type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT';
  dueDate: string;
  description: string;
  sprintId?: string;
  isCsoLabeled: boolean;
  parentTaskId?: string;
  /** Functional/Technical tag. Required when the task ends up CSO-labeled. */
  category?: TaskCategory;
}

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
  @Input() projectId = '';
  @Input() projectName = '';
  /** Whether the fixed `projectId` above is a CSO project — only meaningful
   *  when `projectId` is set. Hides the CSO checkbox and forces the task
   *  CSO-labeled, since all tasks in a CSO project sync automatically. */
  @Input() isProjectCso = false;
  /** Always treats the task as CSO-labeled and hides the checkbox,
   *  regardless of which project ends up selected — used by the CSO
   *  Overview's "Create Task" entry point, where the task is CSO by
   *  definition no matter which project it's filed under. */
  @Input() forceCsoLabeled = false;
  /** When set (the "Add Subtask" entry point on the task detail page), the
   *  parent-task picker is replaced with a fixed "Subtask of" line and the
   *  task is always created with this as its parent. */
  @Input() lockedParentTaskId = '';
  @Input() lockedParentTaskTitle = '';
  /** When set (the CSO Functional/Technical queue's "Create Task" entry
   *  point), the category picker is hidden and every task is created with
   *  this fixed tag instead of letting the user choose. */
  @Input() lockedCategory: TaskCategory | '' = '';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskFormData>();

  private readonly sprintService = inject(SprintService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly projectsService = inject(ProjectsService);
  private readonly tasksService = inject(TasksService);
  private readonly elementRef = inject(ElementRef);
  
  @ViewChild('assigneeDropdownRef') assigneeDropdownRef?: ElementRef<HTMLElement>;

  taskTitle = '';
  /** Holds the UUID of the selected assignee (bound to user.id in the dropdown) */
  selectedAssigneeIds: string[] = [];
  assigneeSearch = '';
  priorityId?: string;
  /** Backward-compatible priority label for UI display */
  priority = '';
  readonly availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);

  /** Set priority by selecting a dynamic priority object */
  selectPriority(prio: { id: string; name: string }) {
    this.priorityId = prio.id;
    this.priority = prio.name;
  }
  selectedType: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT' = 'TASK';
  dueDate = '';
  description = '';
  selectedSprintId = '';
  selectedProjectId = '';
  selectedProjectName = '';
  isCsoLabeled = false;
  /** UUID of an existing task picked as this task's parent — ignored when
   *  `lockedParentTaskId` is set. */
  selectedParentTaskId = '';
  parentTaskSearch = '';
  selectedCategory: TaskCategory | '' = '';

  readonly availableProjects = signal<Array<{ id: string; name: string; isCsoProject: boolean }>>([]);
  readonly availableSprints = signal<SprintSummary[]>([]);
  readonly availableAssignees = signal<UserAdminSummary[]>([]);
  readonly availableParentTasks = signal<Array<{ id: string; title: string }>>([]);
  readonly isLoadingSprints = signal(false);
  readonly isLoadingUsers = signal(false);
  readonly sprintError = signal('');
  readonly userError = signal('');
  readonly isAssigneeDropdownOpen = signal(false);
  readonly isPriorityModalOpen = signal(false);

  ngOnChanges(): void {
    if (this.isOpen) {
      // Load users from real backend on every open
      this.loadUsers();

      if (this.projectId) {
        this.selectedProjectId = this.projectId;
        this.selectedProjectName = this.projectName;
        this.loadSprints(this.projectId);
        this.loadPriorities(this.projectId);
        if (!this.lockedParentTaskId) this.loadParentTaskCandidates(this.projectId);
      } else {
        this.loadAvailableProjects();
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isAssigneeDropdownOpen()) {
      return;
    }
    const target = event.target as Node;
    // Close the dropdown if the click is outside the assignee dropdown container
    const isInsideDropdown = this.assigneeDropdownRef?.nativeElement?.contains(target);
    if (!isInsideDropdown) {
      this.isAssigneeDropdownOpen.set(false);
      this.assigneeSearch = '';
    }
  }

  /** Fetch all users from GET /api/users/all */
  private loadUsers(): void {
    this.isLoadingUsers.set(true);
    this.userError.set('');
    this.userAdminService.listAll().subscribe({
      next: (users) => {
        this.availableAssignees.set(users.filter((u) => u.isActive));
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.userError.set('Could not load users.');
        this.availableAssignees.set([]);
        this.isLoadingUsers.set(false);
      },
    });
  }

  /** Fetch sprints from GET /api/projects/:id/sprints */
  private loadSprints(projectId: string): void {
    this.isLoadingSprints.set(true);
    this.sprintError.set('');
    this.selectedSprintId = '';
    this.sprintService.getSprints(projectId).subscribe({
      next: (sprints) => {
        this.availableSprints.set(sprints);
        this.isLoadingSprints.set(false);
      },
      error: () => {
        this.sprintError.set('Could not load sprints.');
        this.availableSprints.set([]);
        this.isLoadingSprints.set(false);
      },
    });
  }

  private loadAvailableProjects(): void {
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        const mapped = projects.map((p) => ({
          id: p.id,
          name: p.name,
          isCsoProject: p.isCsoProject,
        }));
        this.availableProjects.set(mapped);
        if (mapped.length > 0 && !this.selectedProjectId) {
          this.onProjectSelect(mapped[0].id);
        }
      },
      error: () => this.availableProjects.set([]),
    });
  }

  onProjectSelect(projectId: string): void {
    this.selectedProjectId = projectId;
    const project = this.availableProjects().find((p) => p.id === projectId);
    if (project) {
      this.selectedProjectName = project.name;
      this.loadSprints(projectId);
      this.loadPriorities(projectId);
      if (!this.lockedParentTaskId) this.loadParentTaskCandidates(projectId);
    }
  }

  /** Fetch priorities from GET /api/projects/:id/priorities */
  private loadPriorities(projectId: string): void {
    this.priorityId = undefined;
    this.priority = '';
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        const sorted = [...priorities].sort((a, b) => a.order - b.order);
        this.availablePriorities.set(sorted);
        // Auto-select the first (default) priority
        if (sorted.length > 0) {
          this.selectPriority(sorted[0]);
        }
      },
      error: () => this.availablePriorities.set([]),
    });
  }

  openAddPriorityModal(): void {
    const targetProjectId = this.projectId || this.selectedProjectId;
    if (!targetProjectId) {
      alert('Please select a project first');
      return;
    }
    this.isPriorityModalOpen.set(true);
  }

  closePriorityModal(): void {
    this.isPriorityModalOpen.set(false);
  }

  onPrioritySubmit(formData: PriorityFormData): void {
    const targetProjectId = this.projectId || this.selectedProjectId;
    if (!targetProjectId) return;

    this.projectsService
      .createProjectPriority(targetProjectId, {
        name: formData.name,
        color: formData.color ?? undefined,
        order: formData.order,
      })
      .subscribe({
        next: (created) => {
          this.closePriorityModal();
          this.projectsService.getProjectPriorities(targetProjectId).subscribe({
            next: (priorities) => {
              const sorted = [...priorities].sort((a, b) => a.order - b.order);
              this.availablePriorities.set(sorted);
              const createdPrio = sorted.find((p) => p.id === created.id) || sorted[0];
              if (createdPrio) {
                this.selectPriority(createdPrio);
              }
            },
          });
        },
        error: (err) => {
          console.error('Failed to create priority:', err);
          alert(err.error?.message || 'Failed to create priority.');
        },
      });
  }

  /** Loads this project's tasks once, for the optional "Parent Task" picker
   *  — filtered client-side as the user types, same pattern as the member
   *  search elsewhere in this app. */
  private loadParentTaskCandidates(projectId: string): void {
    this.selectedParentTaskId = '';
    this.parentTaskSearch = '';
    this.tasksService.searchTasksInProject(projectId).subscribe({
      next: (tasks) => this.availableParentTasks.set(tasks.map((t) => ({ id: t.id, title: t.title }))),
      error: () => this.availableParentTasks.set([]),
    });
  }

  getFilteredParentTasks(): Array<{ id: string; title: string }> {
    const term = this.parentTaskSearch.trim().toLowerCase();
    return this.availableParentTasks().filter(
      (t) => !term || t.title.toLowerCase().includes(term),
    );
  }

  selectParentTask(taskId: string): void {
    this.selectedParentTaskId = taskId;
    this.parentTaskSearch = '';
  }

  clearParentTask(): void {
    this.selectedParentTaskId = '';
  }

  selectedParentTaskTitle(): string {
    return this.availableParentTasks().find((t) => t.id === this.selectedParentTaskId)?.title ?? '';
  }

  /** Whether the task being created will land in a CSO project — either the
   *  fixed `projectId` context, or whichever project is currently picked in
   *  the project-picker. Drives whether the CSO checkbox is shown at all. */
  isTargetProjectCso(): boolean {
    if (this.forceCsoLabeled) return true;
    if (this.projectId) return this.isProjectCso;
    const selected = this.availableProjects().find((p) => p.id === this.selectedProjectId);
    return selected?.isCsoProject ?? false;
  }

  /** Label shown in the sprint dropdown for each sprint */
  getSprintLabel(sprint: SprintSummary): string {
    const statusLabel: Record<string, string> = {
      PLANNED: 'Planned',
      ACTIVE: 'Active',
      COMPLETED: 'Completed',
    };
    return `${sprint.name} (${statusLabel[sprint.status] ?? sprint.status})`;
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

    const finalProjectId = this.projectId || this.selectedProjectId;
    if (!finalProjectId) {
      alert('Please select a project');
      return;
    }

    const finalIsCsoLabeled = this.isTargetProjectCso() || this.isCsoLabeled;
    if (finalIsCsoLabeled && !this.lockedCategory && !this.selectedCategory) {
      alert('Please tag this CSO task as Functional or Technical');
      return;
    }

    const formData: TaskFormData = {
      title: this.taskTitle,
      projectId: finalProjectId,
      // Wrap the selected UUID in an array; omit if nothing was selected
      assigneeIds: this.selectedAssigneeIds,
      priorityId: this.priorityId,
      type: this.selectedType,
      dueDate: this.dueDate,
      description: this.description,
      sprintId: this.selectedSprintId || undefined,
      isCsoLabeled: finalIsCsoLabeled,
      parentTaskId: this.lockedParentTaskId || this.selectedParentTaskId || undefined,
      category: this.lockedCategory || this.selectedCategory || undefined,
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
    this.selectedType = 'TASK';
    this.dueDate = '';
    this.description = '';
    this.selectedSprintId = '';
    this.isCsoLabeled = false;
    this.selectedParentTaskId = '';
    this.parentTaskSearch = '';
    this.selectedCategory = '';

    this.availableSprints.set([]);
    this.availableAssignees.set([]);
    this.availableParentTasks.set([]);
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
  // Typing should always keep the list open.
  if (!this.isAssigneeDropdownOpen()) {
    this.isAssigneeDropdownOpen.set(true);
  }
  }

  getFilteredAssignees(): UserAdminSummary[] {
    const term = this.assigneeSearch.trim().toLowerCase();

    if (!term) {
      return this.availableAssignees();
    }

    return this.availableAssignees().filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term),
    );
  }

  isAssigneeSelected(userId: string): boolean {
    return this.selectedAssigneeIds.includes(userId);
  }

  toggleAssignee(userId: string): void {
    if (this.isAssigneeSelected(userId)) {
      this.selectedAssigneeIds = this.selectedAssigneeIds.filter(
        (id) => id !== userId,
      );
    } else {
      this.selectedAssigneeIds = [
        ...this.selectedAssigneeIds,
        userId,
      ];
    }
  }

  removeAssignee(userId: string, event: Event): void {
    event.stopPropagation();

    this.selectedAssigneeIds = this.selectedAssigneeIds.filter(
      (id) => id !== userId,
    );
  }

  clearAssignees(event: Event): void {
    event.stopPropagation();

    this.selectedAssigneeIds = [];
  }

  selectedAssignees(): UserAdminSummary[] {
    return this.availableAssignees().filter((user) =>
      this.selectedAssigneeIds.includes(user.id),
    );
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
