import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

type TabType = 'dashboard' | 'overview';

interface Tab {
  id: TabType;
  label: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'cso-nav-tabs',
  imports: [CommonModule],
  template: `
    <nav class="nav-tabs">
      <div class="tabs-list">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            class="nav-tab"
            [class.active]="activeTab === tab.id"
            (click)="onTabClick(tab.id)"
          >
            <span class="material-symbols-outlined tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        }
      </div>
    </nav>
  `,
  styles: [`
    .nav-tabs {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0;
      background: var(--app-surface);
      border-bottom: 1px solid var(--app-border);

      @media (max-width: 768px) {
        gap: 8px;
      }
    }

    .tabs-list {
      display: flex;
      gap: 0;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      flex: 1;
      min-width: 0;

      &::-webkit-scrollbar {
        height: 4px;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--app-border);
        border-radius: 2px;
      }
    }

    .nav-tab {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      background: transparent;
      border: none;
      border-bottom: 3px solid transparent;
      color: var(--app-text-muted);
      font-weight: 500;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      flex-shrink: 0;

      .tab-icon {
        font-size: 18px;
      }

      &:hover {
        color: var(--app-text);
        background: rgba(59, 130, 246, 0.08);
      }

      &.active {
        color: #1d4ed8;
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.24);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoNavTabsComponent {
  @Input() activeTab: TabType = 'dashboard';
  @Output() tabChange = new EventEmitter<TabType>();

  tabs: Tab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'overview', label: 'Overview', icon: 'view_list' },
  ];

  onTabClick(tab: TabType): void {
    this.tabChange.emit(tab);
  }
}
