import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

type TabType = 'overview' | 'kanban' | 'tasklist' | 'calendar' | 'sprint' | 'team';

interface Tab {
  id: TabType;
  label: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'project-nav-tabs',
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

      <button
        type="button"
        class="btn-add-task"
        (click)="onAddTaskClick()"
        title="Create new task"
      >
        <span class="material-symbols-outlined">add</span>
        <span class="btn-label">New task</span>
      </button>
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
      padding-right: 16px;

      @media (max-width: 768px) {
        gap: 8px;
        padding-right: 12px;
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
        background: var(--app-hover);
      }

      &.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
      }
    }

    .btn-add-task {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);

      .material-symbols-outlined {
        font-size: 18px;
      }

      .btn-label {
        @media (max-width: 640px) {
          display: none;
        }
      }

      &:hover {
        background: #2563eb;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(0);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectNavTabsComponent {
  @Input() activeTab: TabType = 'kanban';
  @Output() tabChange = new EventEmitter<TabType>();
  @Output() addTaskClick = new EventEmitter<void>();

  tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'kanban', label: 'Kanban Board', icon: 'view_kanban' },
    { id: 'tasklist', label: 'Task List', icon: 'list_check' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
    { id: 'sprint', label: 'Sprint', icon: 'sprint' },
    { id: 'team', label: 'Team', icon: 'groups' },
  ];

  onTabClick(tab: TabType): void {
    this.tabChange.emit(tab);
  }

  onAddTaskClick(): void {
    this.addTaskClick.emit();
  }
}
