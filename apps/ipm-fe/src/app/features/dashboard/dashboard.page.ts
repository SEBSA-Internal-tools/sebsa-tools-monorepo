import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { DashboardService } from './services/dashboard.service';
import { DashboardHeroComponent } from './sections/hero/dashboard-hero.component';
import { DashboardSummaryCardsComponent } from './sections/summary-cards/dashboard-summary-cards.component';
import { DashboardProjectHealthMatrixComponent } from './sections/project-health-matrix/dashboard-project-health-matrix.component';
import type {
  HeroData,
  SummaryCard,
  ProjectHealthMatrix,
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
export class DashboardPageComponent {
  private dashboardService = inject(DashboardService);
  private dashboard = this.dashboardService.getDashboardData();

  // Observable streams from services
  hero$: Observable<HeroData | null> = this.dashboard.hero$;
  summaryCards$: Observable<SummaryCard[] | null> = this.dashboard.summaryCards$;
  projectHealthMatrix$: Observable<ProjectHealthMatrix[] | null> = this.dashboard.projectHealthMatrix$;
}
