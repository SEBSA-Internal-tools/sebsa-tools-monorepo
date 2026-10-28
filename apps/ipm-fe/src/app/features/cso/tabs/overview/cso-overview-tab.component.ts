import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectorRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import type {
  CreateCaseRequest,
  ProjectSummary,
  UserAdminSummary,
  TaskSummary,
  Subtask,
} from '@sebsa-pm-tool/shared-models';
import { forkJoin, map, of, switchMap } from 'rxjs';
import {
  CsoOverviewService,
  CsoTaskView,
} from '../../../../core/services/cso-overview.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import { UserAdminService } from '../../../../core/services/user-admin.service';
import { CasesService } from '../../../../core/services/cases.service';
import {
  CreateCaseModalComponent,
  type CaseFormData,
} from '../../../cases/create-case/create-case-modal.component';
import { CustomSelectComponent } from '../../../../core/components/custom-select/custom-select.component';

type StatusFilter = '' | 'new' | 'todo' | 'inprogress' | 'done';
type OverviewTab = 'cases' | 'tasks' | 'subtasks';

interface CsoSubtaskView extends Subtask {
  taskTitle: string;
  caseTitle: string;
  projectName: string;
}

@Component({
  standalone: true,
  selector: 'cso-overview-tab',
  imports: [
    CommonModule,
    FormsModule,
    CreateCaseModalComponent,
    CustomSelectComponent,
  ],
  templateUrl: './cso-overview-tab.component.html',
  styleUrl: './cso-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoOverviewTabComponent implements OnInit {
  private readonly csoOverviewService = inject(CsoOverviewService);
  private readonly projectsService = inject(ProjectsService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly casesService = inject(CasesService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly http = inject(HttpClient);

  protected readonly tasks = this.csoOverviewService.tasks;
  protected readonly isLoading = this.csoOverviewService.isLoading;
  protected readonly taskItems = signal<TaskSummary[]>([]);
  protected readonly subtaskItems = signal<CsoSubtaskView[]>([]);
  protected readonly workspaceLoading = signal(false);
  protected readonly activeOverviewTab = signal<OverviewTab>('cases');

  protected readonly availableProjects = signal<ProjectSummary[]>([]);
  protected readonly availableAssignees = signal<UserAdminSummary[]>([]);

  /** The Project/Customer filters only make sense scoped to CSO projects —
   *  a CSO-labeled task can technically live in a non-CSO project too, but
   *  these dropdowns are for narrowing by "which CSO engagement," not every
   *  project that happens to have a customer name set. */
  protected readonly csoProjects = computed(() =>
    this.availableProjects().filter((p) => p.isCsoProject),
  );

  /** Distinct customers across CSO projects only — narrows the filter to
   *  "which CSO engagement," matching the projects filter above. */
  protected readonly availableCustomers = computed<
    { id: string; name: string }[]
  >(() => {
    const byId = new Map<string, string>();
    for (const project of this.csoProjects()) {
      if (project.customer?.id && project.customer?.name) {
        byId.set(project.customer.id, project.customer.name);
      }
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly selectedProjectId = signal('');
  protected readonly selectedCustomerId = signal('');
  protected readonly selectedPriority = signal('');
  protected readonly selectedAssigneeId = signal('');
  protected readonly selectedStatus = signal<StatusFilter>('');

  protected selectedAssigneeName(): string {
    const id = this.selectedAssigneeId();
    if (!id) return '';
    const match = this.availableAssignees().find((u) => u.id === id);
    return match?.name ?? '';
  }

  protected readonly availablePriorities = computed<string[]>(() => {
    const names = new Set(
      this.tasks()
        .map((t) => t.priority)
        .filter(Boolean),
    );
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  protected readonly priorityFilterOptions = computed(() => {
    const dynamic = this.availablePriorities();
    if (dynamic.length > 0) {
      return dynamic.map((name) => ({ value: name, label: name }));
    }
    return [
      { value: 'Critical', label: 'Critical' },
      { value: 'High', label: 'High' },
      { value: 'Medium', label: 'Medium' },
      { value: 'Low', label: 'Low' },
    ];
  });

  protected readonly statusFilterOptions = [
    { value: 'new', label: 'New' },
    { value: 'todo', label: 'To Do' },
    { value: 'inprogress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ];

  protected isTaskModalOpen = false;
  protected errorMessage = '';

  protected readonly filteredTasks = computed<CsoTaskView[]>(() => {
    const status = this.selectedStatus();
    const priority = this.selectedPriority();
    return this.tasks().filter((task) => {
      if (status && task.statusLabel !== status) return false;
      if (priority && task.priority.toLowerCase() !== priority.toLowerCase())
        return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.projectsService.getProjects().subscribe({
      next: (p) => {
        this.availableProjects.set(p);
        this.cdr.markForCheck();
      },
    });
    this.userAdminService.listAll().subscribe({
      next: (users) => {
        this.availableAssignees.set(users.filter((u) => u.isActive));
        this.cdr.markForCheck();
      },
    });
    this.applyFilters();
  }

  applyFilters(): void {
    this.csoOverviewService.load({
      projectId: this.selectedProjectId() || undefined,
      customerId: this.selectedCustomerId() || undefined,
      assigneeId: this.selectedAssigneeId() || undefined,
    });
    this.loadTasksAndSubtasks();
  }

  protected setOverviewTab(tab: OverviewTab): void {
    this.activeOverviewTab.set(tab);
  }

  protected refresh(): void {
    this.applyFilters();
  }

  private loadTasksAndSubtasks(): void {
    this.workspaceLoading.set(true);
    let params = new HttpParams().set('isCsoLabeled', 'true');
    if (this.selectedProjectId()) params = params.set('projectId', this.selectedProjectId());
    if (this.selectedCustomerId()) params = params.set('customerId', this.selectedCustomerId());

    this.http.get<TaskSummary[]>('/api/tasks', { params }).pipe(
      switchMap((tasks) => {
        if (tasks.length === 0) return of({ tasks, subtasks: [] as CsoSubtaskView[] });
        return forkJoin(tasks.map((task) =>
          this.http.get<Subtask[]>(`/api/tasks/${task.id}/subtasks`).pipe(
            map((subtasks) => subtasks.map((subtask) => ({
              ...subtask,
              taskTitle: task.title,
              caseTitle: task.case.title,
              projectName: task.case.project?.name ?? '',
            }))),
          ),
        )).pipe(map((groups) => ({ tasks, subtasks: groups.flat() })));
      }),
    ).subscribe({
      next: ({ tasks, subtasks }) => {
        this.taskItems.set(tasks);
        this.subtaskItems.set(subtasks);
        this.workspaceLoading.set(false);
      },
      error: () => {
        this.taskItems.set([]);
        this.subtaskItems.set([]);
        this.workspaceLoading.set(false);
      },
    });
  }

  protected hasActiveFilters(): boolean {
    return !!(
      this.selectedProjectId() ||
      this.selectedCustomerId() ||
      this.selectedPriority() ||
      this.selectedStatus() ||
      this.selectedAssigneeId()
    );
  }

  protected clearFilters(): void {
    this.selectedProjectId.set('');
    this.selectedCustomerId.set('');
    this.selectedPriority.set('');
    this.selectedStatus.set('');
    this.selectedAssigneeId.set('');
    this.applyFilters();
  }

  openTaskModal(): void {
    this.isTaskModalOpen = true;
  }

  closeTaskModal(): void {
    this.isTaskModalOpen = false;
  }

  onCaseClick(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  protected onTaskClick(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  protected assigneeNames(assignees: { name: string }[]): string {
    return assignees.map((assignee) => assignee.name).join(', ') || '—';
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
      assigneeIds:
        formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      // Always CSO-labeled here regardless of the modal's own checkbox —
      // this is the CSO Overview's dedicated "create case" entry point.
      isCsoLabeled: true,
      category: formData.category,
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
