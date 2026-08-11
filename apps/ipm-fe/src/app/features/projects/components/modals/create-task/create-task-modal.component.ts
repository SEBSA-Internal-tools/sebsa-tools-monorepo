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
import { SprintService } from '../../../services/sprint.service';
import { UserAdminService } from '../../../../../core/services/user-admin.service';
import type { SprintSummary } from '@sebsa-pm-tool/shared-models';
import type { UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../../services/projects.service';

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
}

@Component({
  standalone: true,
  selector: 'create-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Input() projectName = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<TaskFormData>();

  private readonly sprintService = inject(SprintService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly projectsService = inject(ProjectsService);

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

  readonly availableProjects = signal<Array<{ id: string; name: string }>>([]);
  readonly availableSprints = signal<SprintSummary[]>([]);
  readonly availableAssignees = signal<UserAdminSummary[]>([]);
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
        const mapped = projects.map((p) => ({ id: p.id, name: p.name }));
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
    }
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
    this.close.emit();
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
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  private resetForm(): void {
    this.taskTitle = '';
    this.selectedAssigneeId = '';
    this.priority = 'MEDIUM';
    this.selectedType = 'TASK';
    this.dueDate = '';
    this.description = '';
    this.selectedSprintId = '';
    this.availableSprints.set([]);
    this.availableAssignees.set([]);
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
