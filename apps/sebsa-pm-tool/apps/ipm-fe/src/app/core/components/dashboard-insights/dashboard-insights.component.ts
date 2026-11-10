import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardInsight } from '../../utils/work-insights';
@Component({
  selector: 'app-dashboard-insights', standalone: true, imports: [RouterLink],
  template: `<section class="insight-section" [attr.aria-label]="title">
    <header><h2>{{ title }}</h2><p>{{ scope }}</p></header>
    <div class="insight-grid">
    @for (item of items; track item.label) {
      <article class="insight-card" [class.exception]="item.tone === 'danger'" [class.attention]="item.tone === 'warning'">
        <span class="insight-label">{{ item.label }}</span><strong class="insight-value">{{ item.value }}</strong>
        <p>{{ item.description }}</p>
        @if (item.link) { <a [routerLink]="item.link">{{ item.linkLabel || 'View details' }} <span aria-hidden="true">&nearr;</span></a> }
      </article>
    }
    </div>
  </section>`,
  styleUrl: './dashboard-insights.component.scss', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardInsightsComponent {
  @Input() title = 'At a glance';
  @Input() scope = '';
  @Input() items: readonly DashboardInsight[] = [];
}
