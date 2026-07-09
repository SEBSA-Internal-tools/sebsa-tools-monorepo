import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityItem } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-activity',
  imports: [CommonModule],
  templateUrl: './dashboard-activity.component.html',
  styleUrl: './dashboard-activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardActivityComponent {
  @Input() activity: ActivityItem[] | null | undefined;
}
