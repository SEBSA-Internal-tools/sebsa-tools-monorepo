import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CsoDashboardTabComponent } from './tabs/dashboard/cso-dashboard-tab.component';
import { CsoOverviewTabComponent } from './tabs/overview/cso-overview-tab.component';
import { CsoNavTabsComponent } from './components/nav-tabs/cso-nav-tabs.component';

@Component({
  standalone: true,
  selector: 'app-cso-page',
  imports: [CommonModule, CsoNavTabsComponent, CsoDashboardTabComponent, CsoOverviewTabComponent],
  templateUrl: './cso.page.html',
  styleUrl: './cso.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoPageComponent {
  protected activeTab: 'dashboard' | 'overview' = 'dashboard';

  onTabChange(tab: typeof this.activeTab): void {
    this.activeTab = tab;
  }
}
