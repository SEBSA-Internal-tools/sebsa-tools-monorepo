import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { ProjectSummary, ProjectStatus, ProjectType } from '@sebsa-pm-tool/shared-models';

const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  IFS_IMPLEMENTATION: 'rocket_launch',
  IFS_SUPPORT: 'support_agent',
  INTERNAL: 'business',
  CUSTOMIZATION: 'tune',
  UPGRADE: 'upgrade',
  CONFIGURATION: 'settings',
  CUSTOM: 'folder',
};

const STATUS_OPTIONS: ProjectStatus[] = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

@Component({
  standalone: true,
  selector: 'projects-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent {
  @Input() projects: ProjectSummary[] | null = null;
  @Output() newProjectClick = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() deleteProject = new EventEmitter<string>();

  private router = inject(Router);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusLabels = STATUS_LABELS;

  searchQuery = '';
  selectedStatus: 'all' | ProjectStatus = 'all';
  selectedCustomerName = '';

  filteredProjects(): ProjectSummary[] {
    if (!this.projects) return [];

    return this.projects.filter((project) => {
      const matchesStatus =
        this.selectedStatus === 'all' || project.status === this.selectedStatus;
      const matchesSearch =
        !this.searchQuery ||
        project.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        project.createdBy.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      const matchesCustomer =
        !this.selectedCustomerName || project.customerName === this.selectedCustomerName;

      return matchesStatus && matchesSearch && matchesCustomer;
    });
  }

  /** Distinct customer names across every loaded project, for the customer filter dropdown. */
  availableCustomerNames(): string[] {
    const names = (this.projects ?? [])
      .map((p) => p.customerName)
      .filter((name): name is string => !!name);
    return [...new Set(names)].sort();
  }

  getStatusCount(status: ProjectStatus): number {
    return this.projects?.filter((p) => p.status === status).length ?? 0;
  }

  onNewProject(): void {
    this.newProjectClick.emit();
  }

  onSearchChange(): void {
    this.searchChange.emit(this.searchQuery);
  }

  onDeleteProject(projectId: string): void {
    if (confirm('Are you sure you want to delete this project?')) {
      this.deleteProject.emit(projectId);
    }
  }

  onProjectClick(projectId: string, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.col-actions')) {
      return;
    }
    this.router.navigate(['/projects', projectId]);
  }

  projectTypeIcon(type: ProjectType): string {
    return PROJECT_TYPE_ICONS[type] ?? 'folder';
  }

  statusClass(status: ProjectStatus): string {
    return status.toLowerCase().replace(/_/g, '-');
  }

  statusLabel(status: ProjectStatus): string {
    return STATUS_LABELS[status] ?? status;
  }
}
