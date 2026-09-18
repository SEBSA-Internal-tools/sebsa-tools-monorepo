import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigurationPanelComponent } from '../../../core/components/configuration-panel/configuration-panel.component';

/** System-wide configuration: the GLOBAL scope, applying to every non-CSO
 * project. CSO keeps its own list under the CSO section. */
@Component({
  standalone: true,
  selector: 'app-configuration-page',
  imports: [CommonModule, ConfigurationPanelComponent],
  template: `
    <div class="page-container">
      <header class="sebsa-page-header">
        <span class="sebsa-eyebrow">SYSTEM</span>
        <h1 class="sebsa-page-title">Configuration</h1>
        <p class="sebsa-page-desc">
          Types, statuses and priorities shared by every project. CSO projects use their own
          list, managed from the CSO section.
        </p>
      </header>

      <section class="sebsa-card panel-card">
        <app-configuration-panel scope="GLOBAL"></app-configuration-panel>
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      background-color: var(--surface-page);
    }
    .page-container {
      padding: 32px 40px;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .panel-card {
      padding: 24px 28px;
    }
    @media (max-width: 768px) {
      .page-container { padding: 16px 12px; gap: 16px; }
      .panel-card { padding: 16px 12px; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPageComponent {}
