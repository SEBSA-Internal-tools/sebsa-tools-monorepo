import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
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
  @Input() activeFilter: string | null = null;
  @Input() loading = false;

  @Output() cardClick = new EventEmitter<string>();

  readonly skeletonCards = [1, 2, 3, 4];

  getCardKey(card: SummaryCard): string {
    const label = card.label.toLowerCase();
    if (label.includes('active project')) return 'ACTIVE_PROJECTS';
    if (label.includes('open task')) return 'OPEN_TASKS';
    if (label.includes('risk') || label.includes('block')) return 'RISKS';
    if (label.includes('delivery') || label.includes('health')) return 'DELIVERY_HEALTH';
    return card.label;
  }

  isCardActive(card: SummaryCard): boolean {
    return this.activeFilter === this.getCardKey(card);
  }

  onCardClick(card: SummaryCard): void {
    const key = this.getCardKey(card);
    this.cardClick.emit(key);
  }
}
