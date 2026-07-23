import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Milestone } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-timeline',
  imports: [CommonModule],
  templateUrl: './dashboard-timeline.component.html',
  styleUrl: './dashboard-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardTimelineComponent {
  @Input() milestones: Milestone[] | null | undefined;
}
