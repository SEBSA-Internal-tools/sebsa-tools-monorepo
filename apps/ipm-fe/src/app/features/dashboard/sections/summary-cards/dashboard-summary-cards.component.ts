import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SummaryCard } from '../../services/dashboard.service';

@Component({
  standalone: true,
  selector: 'dashboard-summary-cards',
  imports: [CommonModule],
  templateUrl: './dashboard-summary-cards.component.html',
  styleUrl: './dashboard-summary-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSummaryCardsComponent {
  @Input() cards: SummaryCard[] | null | undefined;
}
