import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  type OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CalendarViewComponent } from './components/calendar-view/calendar-view.component';
import { AuthService } from '../../core/services/auth.service';
import { CasesService } from '../../core/services/cases.service';
import { ProjectsService } from '../projects/services/projects.service';
import { NotificationService } from '../../core/services/notification.service';
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
export class CalendarPageComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  private readonly casesService = inject(CasesService);
  private readonly projectsService = inject(ProjectsService);
  private readonly notificationService = inject(NotificationService);

  // Real backend data states
  readonly calendarCases = signal<CalendarItem[]>([]);
  readonly availableProjects = signal<ProjectSummary[]>([]);
  readonly selectedProjectId = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  // Modal state
  readonly isCreateCaseModalOpen = signal<boolean>(false);

  readonly selectedProjectName = computed<string>(() => {
    const id = this.selectedProjectId();
    if (!id) return '';
    const found = this.availableProjects().find((p) => p.id === id);
    return found ? found.name : '';
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

  loadProjects(): void {
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        this.availableProjects.set(projects);
      },
      error: (err) => {
        console.error('Failed to fetch projects list for calendar:', err);
      },
    });
  }

  loadCases(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    const projectId = this.selectedProjectId() || undefined;

    this.casesService.loadAllCases(projectId).subscribe({
      next: (cases) => {
        const calendarItems = cases.map((c) => caseToCalendarItem(c));
        this.calendarCases.set(calendarItems);
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
    this.loadCases();
  }

  onCaseClicked(item: CalendarItem): void {
    this.router.navigate(['/cases', item.id]);
  }

  onCreateForDate(date: Date): void {
    this.isCreateCaseModalOpen.set(true);
  }

  onCreateCaseClicked(): void {
    this.isCreateCaseModalOpen.set(true);
  }

  onCaseModalClosed(): void {
    this.isCreateCaseModalOpen.set(false);
  }

  onCaseFormSubmitted(formData: CaseFormData): void {
    if (!formData.projectId) {
      this.notificationService.error('Please select a project for the case.');
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
        this.notificationService.success(`Case "${formData.title}" created successfully!`);
        this.isCreateCaseModalOpen.set(false);
        // Reload to sync with calendar items
        this.loadCases();
      },
      error: (err) => {
        console.error('Failed to create case:', err);
        this.notificationService.error('Failed to create case. Please try again.');
      },
    });
  }
}