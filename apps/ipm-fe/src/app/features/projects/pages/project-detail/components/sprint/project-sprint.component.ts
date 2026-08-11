import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService, Sprint, Task } from '../../../../services/projects.service';
import { SprintService } from '../../../../services/sprint.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { AddSprintModalComponent } from '../../../../components/modals/add-sprint/add-sprint-modal.component';

interface ExpandedState {
  [sprintId: string]: boolean;
}

type UserRole = 'PM' | 'DEVELOPER' | 'VIEWER';

@Component({
  standalone: true,
  selector: 'project-sprint',
  imports: [CommonModule, AddSprintModalComponent],
  templateUrl: './project-sprint.component.html',
  styleUrl: './project-sprint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSprintComponent implements OnInit {
  @Input() projectId!: string;

  private projectsService = inject(ProjectsService);
  private sprintService = inject(SprintService);
  private authService = inject(AuthService);

  sprints = signal<Sprint[]>([]);
  expandedSprints = signal<ExpandedState>({});
  isModalOpen = signal(false);
  userRole = signal<UserRole>('VIEWER');
  selectedSprintForTask = signal<Sprint | null>(null);
  isLoading = signal(false);
  errorMessage = signal('');

  constructor() {
    effect(() => {
      this.loadSprints();
    });
  }

  ngOnInit(): void {
    this.resolveUserRole();
  }

  private resolveUserRole(): void {
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (members) => {
        const currentUserId = this.authService.currentUser()?.id;
        const membership = members.find((m) => m.userId === currentUserId);

        if (!membership) {
          this.userRole.set('VIEWER');
          return;
        }

        const role = membership.role.name.toUpperCase();
        if (role.includes('OWNER') || role.includes('MANAGER')) {
          this.userRole.set('PM');
        } else if (role.includes('MEMBER')) {
          this.userRole.set('DEVELOPER');
        } else {
          this.userRole.set('VIEWER');
        }
      },
      error: () => {
        this.userRole.set('VIEWER');
      },
    });
  }

  loadSprints(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.sprintService.getSprints(this.projectId).subscribe({
      next: (sprints) => {
        const normalizedSprints = sprints.map((sprint) => ({
          ...sprint,
          status: sprint.status.toLowerCase() as 'planned' | 'active' | 'completed',
        }));
        this.sprints.set(normalizedSprints as Sprint[]);

        const expandedState: ExpandedState = {};
        normalizedSprints.forEach((sprint) => {
          expandedState[sprint.id] = sprint.status === 'active';
        });
        this.expandedSprints.set(expandedState);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load sprints:', err);
        this.errorMessage.set('Failed to load sprints. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  toggleSprint(sprintId: string): void {
    this.expandedSprints.update((state) => ({
      ...state,
      [sprintId]: !state[sprintId],
    }));
  }

  getSprintTasks(sprintId: string): Task[] {
    return this.projectsService.getSprintTasks(sprintId);
  }

  getSprintStats(sprintId: string): {
    total: number;
    completed: number;
    inProgress: number;
  } {
    const tasks = this.getSprintTasks(sprintId);
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'done').length,
      inProgress: tasks.filter((t) => t.status === 'inprogress').length,
    };
  }

  getStatusBadgeClass(status: Sprint['status']): string {
    switch (status) {
      case 'active':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'planned':
        return 'status-planned';
      default:
        return '';
    }
  }

  getStatusLabel(status: Sprint['status']): string {
    switch (status) {
      case 'active':
        return 'Active';
      case 'completed':
        return 'Completed';
      case 'planned':
        return 'Planned';
      default:
        return status;
    }
  }

  getPriorityClass(priority: Task['priority']): string {
    switch (priority) {
      case 'High':
        return 'priority-high';
      case 'Medium':
        return 'priority-medium';
      case 'Low':
        return 'priority-low';
      default:
        return '';
    }
  }

  getStatusClass(status: Task['status']): string {
    switch (status) {
      case 'new':
        return 'status-new';
      case 'todo':
        return 'status-todo';
      case 'inprogress':
        return 'status-in-progress';
      case 'done':
        return 'status-done';
      default:
        return '';
    }
  }

  getStatusLabel_(status: Task['status']): string {
    switch (status) {
      case 'new':
        return 'New';
      case 'todo':
        return 'To Do';
      case 'inprogress':
        return 'In Progress';
      case 'done':
        return 'Done';
      default:
        return status;
    }
  }

  isPM(): boolean {
    return this.userRole() === 'PM';
  }

  canAddSprint(): boolean {
    return this.isPM();
  }

  onOpenAddSprintModal(): void {
    this.isModalOpen.set(true);
  }

  onCloseModal(): void {
    this.isModalOpen.set(false);
  }

  onAddSprint(formData: { name: string; startDate: string; endDate: string; description?: string }): void {
    this.sprintService
      .createSprint(this.projectId, {
        name: formData.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        goal: formData.description,
      })
      .subscribe({
        next: () => {
          this.loadSprints();
          this.isModalOpen.set(false);
        },
        error: (err) => {
          console.error('Failed to create sprint:', err);
          this.errorMessage.set('Failed to create sprint. Please try again.');
        },
      });
  }

  onDeleteSprint(sprintId: string): void {
    if (confirm('Are you sure you want to delete this sprint? All associated tasks will be unassigned.')) {
      this.sprintService.deleteSprint(this.projectId, sprintId).subscribe({
        next: () => {
          this.loadSprints();
        },
        error: (err) => {
          console.error('Failed to delete sprint:', err);
          this.errorMessage.set('Failed to delete sprint. Please try again.');
        },
      });
    }
  }

  onUpdateSprintStatus(sprintId: string, newStatus: Sprint['status']): void {
    const backendStatus = newStatus.toUpperCase() as 'PLANNED' | 'ACTIVE' | 'COMPLETED';
    this.sprintService
      .updateSprint(this.projectId, sprintId, { status: backendStatus })
      .subscribe({
        next: () => {
          this.loadSprints();
        },
        error: (err) => {
          console.error('Failed to update sprint status:', err);
          this.errorMessage.set('Failed to update sprint status. Please try again.');
        },
      });
  }

  getProgressPercentage(sprintId: string): number {
    const stats = this.getSprintStats(sprintId);
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }
}
