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
import { TasksService, type TaskView } from '../../core/services/tasks.service';
import { ProjectsService } from '../projects/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import {
  taskToCalendarItem,
  type CalendarItem,
  type CalendarKPI,
} from './models/calendar.models';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
  imports: [CommonModule, FormsModule, CalendarViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly toastService = inject(ToastService);

  private tasksSub?: Subscription;
  private projectsSub?: Subscription;

  // Real backend data states
  readonly rawTasks = signal<TaskView[]>([]);
  readonly availableProjects = signal<ProjectSummary[]>([]);
  readonly selectedProjectId = signal<string>('');
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

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
    const filtered = selectedId ? tasks.filter((t) => t.projectId === selectedId) : tasks;
    return filtered.map((t) => taskToCalendarItem(t));
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
    this.tasksSub?.unsubscribe();
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

    this.tasksSub?.unsubscribe();
    this.tasksSub = this.tasksService.loadAllTasks(undefined, force).subscribe({
      next: (tasks) => {
        this.rawTasks.set(tasks);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load tasks from backend:', err);
        this.errorMessage.set('Could not load tasks from the server. Please check connection and retry.');
        this.isLoading.set(false);
      },
    });
  }

  onProjectFilterChanged(projectId: string): void {
    this.selectedProjectId.set(projectId);
  }

  onTaskClicked(item: CalendarItem): void {
    this.router.navigate(['/tasks', item.id]);
  }

  onCreateForDate(date: Date): void {
    const selectedProj = this.selectedProjectId();
    if (selectedProj) {
      this.router.navigate(['/projects', selectedProj], { queryParams: { tab: 'tasklist' } });
    } else {
      this.router.navigate(['/tasks']);
    }
  }

  onCreateTaskClicked(): void {
    const selectedProj = this.selectedProjectId();
    if (selectedProj) {
      this.router.navigate(['/projects', selectedProj], { queryParams: { tab: 'tasklist' } });
    } else {
      this.router.navigate(['/tasks']);
    }
  }
}