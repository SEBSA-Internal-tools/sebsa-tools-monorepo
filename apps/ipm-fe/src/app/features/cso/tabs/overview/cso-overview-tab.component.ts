import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { CreateTaskRequest, ProjectSummary, UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import { CsoOverviewService, CsoTaskView } from '../../../../core/services/cso-overview.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import { UserAdminService } from '../../../../core/services/user-admin.service';
import { TasksService } from '../../../../core/services/tasks.service';
import { CreateTaskModalComponent, type TaskFormData } from '../../../projects/components/modals/create-task/create-task-modal.component';

type StatusFilter = '' | 'new' | 'todo' | 'inprogress' | 'done';

@Component({
  standalone: true,
  selector: 'cso-overview-tab',
  imports: [CommonModule, FormsModule, CreateTaskModalComponent],
  templateUrl: './cso-overview-tab.component.html',
  styleUrl: './cso-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoOverviewTabComponent implements OnInit {
  private readonly csoOverviewService = inject(CsoOverviewService);
  private readonly projectsService = inject(ProjectsService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly tasksService = inject(TasksService);
  private readonly router = inject(Router);

  protected readonly tasks = this.csoOverviewService.tasks;
  protected readonly isLoading = this.csoOverviewService.isLoading;

  protected readonly availableProjects = signal<ProjectSummary[]>([]);
  protected readonly availableAssignees = signal<UserAdminSummary[]>([]);

  /** The Project/Customer filters only make sense scoped to CSO projects —
   *  a CSO-labeled task can technically live in a non-CSO project too, but
   *  these dropdowns are for narrowing by "which CSO engagement," not every
   *  project that happens to have a customer name set. */
  protected readonly csoProjects = computed(() =>
    this.availableProjects().filter((p) => p.isCsoProject),
  );

  /** Distinct customer names across CSO projects only — there's no Customer
   *  entity to list, so the filter dropdown is derived from whatever's
   *  actually been typed into Project.customerName so far. */
  protected readonly availableCustomerNames = computed<string[]>(() => {
    const names = this.csoProjects()
      .map((p) => p.customerName)
      .filter((name): name is string => !!name);
    return [...new Set(names)].sort();
  });

  protected selectedProjectId = '';
  protected selectedCustomerName = '';
  protected selectedPriority: '' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = '';
  protected selectedAssigneeId = '';
  protected selectedStatus: StatusFilter = '';

  protected isTaskModalOpen = false;
  protected errorMessage = '';

  protected readonly filteredTasks = computed<CsoTaskView[]>(() => {
    const status = this.selectedStatus;
    if (!status) return this.tasks();
    return this.tasks().filter((task) => task.statusLabel === status);
  });

  ngOnInit(): void {
    this.projectsService.getProjects().subscribe({ next: (p) => this.availableProjects.set(p) });
    this.userAdminService.listAll().subscribe({
      next: (users) => this.availableAssignees.set(users.filter((u) => u.isActive)),
    });
    this.applyFilters();
  }

  applyFilters(): void {
    this.csoOverviewService.load({
      projectId: this.selectedProjectId || undefined,
      customerName: this.selectedCustomerName || undefined,
      priority: this.selectedPriority || undefined,
      assigneeId: this.selectedAssigneeId || undefined,
    });
  }

  openTaskModal(): void {
    this.isTaskModalOpen = true;
  }

  closeTaskModal(): void {
    this.isTaskModalOpen = false;
  }

  onTaskClick(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  onCreateTask(formData: TaskFormData): void {
    const dto: CreateTaskRequest = {
      projectId: formData.projectId,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priority: formData.priority,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      // Always CSO-labeled here regardless of the modal's own checkbox —
      // this is the CSO Overview's dedicated "create task" entry point.
      isCsoLabeled: true,
      parentTaskId: formData.parentTaskId,
    };

    this.tasksService.createTask(dto, []).subscribe({
      next: () => {
        this.closeTaskModal();
        this.applyFilters();
      },
      error: () => {
        this.errorMessage = 'Failed to create task. Please try again.';
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
