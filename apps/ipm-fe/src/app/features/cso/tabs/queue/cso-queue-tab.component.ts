import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { CreateCaseRequest, ProjectSummary, TaskCategory } from '@sebsa-pm-tool/shared-models';
import { CsoTaskQueueService, CsoQueueCaseView } from '../../../../core/services/cso-task-queue.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import { CasesService } from '../../../../core/services/cases.service';
import { CreateCaseModalComponent, type CaseFormData } from '../../../cases/create-case/create-case-modal.component';
import { CustomSelectComponent } from '../../../../core/components/custom-select/custom-select.component';

type StatusFilter = '' | 'new' | 'todo' | 'inprogress' | 'done';

/** Renders one CSO queue (Functional or Technical) — every unassigned Task
 *  whose own `category` tag matches this queue, across all CSO projects. A
 *  task's category (not its parent Case's) is what routes it here; see
 *  CsoTaskQueueService. A task drops out of the queue the moment someone is
 *  assigned to it — the queue is unclaimed work only. New support issues
 *  still start as a Case (the "Create Case" action below) — tasks are added
 *  to it afterwards from the Case detail page, where each one picks its own
 *  Functional/Technical tag. */
@Component({
  standalone: true,
  selector: 'cso-queue-tab',
  imports: [CommonModule, FormsModule, CreateCaseModalComponent, CustomSelectComponent],
  templateUrl: './cso-queue-tab.component.html',
  styleUrl: './cso-queue-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoQueueTabComponent implements OnInit, OnChanges {
  /** Which queue this instance renders — fixed for the lifetime of the tab. */
  @Input({ required: true }) category!: TaskCategory;

  private readonly csoTaskQueueService = inject(CsoTaskQueueService);
  private readonly projectsService = inject(ProjectsService);
  private readonly casesService = inject(CasesService);
  private readonly router = inject(Router);

  protected readonly cases = this.csoTaskQueueService.cases;
  protected readonly isLoading = this.csoTaskQueueService.isLoading;

  protected readonly availableProjects = signal<ProjectSummary[]>([]);

  protected readonly csoProjects = computed(() =>
    this.availableProjects().filter((p) => p.isCsoProject),
  );

  protected readonly availableCustomers = computed<{ id: string; name: string }[]>(() => {
    const byId = new Map<string, string>();
    for (const project of this.csoProjects()) {
      if (project.customer?.id && project.customer?.name) {
        byId.set(project.customer.id, project.customer.name);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly selectedProjectId = signal('');
  protected readonly selectedCustomerId = signal('');
  protected readonly selectedStatus = signal<StatusFilter>('');

  protected readonly statusFilterOptions = [
    { value: 'new', label: 'New' },
    { value: 'todo', label: 'To Do' },
    { value: 'inprogress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ];

  protected isCaseModalOpen = false;
  protected errorMessage = '';

  protected readonly filteredCases = computed<CsoQueueCaseView[]>(() => {
    const status = this.selectedStatus();
    if (!status) return this.cases();
    return this.cases().filter((kase) => kase.statusLabel === status);
  });

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(): void {
    this.loadData();
  }

  private loadData(): void {
    this.projectsService.getProjects().subscribe({ next: (p) => this.availableProjects.set(p) });
    this.applyFilters();
  }

  protected get queueLabel(): string {
    return this.category === 'TECHNICAL' ? 'Technical' : 'Functional';
  }

  applyFilters(): void {
    this.csoTaskQueueService.load({
      category: this.category,
      projectId: this.selectedProjectId() || undefined,
      customerId: this.selectedCustomerId() || undefined,
    });
  }

  protected refresh(): void {
    this.applyFilters();
  }

  protected hasActiveFilters(): boolean {
    return !!(
      this.selectedProjectId() ||
      this.selectedCustomerId() ||
      this.selectedStatus()
    );
  }

  protected clearFilters(): void {
    this.selectedProjectId.set('');
    this.selectedCustomerId.set('');
    this.selectedStatus.set('');
    this.applyFilters();
  }

  openTaskModal(): void {
    this.isCaseModalOpen = true;
  }

  closeTaskModal(): void {
    this.isCaseModalOpen = false;
  }

  onCaseClick(caseId: string): void {
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
      // Always CSO-labeled here regardless of the modal's own checkbox —
      // this is the CSO queue's dedicated "create case" entry point. The
      // case's own category is locked to this queue only as a starting
      // point; individual tasks created inside it pick their own tag.
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

  statusLabelText(status: CsoQueueCaseView['statusLabel']): string {
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
}
