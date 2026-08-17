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
import { SprintService } from '../../projects/services/sprint.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { TasksService } from '../../../core/services/tasks.service';
import type { SprintSummary } from '@sebsa-pm-tool/shared-models';
import type { UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../projects/services/projects.service';

export interface TaskFormData {
  title: string;
  projectId: string;
  /** Array of user UUIDs — matches `assigneeIds` in POST /api/tasks */
  assigneeIds: string[];
  /** Uppercase to match shared-models TaskPriority: CRITICAL | HIGH | MEDIUM | LOW */
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** Task type: EPIC | STORY | TASK | BUG | IMPROVEMENT */
  type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT';
  dueDate: string;
  description: string;
  sprintId?: string;
  isCsoLabeled: boolean;
  parentTaskId?: string;
}

@Component({
  standalone: true,
  selector: 'app-create-task-modal',
  imports: [CommonModule, FormsModule],
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
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskFormData>();

  private readonly sprintService = inject(SprintService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly projectsService = inject(ProjectsService);
  private readonly tasksService = inject(TasksService);

  taskTitle = '';
  /** Holds the UUID of the selected assignee (bound to user.id in the dropdown) */
  selectedAssigneeId = '';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
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

  readonly availableProjects = signal<Array<{ id: string; name: string; isCsoProject: boolean }>>([]);
  readonly availableSprints = signal<SprintSummary[]>([]);
  readonly availableAssignees = signal<UserAdminSummary[]>([]);
  readonly availableParentTasks = signal<Array<{ id: string; title: string }>>([]);
  readonly isLoadingSprints = signal(false);
  readonly isLoadingUsers = signal(false);
  readonly sprintError = signal('');
  readonly userError = signal('');

  ngOnChanges(): void {
    if (this.isOpen) {
      // Load users from real backend on every open
      this.loadUsers();

      if (this.projectId) {
        this.selectedProjectId = this.projectId;
        this.selectedProjectName = this.projectName;
        this.loadSprints(this.projectId);
        if (!this.lockedParentTaskId) this.loadParentTaskCandidates(this.projectId);
      } else {
        this.loadAvailableProjects();
      }
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
      if (!this.lockedParentTaskId) this.loadParentTaskCandidates(projectId);
    }
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

    const formData: TaskFormData = {
      title: this.taskTitle,
      projectId: finalProjectId,
      // Wrap the selected UUID in an array; omit if nothing was selected
      assigneeIds: this.selectedAssigneeId ? [this.selectedAssigneeId] : [],
      priority: this.priority,
      type: this.selectedType,
      dueDate: this.dueDate,
      description: this.description,
      sprintId: this.selectedSprintId || undefined,
      isCsoLabeled: this.isTargetProjectCso() || this.isCsoLabeled,
      parentTaskId: this.lockedParentTaskId || this.selectedParentTaskId || undefined,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.taskTitle = '';
    this.selectedAssigneeId = '';
    this.priority = 'MEDIUM';
    this.selectedType = 'TASK';
    this.dueDate = '';
    this.description = '';
    this.selectedSprintId = '';
    this.isCsoLabeled = false;
    this.selectedParentTaskId = '';
    this.parentTaskSearch = '';
    this.availableSprints.set([]);
    this.availableAssignees.set([]);
    this.availableParentTasks.set([]);
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
