import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { DashboardInsightsComponent } from '../../core/components/dashboard-insights/dashboard-insights.component';
import type { DashboardInsight } from '../../core/utils/work-insights';
import { CommonModule } from '@angular/common';
import { Observable, map, tap, catchError, of, Subject, takeUntil } from 'rxjs';
import { DashboardService } from './services/dashboard.service';
import { DashboardHeroComponent } from './sections/hero/dashboard-hero.component';
import { DashboardSummaryCardsComponent } from './sections/summary-cards/dashboard-summary-cards.component';
import { DashboardProjectHealthMatrixComponent } from './sections/project-health-matrix/dashboard-project-health-matrix.component';
import { DashboardUrgentTasksComponent, type TaskCompletionRequest } from './sections/urgent-tasks/dashboard-urgent-tasks.component';
import type { DashboardUrgentTask } from '@sebsa-pm-tool/shared-models';
import type {
  HeroData,
  SummaryCard,
  ProjectHealthMatrix,
  DashboardData,
} from './services/dashboard.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  imports: [
    CommonModule, DashboardInsightsComponent,
    DashboardHeroComponent,
    DashboardSummaryCardsComponent,
    DashboardProjectHealthMatrixComponent,
    DashboardUrgentTasksComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly destroy$ = new Subject<void>();

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly activeCardFilter = signal<string | null>(null);

  readonly loadedAt = signal<Date | null>(null);
  portfolioInsights$!: Observable<DashboardInsight[] | null>;
  hero$!: Observable<HeroData | null>;
  summaryCards$!: Observable<SummaryCard[] | null>;
  projectHealthMatrix$!: Observable<ProjectHealthMatrix[] | null>;
  urgentTasks$!: Observable<DashboardUrgentTask[] | null>;

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    // Background re-sync when user returns to the tab (without showing full skeleton)
    this.refreshSilently();
  }

  loadData(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
    }
    this.errorMessage.set('');

    const data: DashboardData = this.dashboardService.getDashboardData();

    this.hero$ = data.hero$.pipe(
      tap((val) => {
        this.isLoading.set(false);
        if (val) this.loadedAt.set(new Date());
        if (!val) this.errorMessage.set('Dashboard data is unavailable. Please retry.');
      }),
      catchError((err) => {
        console.error('Dashboard load error:', err);
        if (!silent) {
          this.isLoading.set(false);
          this.errorMessage.set('Failed to load dashboard data. Please try again.');
        }
        return of(null);
      })
    );

    this.summaryCards$ = data.summaryCards$.pipe(
      catchError(() => of(null))
    );

    this.urgentTasks$ = data.urgentTasks$.pipe(
      catchError(() => of(null))
    );

    this.portfolioInsights$ = data.projectHealthMatrix$.pipe(map(projects => {
      if (!projects) return null;
      const live = projects.filter(project => !['COMPLETED', 'ARCHIVED'].includes(project.status));
      const review = live.filter(project => project.healthStatus !== 'success');
      const total = projects.reduce((sum, project) => sum + project.totalTasks, 0);
      const done = projects.reduce((sum, project) => sum + project.completedTasks, 0);
      const empty = live.filter(project => project.totalTasks === 0);
      return [
        { label: 'Task completion', value: total ? Math.round(done / total * 100) + '%' : 'N/A', description: done + ' completed of ' + total + ' tasks across accessible projects' },
        { label: 'Projects to review', value: review.length, description: 'Flagged by the existing project health indicators', tone: review.length ? 'warning' : 'neutral', ...(review[0] ? {link: ['/projects', review[0].id], linkLabel: 'Review a flagged project'} : {}) },
        { label: 'Projects without tasks', value: empty.length, description: 'Excludes completed and archived projects', ...(empty[0] ? {link: ['/projects', empty[0].id], linkLabel: 'Plan the next step'} : {}) },
      ] as DashboardInsight[];
    }));

    this.projectHealthMatrix$ = data.projectHealthMatrix$.pipe(
      tap(() => this.isLoading.set(false)),
      catchError(() => of(null))
    );
  }

  refreshSilently(): void {
    this.loadData(true);
  }

  onCardFilterSelected(filterKey: string): void {
    if (this.activeCardFilter() === filterKey) {
      this.activeCardFilter.set(null);
    } else {
      this.activeCardFilter.set(filterKey);
    }
  }

  clearCardFilter(): void {
    this.activeCardFilter.set(null);
  }

  onTaskCompleted(request: TaskCompletionRequest): void {
    this.dashboardService
      .completeTask(request.taskId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          request.succeed();
          this.refreshSilently();
        },
        error: (err) => {
          request.fail();
          console.error('Failed to complete task:', err);
        },
      });
  }
}
