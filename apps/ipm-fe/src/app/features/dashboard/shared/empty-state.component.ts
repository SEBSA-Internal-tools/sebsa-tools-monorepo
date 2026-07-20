import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-empty-state',
  imports: [CommonModule],
  template: `
    <div class="empty-state">
      <div class="empty-icon">{{ icon }}</div>
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
    </div>
  `,
  styles: `
    .empty-state {
      padding: 2rem 1rem;
      text-align: center;
      color: #6b7280;
    }
    .empty-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      opacity: 0.5;
    }
    h3 {
      margin: 0 0 0.5rem 0;
      font-weight: 600;
      color: #374151;
    }
    p {
      margin: 0;
      font-size: 0.875rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() icon: string = '📭';
  @Input() title: string = 'No data';
  @Input() message: string = 'No items to display';
}
