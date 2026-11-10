import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  type OnInit,
  type OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { CalendarViewComponent } from './components/calendar-view/calendar-view.component';
import { AuthService } from '../../core/services/auth.service';
import { CaseCreationAccessService } from '../../core/services/case-creation-access.service';
import { TasksService, type TaskView } from '../../core/services/tasks.service';
import { CasesService, type CaseView } from '../../core/services/cases.service';
import { ProjectsService } from '../projects/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import {
  taskToCalendarItem,
  caseToCalendarItem,
  type CalendarItem,
  type CalendarKPI,
} from './models/calendar.models';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';
import { CustomSelectComponent } from '../../core/components/custom-select/custom-select.component';
import { CreateCaseModalComponent, type CaseFormData } from '../cases/create-case/create-case-modal.component';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
  imports: [
    CommonModule,
    FormsModule,
    CalendarViewComponent,
    CustomSelectComponent,
    CreateCaseModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  protected readonly caseAccess = inject(CaseCreationAccessService);
  private readonly tasksService = inject(TasksService);
  private readonly casesService = inject(CasesService);
  private readonly projectsService = inject(ProjectsService);
  private readonly toastService = inject(ToastService);

  private dataSub?: Subscription;
  private projectsSub?: Subscription;

  // Real backend data states
  readonly rawTasks = signal<TaskView[]>([]);
  readonly rawCases = signal<CaseView[]>([]);
  readonly availableProjects = signal<ProjectSummary[]>([]);
  readonly selectedProjectId = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  // Create Case Modal state
  readonly isCreateCaseOpen = signal<boolean>(false);
  readonly createCaseDueDate = signal<string>('');

  readonly selectedProjectName = computed<string>(() => {
    const id = this.selectedProjectId();
    if (!id) return '';
    const found = this.availableProjects().find((p) => p.id === id);
    return found ? found.name : '';
  });

  // Client-side instant filtering based on selected project
  // Groups tasks and subtasks under their parent Cases for clean, structured display
  readonly calendarCases = computed<CalendarItem[]>(() => {
    const selectedId = this.selectedProjectId();
    const tasks = this.rawTasks();
    const cases = this.rawCases();
    const filteredTasks = selectedId ? tasks.filter((t) => t.projectId === selectedId) : tasks;
    const filteredCases = selectedId ? cases.filter((c) => c.projectId === selectedId) : cases;

    const tasksByCase = new Map<string, TaskView[]>();

    for (const t of filteredTasks) {
      if (t.caseId) {
        const bucket = tasksByCase.get(t.caseId) || [];
        bucket.push(t);
        tasksByCase.set(t.caseId, bucket);
      }
    }

    return filteredCases.map((c) => {
      const caseTasks = tasksByCase.get(c.id) || [];
      return caseToCalendarItem(c, caseTasks);
    });
  });

  // Backward-compatibility alias
  readonly calendarTasks = this.calendarCases;

  readonly kpiMetrics = computed<CalendarKPI[]>(() => {
    const cases = this.calendarCases();
    const total = cases.length;
    const inProgress = cases.filter((c) => c.status === 'IN_PROGRESS').length;
    const urgentOrHigh = cases.filter(
      (c) => c.priority === 'Urgent' || c.priority === 'High'
    ).length;
    const overdue = cases.filter((c) => c.isOverdue).length;

    return [
      {
        label: 'Total Scheduled Cases',
        value: total,
        icon: 'calendar_month',
        colorVariant: 'primary',
      },
      {
        label: 'High & Urgent Priority',
        value: urgentOrHigh,
        icon: 'warning',
        colorVariant: 'warning',
      },
      {
        label: 'In Progress Cases',
        value: inProgress,
        icon: 'pending_actions',
        colorVariant: 'purple',
      },
      {
        label: 'Overdue Cases',
        value: overdue,
        icon: 'error',
        colorVariant: 'error',
      },
    ];
  });

  ngOnInit(): void {
    this.caseAccess.ensureLoaded();
    this.loadProjects();
    this.loadTasks();
  }

  ngOnDestroy(): void {
    this.dataSub?.unsubscribe();
    this.projectsSub?.unsubscribe();
  }

  loadProjects(): void {
    if (this.availableProjects().length > 0) return;
    this.projectsSub?.unsubscribe();
    this.projectsSub = this.projectsService.getProjects().subscribe({
      next: (projects) => {
        this.availableProjects.set(projects);
      },
      error: (err) => {
        console.error('Failed to fetch projects list for calendar:', err);
      },
    });
  }

  loadTasks(force = false): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.dataSub?.unsubscribe();
    this.dataSub = forkJoin({
      tasks: this.tasksService.loadAllTasks(undefined, force),
      cases: this.casesService.loadAllCases(undefined, force),
    }).subscribe({
      next: ({ tasks, cases }) => {
        this.rawTasks.set(tasks);
        this.rawCases.set(cases);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load tasks and cases from backend:', err);
        this.errorMessage.set('Could not load calendar data from the server. Please check connection and retry.');
        this.isLoading.set(false);
      },
    });
  }

  onProjectFilterChanged(projectId: string): void {
    this.selectedProjectId.set(projectId);
  }

  onCaseClicked(item: CalendarItem): void {
    const caseId = item.caseId || item.id;
    this.router.navigate(['/cases', caseId]);
  }

  onTaskClicked(item: CalendarItem): void {
    this.onCaseClicked(item);
  }

  onCreateForDate(date: Date): void {
    if (!this.caseAccess.canCreateAny()) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.createCaseDueDate.set(`${y}-${m}-${d}`);
    this.isCreateCaseOpen.set(true);
  }

  onCreateCaseClicked(): void {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    this.createCaseDueDate.set(`${y}-${m}-${d}`);
    this.isCreateCaseOpen.set(true);
  }

  onCreateTaskClicked(): void {
    this.onCreateCaseClicked();
  }

  onCreateCaseSubmit(formData: CaseFormData): void {
    this.casesService.createCase(formData).subscribe({
      next: () => {
        this.toastService.show('Case created successfully', 'success');
        this.isCreateCaseOpen.set(false);
        this.loadTasks(true);
      },
      error: (err) => {
        console.error('Failed to create case from calendar:', err);
        this.toastService.show(err?.error?.message || 'Failed to create case', 'error');
      },
    });
  }
}