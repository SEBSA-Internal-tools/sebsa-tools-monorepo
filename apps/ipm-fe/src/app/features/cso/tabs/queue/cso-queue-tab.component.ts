import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { CreateCaseRequest, ProjectSummary, TaskCategory, UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import { CsoOverviewService, CsoTaskView } from '../../../../core/services/cso-overview.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import { UserAdminService } from '../../../../core/services/user-admin.service';
import { CasesService } from '../../../../core/services/cases.service';
import { CreateCaseModalComponent, type CaseFormData } from '../../../cases/create-case/create-case-modal.component';

type StatusFilter = '' | 'new' | 'todo' | 'inprogress' | 'done';

/** Renders one CSO queue (Functional or Technical) — a category-locked view
 *  of the same cross-project case list the Overview tab shows, so PMs can
 *  work each queue separately without re-filtering every time. */
@Component({
  standalone: true,
  selector: 'cso-queue-tab',
  imports: [CommonModule, FormsModule, CreateCaseModalComponent],
  templateUrl: './cso-queue-tab.component.html',
  styleUrl: './cso-queue-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoQueueTabComponent implements OnChanges {
  /** Which queue this instance renders — fixed for the lifetime of the tab. */
  @Input({ required: true }) category!: TaskCategory;

  private readonly csoOverviewService = inject(CsoOverviewService);
  private readonly projectsService = inject(ProjectsService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly casesService = inject(CasesService);
  private readonly router = inject(Router);

  protected readonly tasks = this.csoOverviewService.tasks;
  protected readonly isLoading = this.csoOverviewService.isLoading;

  protected readonly availableProjects = signal<ProjectSummary[]>([]);
  protected readonly availableAssignees = signal<UserAdminSummary[]>([]);

  protected readonly csoProjects = computed(() =>
    this.availableProjects().filter((p) => p.isCsoProject),
  );

  protected readonly availableCustomers = computed<{ id: string; name: string }[]>(() => {
    const byId = new Map<string, string>();
    for (const project of this.csoProjects()) {
      byId.set(project.customer.id, project.customer.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected selectedProjectId = '';
  protected selectedCustomerId = '';
  protected selectedPriority: '' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = '';
  protected selectedAssigneeId = '';
  protected selectedStatus: StatusFilter = '';

  protected isCaseModalOpen = false;
  protected errorMessage = '';

  protected readonly filteredTasks = computed<CsoTaskView[]>(() => {
    const status = this.selectedStatus;
    if (!status) return this.tasks();
    return this.tasks().filter((task) => task.statusLabel === status);
  });

  ngOnChanges(): void {
    this.projectsService.getProjects().subscribe({ next: (p) => this.availableProjects.set(p) });
    this.userAdminService.listAll().subscribe({
      next: (users) => this.availableAssignees.set(users.filter((u) => u.isActive)),
    });
    this.applyFilters();
  }

  protected get queueLabel(): string {
    return this.category === 'TECHNICAL' ? 'Technical' : 'Functional';
  }

  applyFilters(): void {
    this.csoOverviewService.load({
      category: this.category,
      projectId: this.selectedProjectId || undefined,
      customerId: this.selectedCustomerId || undefined,
      priority: this.selectedPriority || undefined,
      assigneeId: this.selectedAssigneeId || undefined,
    });
  }

  openTaskModal(): void {
    this.isCaseModalOpen = true;
  }

  closeTaskModal(): void {
    this.isCaseModalOpen = false;
  }

  onTaskClick(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  onCreateTask(formData: CaseFormData): void {
    const dto: CreateCaseRequest = {
      projectId: formData.projectId,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priorityId: formData.priorityId,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      // Always CSO-labeled and locked to this queue's category, regardless
      // of the modal's own checkbox/category picker.
      isCsoLabeled: true,
      category: this.category,
    };

    this.casesService.createCase(dto).subscribe({
      next: () => {
        this.closeTaskModal();
        this.applyFilters();
      },
      error: () => {
        this.errorMessage = 'Failed to create case. Please try again.';
      },
    });
  }

  statusLabelText(status: CsoTaskView['statusLabel']): string {
    switch (status) {
      case 'new':
        return 'New';
      case 'todo':
        return 'To Do';
      case 'inprogress':
        return 'In Progress';
      case 'done':
        return 'Done';
    }
  }

  priorityClass(priority: CsoTaskView['priority']): string {
    return priority.toLowerCase();
  }
}
