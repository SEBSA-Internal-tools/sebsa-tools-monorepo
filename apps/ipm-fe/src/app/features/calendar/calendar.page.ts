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
import { Subscription } from 'rxjs';
import { CalendarViewComponent } from './components/calendar-view/calendar-view.component';
import { AuthService } from '../../core/services/auth.service';
import { CasesService, type CaseView } from '../../core/services/cases.service';
import { ProjectsService } from '../projects/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import {
  CreateCaseModalComponent,
  type CaseFormData,
} from '../cases/create-case/create-case-modal.component';
import {
  caseToCalendarItem,
  type CalendarItem,
  type CalendarKPI,
} from './models/calendar.models';
import type { CreateCaseRequest, ProjectSummary } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
  imports: [CommonModule, FormsModule, CalendarViewComponent, CreateCaseModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  private readonly casesService = inject(CasesService);
  private readonly projectsService = inject(ProjectsService);
  private readonly toastService = inject(ToastService);

  private casesSub?: Subscription;
  private projectsSub?: Subscription;

  // Real backend data states
  readonly rawCases = signal<CaseView[]>([]);
  readonly availableProjects = signal<ProjectSummary[]>([]);
  readonly selectedProjectId = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  // Modal state
  readonly isCreateCaseModalOpen = signal<boolean>(false);
  readonly initialCaseDueDate = signal<string>('');

  readonly selectedProjectName = computed<string>(() => {
    const id = this.selectedProjectId();
    if (!id) return '';
    const found = this.availableProjects().find((p) => p.id === id);
    return found ? found.name : '';
  });

  // Client-side instant filtering based on selected project
  // Avoids firing heavy duplicate backend API calls when user switches project dropdown
  readonly calendarCases = computed<CalendarItem[]>(() => {
    const selectedId = this.selectedProjectId();
    const cases = this.rawCases();
    const filtered = selectedId ? cases.filter((c) => c.projectId === selectedId) : cases;
    return filtered.map((c) => caseToCalendarItem(c));
  });

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
        label: 'Total Scheduled',
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
        label: 'Overdue Commitments',
        value: overdue,
        icon: 'error',
        colorVariant: 'error',
      },
    ];
  });

  ngOnInit(): void {
    this.loadProjects();
    this.loadCases();
  }

  ngOnDestroy(): void {
    this.casesSub?.unsubscribe();
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

  loadCases(force = false): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.casesSub?.unsubscribe();
    this.casesSub = this.casesService.loadAllCases(undefined, force).subscribe({
      next: (cases) => {
        this.rawCases.set(cases);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load cases from backend:', err);
        this.errorMessage.set('Could not load cases from the server. Please check connection and retry.');
        this.isLoading.set(false);
      },
    });
  }

  onProjectFilterChanged(projectId: string): void {
    this.selectedProjectId.set(projectId);
  }

  onCaseClicked(item: CalendarItem): void {
    this.router.navigate(['/cases', item.id]);
  }

  onCreateForDate(date: Date): void {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.initialCaseDueDate.set(`${y}-${m}-${d}`);
    this.isCreateCaseModalOpen.set(true);
  }

  onCreateCaseClicked(): void {
    this.initialCaseDueDate.set('');
    this.isCreateCaseModalOpen.set(true);
  }

  onCaseModalClosed(): void {
    this.isCreateCaseModalOpen.set(false);
    this.initialCaseDueDate.set('');
  }

  onCaseFormSubmitted(formData: CaseFormData): void {
    if (!formData.projectId) {
      this.toastService.error('Please select a project for the case.');
      return;
    }

    const dto: CreateCaseRequest = {
      projectId: formData.projectId,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priorityId: formData.priorityId,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      isCsoLabeled: formData.isCsoLabeled,
      category: formData.category,
    };

    this.casesService.createCase(dto).subscribe({
      next: (created) => {
        this.toastService.success(`Case "${formData.title}" created successfully!`);
        this.isCreateCaseModalOpen.set(false);
        // Reload to sync with calendar items
        this.loadCases(true);
      },
      error: (err) => {
        console.error('Failed to create case:', err);
        this.toastService.error('Failed to create case. Please try again.');
      },
    });
  }
}