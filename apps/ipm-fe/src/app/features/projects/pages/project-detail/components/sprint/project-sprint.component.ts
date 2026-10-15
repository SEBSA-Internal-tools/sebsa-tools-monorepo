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
import { ProjectsService, Sprint } from '../../../../services/projects.service';
import { SprintService } from '../../../../services/sprint.service';
import { AuthService } from '../../../../../../core/services/auth.service';
import { CasesService, type CaseView } from '../../../../../../core/services/cases.service';
import { ConfirmationService } from '../../../../../../core/services/confirmation.service';
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
  private readonly confirmation = inject(ConfirmationService);
  @Input() projectId!: string;

  private projectsService = inject(ProjectsService);
  private sprintService = inject(SprintService);
  private authService = inject(AuthService);
  private casesService = inject(CasesService);

  sprints = signal<Sprint[]>([]);
  expandedSprints = signal<ExpandedState>({});
  isModalOpen = signal(false);
  userRole = signal<UserRole>('VIEWER');
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
        this.sprints.set(sprints);

        const expandedState: ExpandedState = {};
        sprints.forEach((sprint) => {
          expandedState[sprint.id] = sprint.status === 'ACTIVE';
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

  getSprintCases(sprintId: string): CaseView[] {
    return this.casesService.getSprintCases(sprintId);
  }

  getSprintStats(sprintId: string): {
    total: number;
    completed: number;
    inProgress: number;
  } {
    const cases = this.getSprintCases(sprintId);
    return {
      total: cases.length,
      completed: cases.filter((c) => c.status === 'DONE' || c.status === 'CANCELLED').length,
      inProgress: cases.filter((c) => c.status === 'IN_PROGRESS' || c.status === 'IN_REVIEW' || c.status === 'BLOCKED').length,
    };
  }

  getStatusBadgeClass(status: Sprint['status']): string {
    switch (status) {
      case 'ACTIVE':
        return 'status-active';
      case 'COMPLETED':
        return 'status-completed';
      case 'PLANNED':
        return 'status-planned';
      default:
        return '';
    }
  }

  getStatusLabel(status: Sprint['status']): string {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'COMPLETED':
        return 'Completed';
      case 'PLANNED':
        return 'Planned';
      default:
        return status;
    }
  }

  getPriorityClass(priority: CaseView['priority']): string {
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

  getStatusClass(status: CaseView['status']): string {
    switch (status) {
      case 'TO_DO':
        return 'status-new';
      case 'IN_PROGRESS':
      case 'IN_REVIEW':
        return 'status-in-progress';
      case 'BLOCKED':
        return 'status-todo';
      case 'DONE':
      case 'CANCELLED':
        return 'status-done';
      default:
        return '';
    }
  }

  getCaseStatusLabel(status: CaseView['status']): string {
    switch (status) {
      case 'TO_DO':
        return 'To Do';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'IN_REVIEW':
        return 'In Review';
      case 'BLOCKED':
        return 'Blocked';
      case 'DONE':
        return 'Done';
      case 'CANCELLED':
        return 'Cancelled';
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

  async onDeleteSprint(sprintId: string): Promise<void> {
    if (!(await this.confirmation.confirm({ title: 'Delete sprint', message: 'Delete this sprint?', consequence: 'The sprint will be permanently deleted and all associated cases will be unassigned from it.', confirmLabel: 'Delete sprint' }))) return;
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
