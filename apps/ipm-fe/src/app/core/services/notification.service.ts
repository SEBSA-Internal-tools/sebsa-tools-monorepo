import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  NotificationDto,
  NotificationFilterParams,
  NotificationListResponse,
  NotificationType,
  UnreadCountResponse,
} from '@sebsa-pm-tool/shared-models';
import { catchError, finalize, interval, Observable, of, Subscription, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiUrl = '/api/notifications';

  readonly notifications = signal<NotificationDto[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly totalCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);

  private pollSubscription?: Subscription;
  private readonly knownNotificationIds = new Set<string>();
  private isFirstLoad = true;

  constructor() {
    this.initAutoPolling();

    this.destroyRef.onDestroy(() => {
      this.stopPolling();
    });
  }

  /**
   * Initializes polling and reactive updates when the user is logged in.
   */
  private initAutoPolling(): void {
    // Initial fetch if already logged in
    if (this.authService.currentUser()) {
      this.refreshRecent();
    }

    // Fast responsive polling every 15 seconds
    this.pollSubscription = interval(15000).subscribe(() => {
      if (this.authService.currentUser()) {
        this.fetchUnreadCount().subscribe();
      }
    });

    // Instantly refresh when the user switches back to this browser tab/window
    const onFocusOrVisible = () => {
      if (!document.hidden && this.authService.currentUser()) {
        this.refreshRecent();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocusOrVisible);
      document.addEventListener('visibilitychange', onFocusOrVisible);

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('focus', onFocusOrVisible);
        document.removeEventListener('visibilitychange', onFocusOrVisible);
      });
    }
  }

  stopPolling(): void {
    this.pollSubscription?.unsubscribe();
  }

  /**
   * Refreshes the top notifications and unread badge count for the app shell bell dropdown.
   */
  refreshRecent(limit = 6): void {
    if (!this.authService.currentUser()) return;

    this.loadNotifications({ limit, offset: 0 }).subscribe();
  }

  /**
   * Fetches paginated notifications matching optional filters.
   */
  loadNotifications(filter: NotificationFilterParams = {}): Observable<NotificationListResponse> {
    this.isLoading.set(true);

    let params = new HttpParams();
    if (filter.isRead !== undefined) {
      params = params.set('isRead', filter.isRead.toString());
    }
    if (filter.type) {
      params = params.set('type', filter.type);
    }
    if (filter.limit !== undefined) {
      params = params.set('limit', filter.limit.toString());
    }
    if (filter.offset !== undefined) {
      const page = Math.floor(filter.offset / (filter.limit || 20)) + 1;
      params = params.set('page', page.toString());
    }

    return this.http.get<NotificationListResponse>(this.apiUrl, { params }).pipe(
      tap((res) => {
        this.handleIncomingNotifications(res.data);
        this.notifications.set(res.data);
        this.totalCount.set(res.total);
        this.unreadCount.set(res.unreadCount);
      }),
      catchError((err) => {
        return of({ data: [], total: 0, unreadCount: 0 });
      }),
      finalize(() => this.isLoading.set(false)),
    );
  }

  /**
   * Checks for brand-new incoming unread notifications and pops up an interactive toast.
   */
  private handleIncomingNotifications(items: NotificationDto[]): void {
    if (this.isFirstLoad) {
      items.forEach((item) => this.knownNotificationIds.add(item.id));
      this.isFirstLoad = false;
      return;
    }

    const newUnreadItems = items.filter((item) => !item.isRead && !this.knownNotificationIds.has(item.id));

    // Register all incoming IDs so we don't pop up again
    items.forEach((item) => this.knownNotificationIds.add(item.id));

    // Trigger interactive live toast for newly arrived notifications
    for (const item of newUnreadItems) {
      const actionLabel =
        item.relatedEntityType === 'TASK'
          ? 'View Task'
          : item.relatedEntityType === 'CASE'
          ? 'View Case'
          : item.relatedEntityType === 'PROJECT'
          ? 'View Project'
          : 'View';

      const onAction = () => {
        this.markAsRead(item.id).subscribe();
        if (item.relatedEntityType === 'TASK' && item.relatedEntityId) {
          this.router.navigate(['/tasks', item.relatedEntityId]);
        } else if (item.relatedEntityType === 'CASE' && item.relatedEntityId) {
          this.router.navigate(['/cases', item.relatedEntityId]);
        } else if (item.relatedEntityType === 'PROJECT' && item.relatedEntityId) {
          this.router.navigate(['/projects', item.relatedEntityId]);
        } else if (item.relatedEntityType === 'SUBTASK') {
          this.router.navigate(['/tasks']);
        } else {
          this.router.navigate(['/notifications']);
        }
      };

      this.toastService.showInApp({
        title: item.title,
        message: item.message,
        icon: this.getNotificationIcon(item.type),
        actionLabel,
        onAction,
        duration: 6500,
      });
    }
  }

  private getNotificationIcon(type: NotificationType): string {
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

  /**
   * Lightweight poll for navbar badge count. Automatically syncs notifications if count changes.
   */
  fetchUnreadCount(): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(`${this.apiUrl}/unread-count`).pipe(
      tap((res) => {
        const prev = this.unreadCount();
        this.unreadCount.set(res.count);
        if (res.count !== prev) {
          this.loadNotifications({ limit: 6, offset: 0 }).subscribe();
        }
      }),
      catchError(() => of({ count: 0 })),
    );
  }

  /**
   * Marks a single notification as read with optimistic UI update.
   */
  markAsRead(id: string): Observable<NotificationDto | null> {
    this.notifications.update((list) =>
      list.map((item) => (item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item)),
    );
    this.unreadCount.update((c) => Math.max(0, c - 1));

    return this.http.patch<NotificationDto>(`${this.apiUrl}/${id}/read`, {}).pipe(
      catchError(() => {
        this.refreshRecent();
        return of(null);
      }),
    );
  }

  /**
   * Marks all notifications as read for current user with optimistic UI update.
   */
  markAllAsRead(): Observable<{ count: number }> {
    this.notifications.update((list) =>
      list.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() })),
    );
    this.unreadCount.set(0);

    return this.http.patch<{ count: number }>(`${this.apiUrl}/read-all`, {}).pipe(
      catchError(() => {
        this.refreshRecent();
        return of({ count: 0 });
      }),
    );
  }

  /**
   * Deletes/dismisses a notification.
   */
  deleteNotification(id: string): Observable<{ success: boolean }> {
    const wasUnread = this.notifications().find((n) => n.id === id)?.isRead === false;

    this.notifications.update((list) => list.filter((item) => item.id !== id));
    this.totalCount.update((t) => Math.max(0, t - 1));
    if (wasUnread) {
      this.unreadCount.update((c) => Math.max(0, c - 1));
    }

    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).pipe(
      catchError(() => {
        this.refreshRecent();
        return of({ success: false });
      }),
    );
  }
}

// Backward-compatibility alias
export { NotificationService as InAppNotificationService };
