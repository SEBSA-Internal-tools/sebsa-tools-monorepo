import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-portfolio',
  imports: [CommonModule],
  templateUrl: './dashboard-portfolio.component.html',
  styleUrl: './dashboard-portfolio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPortfolioComponent {
  @Input() projects: Project[] | null | undefined;
}
