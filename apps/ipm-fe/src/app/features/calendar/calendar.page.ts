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
  // Avoids firing heavy duplicate backend API calls when user switches project dropdown
  readonly calendarTasks = computed<CalendarItem[]>(() => {
    const selectedId = this.selectedProjectId();
    const tasks = this.rawTasks();
    const cases = this.rawCases();
    const filteredTasks = selectedId ? tasks.filter((t) => t.projectId === selectedId) : tasks;
    const filteredCases = selectedId ? cases.filter((c) => c.projectId === selectedId) : cases;
    return [
      ...filteredCases.map((c) => caseToCalendarItem(c)),
      ...filteredTasks.map((t) => taskToCalendarItem(t)),
    ];
  });

  readonly kpiMetrics = computed<CalendarKPI[]>(() => {
    const tasks = this.calendarTasks();
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const urgentOrHigh = tasks.filter(
      (t) => t.priority === 'Urgent' || t.priority === 'High'
    ).length;
    const overdue = tasks.filter((t) => t.isOverdue).length;

    return [
      {
        label: 'Total Scheduled Tasks',
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
        label: 'In Progress Tasks',
        value: inProgress,
        icon: 'pending_actions',
        colorVariant: 'purple',
      },
      {
        label: 'Overdue Tasks',
        value: overdue,
        icon: 'error',
        colorVariant: 'error',
      },
    ];
  });

  ngOnInit(): void {
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

  onTaskClicked(item: CalendarItem): void {
    const isCase = this.rawCases().some((c) => c.id === item.id) || (item.raw && typeof item.raw === 'object' && 'isCsoLabeled' in item.raw);
    if (isCase) {
      this.router.navigate(['/cases', item.id]);
    } else {
      this.router.navigate(['/tasks', item.id]);
    }
  }

  onCreateForDate(date: Date): void {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.createCaseDueDate.set(`${y}-${m}-${d}`);
    this.isCreateCaseOpen.set(true);
  }

  onCreateTaskClicked(): void {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    this.createCaseDueDate.set(`${y}-${m}-${d}`);
    this.isCreateCaseOpen.set(true);
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