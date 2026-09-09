import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ActivityAction, ActivityEntityType, ActivityLogEntry } from '@sebsa-pm-tool/shared-models';
import { ActivityLogsService } from '../../core/services/activity-logs.service';
import { ChangeListComponent } from '../../core/components/change-list/change-list.component';

/** Route segment -> entity type. Anything else is rejected rather than guessed. */
const ROUTE_ENTITY_TYPES: Record<string, ActivityEntityType> = {
  projects: 'PROJECT',
  cases: 'CASE',
  tasks: 'TASK',
  subtasks: 'SUBTASK',
};

const ENTITY_LABELS: Record<string, string> = {
  PROJECT: 'Project',
  CASE: 'Case',
  TASK: 'Task',
  SUBTASK: 'Subtask',
};

interface FilterTab {
  id: string;
  label: string;
  action: ActivityAction | null;
}

const FILTER_TABS: FilterTab[] = [
  { id: 'ALL', label: 'All', action: null },
  { id: 'CREATED', label: 'Created', action: 'CREATED' },
  { id: 'UPDATED', label: 'Updated', action: 'UPDATED' },
  { id: 'STATUS_CHANGED', label: 'Status', action: 'STATUS_CHANGED' },
  { id: 'ASSIGNED', label: 'Assigned', action: 'ASSIGNED' },
  { id: 'DELETED', label: 'Deleted', action: 'DELETED' },
];

const PAGE_SIZE = 50;

/**
 * Full activity history for one entity, reached from the "View all" link on the
 * sidebar preview. Filters by action the way the notifications page filters by
 * type.
 */
@Component({
  standalone: true,
  selector: 'app-activity-log-page',
  imports: [CommonModule, ChangeListComponent],
  templateUrl: './activity-log.page.html',
  styleUrl: './activity-log.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityLogPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly activityLogs = inject(ActivityLogsService);

  protected readonly tabs = FILTER_TABS;
  protected readonly activeTab = signal<string>('ALL');

  protected readonly entries = signal<ActivityLogEntry[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly total = signal(0);

  protected entityType: ActivityEntityType | null = null;
  protected entityId = '';

  private nextPage = 1;

  ngOnInit(): void {
    const segment = this.route.snapshot.paramMap.get('entityType') ?? '';
    const id = this.route.snapshot.paramMap.get('entityId') ?? '';
    const resolved = ROUTE_ENTITY_TYPES[segment];

    if (!resolved || !id) {
      this.errorMessage.set('That activity log could not be found.');
      return;
    }

    this.entityType = resolved;
    this.entityId = id;
    this.load();
  }

  protected get entityLabel(): string {
    return this.entityType ? ENTITY_LABELS[this.entityType] ?? 'Item' : 'Item';
  }

  protected get hasMore(): boolean {
    return this.entries().length < this.total();
  }

  protected setTab(tabId: string): void {
    if (tabId === this.activeTab()) return;
    this.activeTab.set(tabId);
    this.entries.set([]);
    this.total.set(0);
    this.nextPage = 1;
    this.load();
  }

  protected loadMore(): void {
    this.load();
  }

  protected goBack(): void {
    this.location.back();
  }

  private load(): void {
    if (!this.entityType || !this.entityId || this.isLoading()) return;

    const action = this.tabs.find((tab) => tab.id === this.activeTab())?.action ?? undefined;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.activityLogs
      .getFeed(this.entityType, this.entityId, {
        ...(action && { action }),
        page: this.nextPage,
        limit: PAGE_SIZE,
      })
      .subscribe({
        next: (page) => {
          this.entries.update((current) => [...current, ...page.entries]);
          this.total.set(page.total);
          this.nextPage += 1;
          this.isLoading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load the activity log. Please try again.');
          this.isLoading.set(false);
        },
      });
  }

  protected iconFor(action: ActivityAction): string {
    return ACTION_ICONS[action] ?? 'bolt';
  }

  protected toneFor(action: ActivityAction): string {
    return ACTION_TONES[action] ?? 'neutral';
  }

  protected formatTimestamp(isoDate: string): string {
    return new Date(isoDate).toLocaleString();
  }

  protected relativeTime(isoDate: string): string {
    const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return new Date(isoDate).toLocaleDateString();
  }

  protected trackById(_index: number, entry: ActivityLogEntry): string {
    return entry.id;
  }
}

/** Kept in step with the same maps in ActivityFeedComponent. */
const ACTION_ICONS: Record<ActivityAction, string> = {
  CREATED: 'add_circle',
  UPDATED: 'edit',
  STATUS_CHANGED: 'swap_horiz',
  DELETED: 'delete',
  RESTORED: 'restore_from_trash',
  ASSIGNED: 'person_add',
  UNASSIGNED: 'person_remove',
  COMMENTED: 'chat_bubble',
  ATTACHMENT_ADDED: 'attach_file',
  MEMBER_ADDED: 'group_add',
  MEMBER_REMOVED: 'group_remove',
  ROLE_CHANGED: 'admin_panel_settings',
  SPRINT_STARTED: 'play_circle',
  SPRINT_COMPLETED: 'check_circle',
  MILESTONE_REACHED: 'flag',
};

const ACTION_TONES: Record<ActivityAction, string> = {
  CREATED: 'success',
  UPDATED: 'info',
  STATUS_CHANGED: 'purple',
  DELETED: 'error',
  RESTORED: 'success',
  ASSIGNED: 'info',
  UNASSIGNED: 'neutral',
  COMMENTED: 'neutral',
  ATTACHMENT_ADDED: 'neutral',
  MEMBER_ADDED: 'success',
  MEMBER_REMOVED: 'warning',
  ROLE_CHANGED: 'warning',
  SPRINT_STARTED: 'info',
  SPRINT_COMPLETED: 'success',
  MILESTONE_REACHED: 'purple',
};
