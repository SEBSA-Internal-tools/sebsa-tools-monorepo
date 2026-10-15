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

import { CustomSelectComponent } from '../../../../../../core/components/custom-select/custom-select.component';
import { ConfirmationService } from '../../../../../../core/services/confirmation.service';

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
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent {
  private readonly confirmation = inject(ConfirmationService);
  @Input() projects: ProjectSummary[] | null = null;
  @Output() newProjectClick = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() deleteProject = new EventEmitter<string>();

  private router = inject(Router);

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly statusLabels = STATUS_LABELS;

  get statusSelectOptions(): { value: string; label: string }[] {
    return this.statusOptions.map((status) => ({
      value: status,
      label: this.statusLabels[status],
    }));
  }

  searchQuery = '';
  selectedStatus: 'all' | ProjectStatus = 'all';
  selectedCustomerId = '';

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
        !this.selectedCustomerId || project.customerId === this.selectedCustomerId;

      return matchesStatus && matchesSearch && matchesCustomer;
    });
  }

  /** Distinct customers across every loaded project, for the customer filter dropdown. */
  availableCustomers(): { id: string; name: string }[] {
    const byId = new Map<string, string>();
    for (const project of this.projects ?? []) {
      byId.set(project.customer.id, project.customer.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  async onDeleteProject(projectId: string): Promise<void> {
    const project = this.projects?.find((item) => item.id === projectId);
    if (!(await this.confirmation.confirm({ title: 'Delete project', message: project ? `Delete "${project.name}"?` : 'Delete this project?', consequence: 'The project will be permanently removed. This cannot be undone.', confirmLabel: 'Delete project' }))) return;
    this.deleteProject.emit(projectId);
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
