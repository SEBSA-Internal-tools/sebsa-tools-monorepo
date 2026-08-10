import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService, Sprint, Task } from '../../../../services/projects.service';
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

  sprints = signal<Sprint[]>([]);
  expandedSprints = signal<ExpandedState>({});
  isModalOpen = signal(false);
  userRole = signal<UserRole>('PM');
  selectedSprintForTask = signal<Sprint | null>(null);

  ngOnInit(): void {
    this.loadSprints();
  }

  loadSprints(): void {
    const sprints = this.projectsService.getSprints(this.projectId);
    this.sprints.set(sprints);

    const expandedState: ExpandedState = {};
    sprints.forEach((sprint) => {
      expandedState[sprint.id] = sprint.status === 'active';
    });
    this.expandedSprints.set(expandedState);
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
    const sprint = this.projectsService.createSprint({
      ...formData,
      projectId: this.projectId,
    });
    this.loadSprints();
    this.isModalOpen.set(false);
  }

  onDeleteSprint(sprintId: string): void {
    if (confirm('Are you sure you want to delete this sprint? All associated tasks will be unassigned.')) {
      this.projectsService.deleteSprint(sprintId);
      this.loadSprints();
    }
  }

  onUpdateSprintStatus(sprintId: string, newStatus: Sprint['status']): void {
    this.projectsService.updateSprintStatus(sprintId, newStatus);
    this.loadSprints();
  }

  getProgressPercentage(sprintId: string): number {
    const stats = this.getSprintStats(sprintId);
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  }
}
