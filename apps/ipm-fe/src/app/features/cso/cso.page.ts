import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CsoDashboardTabComponent } from './tabs/dashboard/cso-dashboard-tab.component';
import { CsoOverviewTabComponent } from './tabs/overview/cso-overview-tab.component';
import { CsoQueueTabComponent } from './tabs/queue/cso-queue-tab.component';
import { CsoNavTabsComponent } from './components/nav-tabs/cso-nav-tabs.component';

@Component({
  standalone: true,
  selector: 'app-cso-page',
  imports: [
    CommonModule,
    CsoNavTabsComponent,
    CsoDashboardTabComponent,
    CsoOverviewTabComponent,
    CsoQueueTabComponent,
  ],
  templateUrl: './cso.page.html',
  styleUrl: './cso.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoPageComponent {
  protected activeTab: 'dashboard' | 'overview' | 'queue' = 'dashboard';
  /** Sub-tab within the Queue tab. */
  protected activeQueueTab: 'functional' | 'technical' = 'functional';

  onTabChange(tab: typeof this.activeTab): void {
    this.activeTab = tab;
  }

  onQueueTabChange(tab: typeof this.activeQueueTab): void {
    this.activeQueueTab = tab;
  }

  protected get activeQueueCategory(): 'FUNCTIONAL' | 'TECHNICAL' {
    return this.activeQueueTab === 'technical' ? 'TECHNICAL' : 'FUNCTIONAL';
  }
}
