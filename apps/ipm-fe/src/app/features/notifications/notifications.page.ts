import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InAppNotificationService } from '../../core/services/in-app-notification.service';
import type { NotificationDto, NotificationType } from '@sebsa-pm-tool/shared-models';

type FilterTab = 'ALL' | 'UNREAD' | 'ASSIGNMENTS' | 'STATUS_CHANGE';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-notifications-page',
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPageComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly inAppNotificationService = inject(InAppNotificationService);

  readonly activeTab = signal<FilterTab>('ALL');

  ngOnInit(): void {
    this.loadData();
  }

  setTab(tab: FilterTab): void {
    this.activeTab.set(tab);
    this.loadData();
  }

  loadData(): void {
    const tab = this.activeTab();
    if (tab === 'UNREAD') {
      this.inAppNotificationService.loadNotifications({ isRead: false, limit: 50 }).subscribe();
    } else if (tab === 'ASSIGNMENTS') {
      this.inAppNotificationService.loadNotifications({ type: 'TASK_ASSIGNED', limit: 50 }).subscribe();
    } else if (tab === 'STATUS_CHANGE') {
      this.inAppNotificationService.loadNotifications({ type: 'STATUS_CHANGE', limit: 50 }).subscribe();
    } else {
      this.inAppNotificationService.loadNotifications({ limit: 50 }).subscribe();
    }
  }

  filteredNotifications(): NotificationDto[] {
    return this.inAppNotificationService.notifications();
  }

  markAsRead(id: string): void {
    this.inAppNotificationService.markAsRead(id).subscribe();
  }

  markAllAsRead(): void {
    this.inAppNotificationService.markAllAsRead().subscribe();
  }

  deleteNotification(id: string): void {
    this.inAppNotificationService.deleteNotification(id).subscribe();
  }

  navigateToEntity(item: NotificationDto): void {
    if (!item.isRead) {
      this.inAppNotificationService.markAsRead(item.id).subscribe();
    }

    if (item.relatedEntityType === 'TASK' || item.relatedEntityType === 'CASE' || item.relatedEntityType === 'SUBTASK') {
      this.router.navigate(['/tasks']);
    } else if (item.relatedEntityType === 'PROJECT') {
      if (item.relatedEntityId) {
        this.router.navigate(['/projects', item.relatedEntityId]);
      } else {
        this.router.navigate(['/projects']);
      }
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