import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-error-boundary',
  imports: [CommonModule],
  template: `
    <div class="error-boundary" *ngIf="error">
      <div class="error-content">
        <h3>Something went wrong</h3>
        <p>{{ error }}</p>
      </div>
    </div>
    <ng-content *ngIf="!error"></ng-content>
  `,
  styles: `
    .error-boundary {
      padding: 1rem;
      border: 1px solid #dc2626;
      border-radius: 0.5rem;
      background-color: #fee2e2;
      color: #7f1d1d;
    }
    .error-content h3 {
      margin: 0 0 0.5rem 0;
      font-weight: 600;
    }
    .error-content p {
      margin: 0;
      font-size: 0.875rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBoundaryComponent {
  @Input() error: string | null = null;
}
