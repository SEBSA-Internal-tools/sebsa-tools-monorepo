import { Injectable } from '@angular/core';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { HeroService } from './hero.service';
import { SummaryCardsService } from './summary-cards.service';
import { PortfolioService } from './portfolio.service';
import { TimelineService } from './timeline.service';
import { WorkloadService } from './workload.service';
import { ActivityService } from './activity.service';
import { ProjectHealthMatrixService } from './project-health-matrix.service';

// Data Models/Interfaces
export interface HeroData {
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
  projectName: string;
  health: string;
  healthStatus: 'success' | 'warning' | 'danger';
  budget: number;
  timeline: number;
  resources: number;
  risks: number;
  completionPercentage: number;
  team: string[];
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
  constructor(
    private heroService: HeroService,
    private summaryService: SummaryCardsService,
    private portfolioService: PortfolioService,
    private timelineService: TimelineService,
    private workloadService: WorkloadService,
    private activityService: ActivityService,
    private projectHealthMatrixService: ProjectHealthMatrixService
  ) {}

  getDashboardData(): DashboardData {
    const handleError = (error: any) => {
      console.error('Dashboard data fetch error:', error);
      return of(null);
    };

    return {
      hero$: this.heroService.getHeroData().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      summaryCards$: this.summaryService.getSummaryCards().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      portfolio$: this.portfolioService.getProjects().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      timeline$: this.timelineService.getMilestones().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      workload$: this.workloadService.getTeamWorkload().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      activity$: this.activityService.getRecentActivity().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
      projectHealthMatrix$: this.projectHealthMatrixService.getProjectHealthMatrix().pipe(
        catchError(handleError),
        shareReplay(1)
      ),
    };
  }
}
