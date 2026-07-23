import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamMember } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-workload',
  imports: [CommonModule],
  templateUrl: './dashboard-workload.component.html',
  styleUrl: './dashboard-workload.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardWorkloadComponent {
  @Input() workload: TeamMember[] | null | undefined;
}
