import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

type TabType =
  | 'overview'
  | 'kanban'
  | 'tasklist'
  | 'calendar'
  | 'sprint'
  | 'team'
  | 'activity'
  | 'integrations';

interface Tab {
  id: TabType;
  label: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'project-nav-tabs',
  imports: [CommonModule],
  templateUrl: './project-nav-tabs.component.html', 
  styleUrl: './project-nav-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectNavTabsComponent {
  @Input() activeTab: TabType = 'kanban';
  @Output() tabChange = new EventEmitter<TabType>();
  @Output() addTaskClick = new EventEmitter<void>();

  tabs: Tab[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'kanban', label: 'Case Board', icon: 'view_kanban' },
    { id: 'tasklist', label: 'Case List', icon: 'task' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
    { id: 'sprint', label: 'Sprint', icon: 'sprint' },
    { id: 'team', label: 'Team', icon: 'groups' },
    { id: 'activity', label: 'Activity', icon: 'history' },
    { id: 'integrations', label: 'Integrations', icon: 'sync_alt' },
  ];

  onTabClick(tab: TabType): void {
    this.tabChange.emit(tab);
  }

  onAddTaskClick(): void {
    this.addTaskClick.emit();
  }
}
