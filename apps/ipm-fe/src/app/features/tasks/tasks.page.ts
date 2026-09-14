import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  TasksService,
  TASK_STATUSES,
  type TaskView,
} from '../../core/services/tasks.service';
import {
  CasesService,
  CASE_STATUSES,
  type CaseView,
} from '../../core/services/cases.service';
import {
  CustomSelectComponent,
  type SelectOptionItem,
} from '../../core/components/custom-select/custom-select.component';

export type AssignedSubTab = 'tasks' | 'cases';

@Component({
  standalone: true,
  selector: 'app-tasks-page',
  imports: [CommonModule, FormsModule, RouterModule, CustomSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task.page.html',
  styleUrls: ['./task.page.scss'],
})
export class TasksPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly tasksService = inject(TasksService);
  private readonly casesService = inject(CasesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly activeTab = signal<AssignedSubTab>('tasks');

  // Tasks state
  readonly tasks = signal<TaskView[]>([]);
  readonly isTasksLoading = signal<boolean>(false);
  readonly tasksErrorMessage = signal<string>('');
  readonly taskSearchQuery = signal<string>('');
  readonly selectedCaseId = signal<string>('');
  readonly selectedTaskStatus = signal<string>('');
  readonly selectedTaskPriority = signal<string>('');
  readonly taskStatuses = TASK_STATUSES;

  // Cases state
  readonly cases = signal<CaseView[]>([]);
  readonly isCasesLoading = signal<boolean>(false);
  readonly casesErrorMessage = signal<string>('');
  readonly caseSearchQuery = signal<string>('');
  readonly selectedProjectId = signal<string>('');
  readonly selectedCaseStatus = signal<string>('');
  readonly selectedCasePriority = signal<string>('');
  readonly selectedCaseType = signal<string>('');
  readonly caseStatuses = CASE_STATUSES;

  // Task Computed Filters
  readonly availableCases = computed<Array<{ id: string; title: string }>>(() => {
    const byId = new Map<string, string>();
    for (const task of this.tasks()) {
      if (task.caseId && task.caseTitle) {
        byId.set(task.caseId, task.caseTitle);
      }
    }
    return [...byId.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  readonly availableTaskPriorities = computed<string[]>(() => {
    const names = new Set(this.tasks().map((t) => t.priority).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly caseSelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Parent Cases' },
    ...this.availableCases().map((c) => ({ value: c.id, label: c.title })),
  ]);

  readonly taskStatusSelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Statuses' },
    ...this.taskStatuses.map((s) => ({ value: s.id, label: s.name })),
  ]);

  readonly taskPrioritySelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Priorities' },
    ...this.availableTaskPriorities().map((p) => ({ value: p, label: p })),
  ]);

  readonly filteredTasks = computed<TaskView[]>(() => {
    const query = this.taskSearchQuery().toLowerCase().trim();
    const caseId = this.selectedCaseId();
    const status = this.selectedTaskStatus();
    const priority = this.selectedTaskPriority();

    return this.tasks().filter((t) => {
      if (caseId && t.caseId !== caseId) return false;
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (query) {
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesCase = t.caseTitle?.toLowerCase().includes(query) ?? false;
        const matchesProject = t.projectName?.toLowerCase().includes(query) ?? false;
        const matchesPriority = t.priority?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesCase && !matchesProject && !matchesPriority) {
          return false;
        }
      }
      return true;
    });
  });

  readonly hasActiveTaskFilters = computed<boolean>(
    () =>
      !!(
        this.selectedCaseId() ||
        this.selectedTaskStatus() ||
        this.selectedTaskPriority() ||
        this.taskSearchQuery()
      )
  );

  // Case Computed Filters
  readonly availableProjects = computed<Array<{ id: string; name: string }>>(() => {
    const byId = new Map<string, string>();
    for (const kase of this.cases()) {
      if (kase.projectId && kase.projectName) {
        byId.set(kase.projectId, kase.projectName);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly availableCasePriorities = computed<string[]>(() => {
    const names = new Set(this.cases().map((c) => c.priority).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  readonly availableCaseTypes = computed<string[]>(() => {
    const types = new Set(this.cases().map((c) => c.type).filter(Boolean));
    return [...types].sort((a, b) => a.localeCompare(b));
  });

  readonly projectSelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Projects' },
    ...this.availableProjects().map((p) => ({ value: p.id, label: p.name })),
  ]);

  readonly caseStatusSelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Statuses' },
    ...this.caseStatuses.map((s) => ({ value: s.id, label: s.name })),
  ]);

  readonly caseTypeSelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Types' },
    ...this.availableCaseTypes().map((t) => ({ value: t, label: t })),
  ]);

  readonly casePrioritySelectOptions = computed<SelectOptionItem[]>(() => [
    { value: '', label: 'All Priorities' },
    ...this.availableCasePriorities().map((p) => ({ value: p, label: p })),
  ]);

  readonly filteredCases = computed<CaseView[]>(() => {
    const query = this.caseSearchQuery().toLowerCase().trim();
    const projectId = this.selectedProjectId();
    const status = this.selectedCaseStatus();
    const priority = this.selectedCasePriority();
    const type = this.selectedCaseType();

    return this.cases().filter((c) => {
      if (projectId && c.projectId !== projectId) return false;
      if (status && c.status !== status) return false;
      if (priority && c.priority !== priority) return false;
      if (type && c.type !== type) return false;
      if (query) {
        const matchesTitle = c.title.toLowerCase().includes(query);
        const matchesProject = c.projectName?.toLowerCase().includes(query) ?? false;
        const matchesDescription = c.description?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesProject && !matchesDescription) {
          return false;
        }
      }
      return true;
    });
  });

  readonly hasActiveCaseFilters = computed<boolean>(
    () =>
      !!(
        this.selectedProjectId() ||
        this.selectedCaseStatus() ||
        this.selectedCasePriority() ||
        this.selectedCaseType() ||
        this.caseSearchQuery()
      )
  );

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (!user) {
      this.tasksErrorMessage.set('You must be logged in to view your assigned work.');
      this.casesErrorMessage.set('You must be logged in to view your assigned work.');
      return;
    }

    // Sync active tab with route query param if provided
    this.route.queryParams.subscribe((params) => {
      if (params['tab'] === 'cases') {
        this.activeTab.set('cases');
      } else {
        this.activeTab.set('tasks');
      }
    });

    this.loadAssignedTasks();
    this.loadAssignedCases();
  }

  setTab(tab: AssignedSubTab): void {
    this.activeTab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  loadAssignedTasks(): void {
    this.isTasksLoading.set(true);
    this.tasksErrorMessage.set('');

    this.tasksService.getMyAssignedTasks().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.isTasksLoading.set(false);
      },
      error: (error) => {
        console.error('Failed to load assigned tasks:', error);
        this.tasksErrorMessage.set('Unable to load assigned tasks. Please check your connection and retry.');
        this.isTasksLoading.set(false);
      },
    });
  }

  loadAssignedCases(): void {
    this.isCasesLoading.set(true);
    this.casesErrorMessage.set('');

    this.casesService.getMyAssignedCases().subscribe({
      next: (cases) => {
        this.cases.set(cases);
        this.isCasesLoading.set(false);
      },
      error: (error) => {
        console.error('Failed to load assigned cases:', error);
        this.casesErrorMessage.set('Unable to load assigned cases. Please check your connection and retry.');
        this.isCasesLoading.set(false);
      },
    });
  }

  clearTaskFilters(): void {
    this.selectedCaseId.set('');
    this.selectedTaskStatus.set('');
    this.selectedTaskPriority.set('');
    this.taskSearchQuery.set('');
  }

  clearCaseFilters(): void {
    this.selectedProjectId.set('');
    this.selectedCaseStatus.set('');
    this.selectedCasePriority.set('');
    this.selectedCaseType.set('');
    this.caseSearchQuery.set('');
  }

  trackByTaskId(_index: number, task: TaskView): string {
    return task.id;
  }

  trackByCaseId(_index: number, kase: CaseView): string {
    return kase.id;
  }

  navigateToTask(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  navigateToCase(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  getTaskStatusLabel(status: string): string {
    return this.taskStatuses.find((s) => s.id === status)?.name ?? status;
  }

  getCaseStatusLabel(status: string): string {
    return this.caseStatuses.find((s) => s.id === status)?.name ?? status;
  }

  getStageBadgeClass(status: string): string {
    switch (status) {
      case 'DONE':
        return 'success';
      case 'CANCELLED':
      case 'BLOCKED':
        return 'error';
      case 'IN_PROGRESS':
      case 'IN_REVIEW':
        return 'warning';
      default:
        return 'neutral';
    }
  }

  getPriorityClass(priority?: string): string {
    const p = (priority || '').toLowerCase();
    if (p.includes('urgent') || p.includes('crit')) return 'priority-urgent';
    if (p.includes('high')) return 'priority-high';
    if (p.includes('med')) return 'priority-medium';
    if (p.includes('low')) return 'priority-low';
    return 'priority-medium';
  }

  getTypeBadgeClass(type?: string): string {
    const t = (type || '').toUpperCase();
    switch (t) {
      case 'BUG':
        return 'type-bug';
      case 'STORY':
        return 'type-story';
      case 'EPIC':
        return 'type-epic';
      case 'IMPROVEMENT':
        return 'type-improvement';
      case 'TEST':
        return 'type-test';
      default:
        return 'type-general';
    }
  }
}

