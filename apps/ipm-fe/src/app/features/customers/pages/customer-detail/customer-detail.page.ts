import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomersService } from '../../../../core/services/customers.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import {
  CreateCustomerModalComponent,
  type CustomerFormData,
} from '../../components/modals/create-customer/create-customer-modal.component';
import type { Customer, ProjectSummary, ProjectStatus, ProjectType } from '@sebsa-pm-tool/shared-models';

const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  IFS_IMPLEMENTATION: 'rocket_launch',
  IFS_SUPPORT: 'support_agent',
  INTERNAL: 'business',
  CUSTOMIZATION: 'tune',
  UPGRADE: 'upgrade',
  CONFIGURATION: 'settings',
  CUSTOM: 'folder',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

/** Maps to the global two-tone `.badge` modifier classes in styles.scss. */
const STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  PLANNING: 'neutral',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'info',
  ARCHIVED: 'neutral',
};

@Component({
  standalone: true,
  selector: 'app-customer-detail-page',
  imports: [CommonModule, CreateCustomerModalComponent],
  templateUrl: './customer-detail.page.html',
  styleUrl: './customer-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customersService = inject(CustomersService);
  private readonly projectsService = inject(ProjectsService);

  readonly customer = signal<Customer | null>(null);
  readonly projects = signal<ProjectSummary[]>([]);
  readonly isLoading = signal(false);
  readonly isLoadingProjects = signal(false);
  readonly errorMessage = signal('');

  isEditModalOpen = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/customers']);
      return;
    }
    this.loadCustomer(id);
  }

  private loadCustomer(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.customersService.getCustomer(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.isLoading.set(false);
        this.loadProjects(id);
      },
      error: () => {
        this.isLoading.set(false);
        this.router.navigate(['/customers']);
      },
    });
  }

  private loadProjects(customerId: string): void {
    this.isLoadingProjects.set(true);
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects.filter((p) => p.customer.id === customerId));
        this.isLoadingProjects.set(false);
      },
      error: () => {
        this.projects.set([]);
        this.isLoadingProjects.set(false);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/customers']);
  }

  onProjectClick(projectId: string): void {
    this.router.navigate(['/projects', projectId]);
  }

  openEditModal(): void {
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
  }

  onEditCustomer(formData: CustomerFormData): void {
    const current = this.customer();
    if (!current) return;

    this.errorMessage.set('');
    this.customersService.updateCustomer(current.id, formData).subscribe({
      next: (updated) => {
        this.customer.set(updated);
        this.closeEditModal();
      },
      error: () => {
        this.errorMessage.set('Failed to update customer. Please try again.');
      },
    });
  }

  deleteCustomer(): void {
    const current = this.customer();
    if (!current) return;
    if (!confirm(`Delete "${current.name}"? This cannot be undone.`)) return;

    this.customersService.deleteCustomer(current.id).subscribe({
      next: () => this.router.navigate(['/customers']),
      error: (err) => {
        this.errorMessage.set(
          err?.error?.message ?? 'Failed to delete customer. Please try again.',
        );
      },
    });
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  projectTypeIcon(type: ProjectType): string {
    return PROJECT_TYPE_ICONS[type] ?? 'folder';
  }

  statusClass(status: ProjectStatus): string {
    return STATUS_BADGE_CLASS[status] ?? 'neutral';
  }

  statusLabel(status: ProjectStatus): string {
    return STATUS_LABELS[status] ?? status;
  }
}
