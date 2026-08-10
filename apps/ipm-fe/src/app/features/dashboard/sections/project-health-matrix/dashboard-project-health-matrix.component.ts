import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectHealthMatrix } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-project-health-matrix',
  imports: [CommonModule],
  templateUrl: './dashboard-project-health-matrix.component.html',
  styleUrl: './dashboard-project-health-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardProjectHealthMatrixComponent {
  @Input() projectHealthMatrix: ProjectHealthMatrix[] | null = null;

  getHealthColor(status: string): string {
    switch (status) {
      case 'success':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'danger':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'success':
        return 'On Track';
      case 'warning':
        return 'At Risk';
      case 'danger':
        return 'Critical';
      default:
        return 'Unknown';
    }
  }

  getMetricClass(value: number): string {
    if (value >= 80) return 'metric-excellent';
    if (value >= 60) return 'metric-good';
    if (value >= 40) return 'metric-fair';
    return 'metric-poor';
  }

  trackByProjectName(index: number, item: ProjectHealthMatrix): string {
    return item.projectName;
  }
}
