import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityLogEntry, ActivityAction, ActivityEntityType } from '@sebsa-pm-tool/shared-models';
import { ActivityLogsService } from '../../services/activity-logs.service';
import { ChangeListComponent } from '../change-list/change-list.component';

/** Material Symbols glyph per action, so a feed is scannable without reading. */
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

/** Maps an action onto the shared status palette. */
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

/**
 * Reusable activity trail for a project, case, task or subtask. Entries load
 * newest-first and page in on demand rather than all at once, since a long-lived
 * project accumulates thousands.
 */
@Component({
  standalone: true,
  selector: 'app-activity-feed',
  imports: [CommonModule, ChangeListComponent],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityFeedComponent implements OnChanges {
  @Input({ required: true }) entityType!: ActivityEntityType;
  @Input({ required: true }) entityId!: string;
  /** Entries shown before the first "Show more" click, and added by each one. */
  @Input() pageSize = 5;

  private readonly activityLogs = inject(ActivityLogsService);

  protected readonly entries = signal<ActivityLogEntry[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly total = signal(0);

  private nextPage = 1;

  ngOnChanges(): void {
    this.reset();
    this.loadNextPage();
  }

  protected get hasMore(): boolean {
    return this.entries().length < this.total();
  }

  protected loadNextPage(): void {
    if (!this.entityId || this.isLoading()) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.activityLogs
      .getFeed(this.entityType, this.entityId, { page: this.nextPage, limit: this.pageSize })
      .subscribe({
        next: (page) => {
          this.entries.update((current) => [...current, ...page.entries]);
          this.total.set(page.total);
          this.nextPage += 1;
          this.isLoading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load activity. Please try again.');
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

  /** Coarse relative time — the exact timestamp lives in the title attribute. */
  protected relativeTime(isoDate: string): string {
    const elapsedMs = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(elapsedMs / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return new Date(isoDate).toLocaleDateString();
  }

  protected absoluteTime(isoDate: string): string {
    return new Date(isoDate).toLocaleString();
  }

  protected trackById(_index: number, entry: ActivityLogEntry): string {
    return entry.id;
  }

  private reset(): void {
    this.entries.set([]);
    this.total.set(0);
    this.nextPage = 1;
  }
}
