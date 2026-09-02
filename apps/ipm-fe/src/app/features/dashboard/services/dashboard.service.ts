import { Injectable, inject, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { HeroService } from './hero.service';
import { SummaryCardsService } from './summary-cards.service';
import { PortfolioService } from './portfolio.service';
import { TimelineService } from './timeline.service';
import { WorkloadService } from './workload.service';
import { ActivityService } from './activity.service';
import { ProjectHealthMatrixService } from './project-health-matrix.service';
import { DashboardSummaryResponse } from '@sebsa-pm-tool/shared-models';

// Data Models/Interfaces
export interface HeroData {
  greeting?: string;
  title: string;
  description: string;
  stats: Array<{
    icon: string;
    value: string;
    label: string;
  }>;
}

export interface SummaryCard {
  label: string;
  value: string;
  change: string;
  icon: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}

export interface Project {
  name: string;
  owner: string;
  status: string;
  statusTone: 'success' | 'warning' | 'progress';
  progress: number;
  due: string;
}

export interface Milestone {
  title: string;
  owner: string;
  date: string;
  complete: boolean;
}

export interface TeamMember {
  name: string;
  role: string;
  load: number;
}

export interface ActivityItem {
  actor: string;
  action: string;
  target: string;
  time: string;
}

export interface ProjectHealthMatrix {
  id?: string;
  projectName: string;
  status?: string;
  health: string;
  healthStatus: 'success' | 'warning' | 'danger';
  budget: number;
  timeline: number;
  resources: number;
  risks: number;
  completionPercentage: number;
  team: string[];
  totalTasks?: number;
  completedTasks?: number;
  color?: string | null;
}

export interface DashboardState {
  loading: boolean;
  error: string | null;
}

export interface DashboardData {
  hero$: Observable<HeroData | null>;
  summaryCards$: Observable<SummaryCard[] | null>;
  portfolio$: Observable<Project[] | null>;
  timeline$: Observable<Milestone[] | null>;
  workload$: Observable<TeamMember[] | null>;
  activity$: Observable<ActivityItem[] | null>;
  projectHealthMatrix$: Observable<ProjectHealthMatrix[] | null>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient, { optional: true });

  constructor(
    @Optional() private heroService?: HeroService,
    @Optional() private summaryService?: SummaryCardsService,
    @Optional() private portfolioService?: PortfolioService,
    @Optional() private timelineService?: TimelineService,
    @Optional() private workloadService?: WorkloadService,
    @Optional() private activityService?: ActivityService,
    @Optional() private projectHealthMatrixService?: ProjectHealthMatrixService
  ) {}

  getSummary(): Observable<DashboardSummaryResponse> {
    if (!this.http) {
      return of({
        hero: {
          title: 'Keep delivery, team load, and blockers in one view',
          description:
            'This dashboard gives a fast read on project health, task flow, and release risk.',
          stats: [],
        },
        summaryCards: [],
        projectHealthMatrix: [],
      });
    }
    return this.http.get<DashboardSummaryResponse>('/api/dashboard/summary');
  }

  getDashboardData(): DashboardData {
    const handleError = (error: unknown): Observable<null> => {
      console.error('Dashboard data fetch error:', error);
      return of(null);
    };

    // If HTTP client is present, fetch live aggregated summary from backend
    if (this.http) {
      const liveSummary$ = this.getSummary().pipe(
        catchError(handleError),
        shareReplay(1)
      );

      return {
        hero$: liveSummary$.pipe(
          map((res) => {
            if (!res?.hero) return null;
            return {
              greeting: res.hero.greeting,
              title: res.hero.title,
              description: res.hero.description,
              stats: res.hero.stats,
            };
          }),
          catchError(handleError),
          shareReplay(1)
        ),
        summaryCards$: liveSummary$.pipe(
          map((res) => (res?.summaryCards ? (res.summaryCards as SummaryCard[]) : null)),
          catchError(handleError),
          shareReplay(1)
        ),
        projectHealthMatrix$: liveSummary$.pipe(
          map((res) => (res?.projectHealthMatrix ? (res.projectHealthMatrix as ProjectHealthMatrix[]) : null)),
          catchError(handleError),
          shareReplay(1)
        ),
        portfolio$: this.portfolioService
          ? this.portfolioService.getProjects().pipe(catchError(handleError), shareReplay(1))
          : of(null),
        timeline$: this.timelineService
          ? this.timelineService.getMilestones().pipe(catchError(handleError), shareReplay(1))
          : of(null),
        workload$: this.workloadService
          ? this.workloadService.getTeamWorkload().pipe(catchError(handleError), shareReplay(1))
          : of(null),
        activity$: this.activityService
          ? this.activityService.getRecentActivity().pipe(catchError(handleError), shareReplay(1))
          : of(null),
      };
    }

    // Fallback for tests or environments without HttpClient
    const heroSource$: Observable<HeroData | null> = this.heroService
      ? this.heroService.getHeroData()
      : of(null);

    const summarySource$: Observable<SummaryCard[] | null> = this.summaryService
      ? this.summaryService.getSummaryCards()
      : of(null);

    const portfolioSource$: Observable<Project[] | null> = this.portfolioService
      ? this.portfolioService.getProjects()
      : of(null);

    const timelineSource$: Observable<Milestone[] | null> = this.timelineService
      ? this.timelineService.getMilestones()
      : of(null);

    const workloadSource$: Observable<TeamMember[] | null> = this.workloadService
      ? this.workloadService.getTeamWorkload()
      : of(null);

    const activitySource$: Observable<ActivityItem[] | null> = this.activityService
      ? this.activityService.getRecentActivity()
      : of(null);

    const matrixSource$: Observable<ProjectHealthMatrix[] | null> = this.projectHealthMatrixService
      ? this.projectHealthMatrixService.getProjectHealthMatrix()
      : of(null);

    return {
      hero$: heroSource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      summaryCards$: summarySource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      portfolio$: portfolioSource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      timeline$: timelineSource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      workload$: workloadSource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      activity$: activitySource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      projectHealthMatrix$: matrixSource$.pipe(
        catchError(handleError),
        shareReplay(1)
      ),
    };
  }
}
