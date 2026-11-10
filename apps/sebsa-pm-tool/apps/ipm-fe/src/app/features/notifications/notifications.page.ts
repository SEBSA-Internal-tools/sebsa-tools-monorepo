import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmationService } from '../../core/services/confirmation.service';
import type { NotificationDto, NotificationType } from '@sebsa-pm-tool/shared-models';

type FilterTab = 'ALL' | 'UNREAD' | 'ASSIGNMENTS' | 'STATUS_CHANGE' | 'DEADLINES';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-notifications-page',
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);
  protected readonly notificationService = inject(NotificationService);

  readonly activeTab = signal<FilterTab>('ALL');

  ngOnInit(): void {
    this.notificationService.fetchCounts().subscribe();
    this.loadData();
  }

  setTab(tab: FilterTab): void {
    this.activeTab.set(tab);
    this.loadData();
  }

  loadData(): void {
    const tab = this.activeTab();
    this.notificationService.loadNotifications({ category: tab, limit: 50 }).subscribe();
  }

  filteredNotifications(): NotificationDto[] {
    const list = this.notificationService.notifications();
    if (this.activeTab() === 'UNREAD') {
      return list.filter((item) => !item.isRead);
    }
    return list;
  }

  markAsRead(id: string): void {
    this.notificationService.markAsRead(id).subscribe();
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe();
  }

  async deleteNotification(id: string): Promise<void> {
    if (!(await this.confirmation.confirm({ title: 'Dismiss notification', message: 'Dismiss this notification?', consequence: 'It will be removed from your notification list. The related work will remain.', confirmLabel: 'Dismiss notification' }))) return;
    this.notificationService.deleteNotification(id).subscribe();
  }

  navigateToEntity(item: NotificationDto): void {
    if (!item.isRead) {
      this.notificationService.markAsRead(item.id).subscribe();
    }

    if (item.relatedEntityType === 'TASK' && item.relatedEntityId) {
      this.router.navigate(['/tasks', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'CASE' && item.relatedEntityId) {
      this.router.navigate(['/cases', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'PROJECT' && item.relatedEntityId) {
      this.router.navigate(['/projects', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'SUBTASK') {
      this.router.navigate(['/tasks']);
    }
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'TASK_ASSIGNED':
        return 'assignment_ind';
      case 'STATUS_CHANGE':
        return 'swap_horiz';
      case 'MENTION':
        return 'alternate_email';
      case 'DUE_DATE_REMINDER':
        return 'schedule';
      case 'OVERDUE_ALERT':
        return 'warning';
      case 'SPRINT_EVENT':
        return 'flag';
      default:
        return 'notifications';
    }
  }

  getIconClass(type: NotificationType): string {
    switch (type) {
      case 'TASK_ASSIGNED':
        return 'assignment';
      case 'STATUS_CHANGE':
        return 'status';
      case 'OVERDUE_ALERT':
        return 'warning';
      default:
        return '';
    }
  }

  formatTime(dateString?: string | null): string {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
