import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeroData } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-hero',
  imports: [CommonModule],
  templateUrl: './dashboard-hero.component.html',
  styleUrl: './dashboard-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeroComponent {
  @Input() data: HeroData | null = null;
}
