import { Component, inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectsService } from '../../services/projects.service';
import { CasesService } from '../../../../core/services/cases.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ProjectDetailHeaderComponent } from './components/header/project-detail-header.component';
import { ProjectNavTabsComponent } from './components/nav-tabs/project-nav-tabs.component';
import { ProjectKanbanComponent } from './components/kanban/project-kanban.component';
import { ProjectTaskListComponent } from './components/task-list/project-task-list.component';
import { ProjectTeamComponent } from './components/team/project-team.component';
import { ProjectSprintComponent } from './components/sprint/project-sprint.component';
import { ProjectOverviewComponent } from './components/overview/project-overview.component';
import { ProjectConfigurationComponent } from './components/configuration/project-configuration.component';
import { CalendarViewComponent } from '../../../calendar/components/calendar-view/calendar-view.component';
import {
  caseToCalendarItem,
  type CalendarItem,
  type CalendarKPI,
} from '../../../calendar/models/calendar.models';
import { CreateCaseModalComponent, type CaseFormData } from '../../../cases/create-case/create-case-modal.component';
import {
  CreateProjectModalComponent,
  type ProjectFormData,
} from '../../components/modals/create-project/create-project-modal.component';
import type { CreateCaseRequest, Project } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-project-detail',
  imports: [
    CommonModule,
    ProjectDetailHeaderComponent,
    ProjectNavTabsComponent,
    ProjectKanbanComponent,
    ProjectTaskListComponent,
    ProjectTeamComponent,
    ProjectSprintComponent,
    ProjectOverviewComponent,
    CalendarViewComponent,
    CreateCaseModalComponent,
    CreateProjectModalComponent,
    ProjectConfigurationComponent,
  ],
  templateUrl: './project-detail.page.html',
  styleUrl: './project-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected readonly authService = inject(AuthService);
  private projectsService = inject(ProjectsService);
  private casesService = inject(CasesService);
  private notificationService = inject(NotificationService);

  readonly project = signal<Project | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly initialCaseDueDate = signal<string>('');

  activeTab: 'overview' | 'kanban' | 'tasklist' | 'calendar' | 'sprint' | 'team' | 'configuration' = 'kanban';
  isTaskModalOpen = false;
  isEditModalOpen = false;

  readonly projectCalendarItems = computed<CalendarItem[]>(() => {
    const cases = this.casesService.cases();
    return cases.map((c) => caseToCalendarItem(c));
  });

  readonly calendarKpis = computed<CalendarKPI[]>(() => {
    const items = this.projectCalendarItems();
    const total = items.length;
    const inProgress = items.filter((c) => c.status === 'IN_PROGRESS').length;
    const urgentOrHigh = items.filter(
      (c) => c.priority === 'Urgent' || c.priority === 'High'
    ).length;
    const overdue = items.filter((c) => c.isOverdue).length;

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
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      this.router.navigate(['/projects']);
      return;
    }
    this.loadProject(projectId);
  }

  private loadProject(projectId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.projectsService.getProject(projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.casesService.loadCases(project.id);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.router.navigate(['/projects']);
      },
    });
  }

  onTabChange(tab: typeof this.activeTab): void {
    this.activeTab = tab;
    if (tab === 'calendar') {
      const p = this.project();
      if (p) {
        this.casesService.loadCases(p.id);
      }
    }
  }

  onAddTaskClick(): void {
    this.initialCaseDueDate.set('');
    this.isTaskModalOpen = true;
  }

  closeTaskModal(): void {
    this.isTaskModalOpen = false;
    this.initialCaseDueDate.set('');
  }

  onCreateForDate(date: Date): void {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.initialCaseDueDate.set(`${y}-${m}-${d}`);
    this.isTaskModalOpen = true;
  }

  onCreateTask(formData: CaseFormData): void {
    const current = this.project();
    if (!current) {
      return;
    }

    const dto: CreateCaseRequest = {
      projectId: current.id,
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

    this.isLoading.set(true);
    this.casesService.createCase(dto).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.closeTaskModal();
        this.notificationService.success(`Case "${formData.title}" created successfully!`);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to create case. Please try again.');
        this.notificationService.error('Failed to create case. Please try again.');
      },
    });
  }


  onEditClick(): void {
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
  }

  onEditProject(formData: ProjectFormData): void {
    const current = this.project();
    if (!current) return;

    this.errorMessage.set('');
    this.projectsService
      .updateProject(current.id, {
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        customType: formData.customType,
        isCsoProject: formData.isCsoProject,
        customerId: formData.customerId,
        status: formData.status,
      })
      .subscribe({
        next: (updated) => {
          this.project.set(updated);
          this.closeEditModal();
        },
        error: () => {
          this.errorMessage.set('Failed to update project. Please try again.');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }
}
