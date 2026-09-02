import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, tap, catchError, of } from 'rxjs';
import { DashboardService } from './services/dashboard.service';
import { DashboardHeroComponent } from './sections/hero/dashboard-hero.component';
import { DashboardSummaryCardsComponent } from './sections/summary-cards/dashboard-summary-cards.component';
import { DashboardProjectHealthMatrixComponent } from './sections/project-health-matrix/dashboard-project-health-matrix.component';
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
    CommonModule,
    DashboardHeroComponent,
    DashboardSummaryCardsComponent,
    DashboardProjectHealthMatrixComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly activeCardFilter = signal<string | null>(null);

  hero$!: Observable<HeroData | null>;
  summaryCards$!: Observable<SummaryCard[] | null>;
  projectHealthMatrix$!: Observable<ProjectHealthMatrix[] | null>;

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    const data: DashboardData = this.dashboardService.getDashboardData();

    this.hero$ = data.hero$.pipe(
      tap((val) => {
        if (val) this.isLoading.set(false);
      }),
      catchError((err) => {
        console.error('Dashboard load error:', err);
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load dashboard data. Please try again.');
        return of(null);
      })
    );

    this.summaryCards$ = data.summaryCards$.pipe(
      catchError(() => of(null))
    );

    this.projectHealthMatrix$ = data.projectHealthMatrix$.pipe(
      tap(() => this.isLoading.set(false)),
      catchError(() => of(null))
    );
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
}
