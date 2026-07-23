import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-loading-skeleton',
  imports: [CommonModule],
  template: `
    <div class="skeleton" [style.height.rem]="height" [style.width.%]="width"></div>
  `,
  styles: `
    .skeleton {
      background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 0.375rem;
    }

    @keyframes loading {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSkeletonComponent {
  @Input() height: number = 2;
  @Input() width: number = 100;
}
