import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import {
  DashboardHeroData,
  DashboardSummaryCard,
  DashboardProjectHealthItem,
  DashboardSummaryResponse,
  DashboardUrgentTask,
} from '@sebsa-pm-tool/shared-models';

export type { DashboardHeroData, DashboardSummaryCard, DashboardProjectHealthItem, DashboardUrgentTask };

export type HeroData = DashboardHeroData;
export type SummaryCard = DashboardSummaryCard;
export type ProjectHealthMatrix = DashboardProjectHealthItem;

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

export interface DashboardState {
  loading: boolean;
  error: string | null;
}

export interface DashboardData {
  hero$: Observable<HeroData | null>;
  summaryCards$: Observable<SummaryCard[] | null>;
  projectHealthMatrix$: Observable<ProjectHealthMatrix[] | null>;
  urgentTasks$: Observable<DashboardUrgentTask[] | null>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient, { optional: true });

  completeTask(taskId: string): Observable<unknown> {
    if (!this.http) return of(null);
    return this.http.patch(`/api/tasks/${taskId}`, { status: 'DONE' });
  }

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
        urgentTasks: [],
      });
    }
    return this.http.get<DashboardSummaryResponse>('/api/dashboard/summary');
  }

  getDashboardData(): DashboardData {
    const handleError = (error: unknown): Observable<null> => {
      console.error('Dashboard data fetch error:', error);
      return of(null);
    };

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
          map((res) =>
            res?.projectHealthMatrix ? (res.projectHealthMatrix as ProjectHealthMatrix[]) : null
          ),
          catchError(handleError),
          shareReplay(1)
        ),
        urgentTasks$: liveSummary$.pipe(
          map((res) => res ? (res.urgentTasks ?? []) as DashboardUrgentTask[] : null),
          catchError(handleError),
          shareReplay(1)
        ),
      };
    }

    return {
      hero$: of(null),
      summaryCards$: of([]),
      projectHealthMatrix$: of([]),
      urgentTasks$: of([]),
    };
  }
}
