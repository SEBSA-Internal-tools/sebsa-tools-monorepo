import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  NotificationCountsDto,
  NotificationDto,
  NotificationFilterParams,
  NotificationListResponse,
  NotificationType,
  UnreadCountResponse,
} from '@sebsa-pm-tool/shared-models';
import { catchError, finalize, Observable, of, shareReplay, tap } from 'rxjs';
import { AuthService, AUTH_TOKEN_STORAGE_KEY } from './auth.service';
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
  readonly counts = signal<NotificationCountsDto>({
    all: 0,
    unread: 0,
    assignments: 0,
    statusUpdates: 0,
    deadlines: 0,
  });
  readonly isLoading = signal<boolean>(false);

  private eventSource: EventSource | null = null;
  private readonly knownNotificationIds = new Set<string>();
  private inFlightRecent$: Observable<NotificationListResponse> | null = null;

  constructor() {
    // Reactively connect/disconnect SSE stream when user logs in or out
    toObservable(this.authService.currentUser)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user) {
          this.fetchCounts().subscribe();
          this.refreshRecent();
          this.connectEventStream();
        } else {
          this.disconnectEventStream();
          this.knownNotificationIds.clear();
          this.notifications.set([]);
          this.unreadCount.set(0);
          this.totalCount.set(0);
          this.counts.set({
            all: 0,
            unread: 0,
            assignments: 0,
            statusUpdates: 0,
            deadlines: 0,
          });
        }
      });

    this.destroyRef.onDestroy(() => {
      this.disconnectEventStream();
    });

    this.initVisibilityListener();
  }

  /**
   * Opens a persistent Server-Sent Events (SSE) connection to receive real-time notifications
   * without continuous background HTTP polling.
   */
  connectEventStream(): void {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return;

    const token =
      window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ||
      (this.authService as unknown as { getToken?: () => string | null }).getToken?.();

    if (!token || !this.authService.currentUser()) {
      this.disconnectEventStream();
      return;
    }

    // Avoid duplicate connections if already open/connecting
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return;
    }

    if (this.eventSource) {
      this.disconnectEventStream();
    }

    const streamUrl = `${this.apiUrl}/stream?token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(streamUrl);

    // Live notification pushed instantly from backend
    this.eventSource.addEventListener('notification', (event: MessageEvent) => {
      try {
        const item: NotificationDto = JSON.parse(event.data);
        if (!item || !item.id) return;
        if (this.knownNotificationIds.has(item.id)) return;

        this.knownNotificationIds.add(item.id);
        this.notifications.update((list) => [item, ...list]);
        this.unreadCount.update((c) => c + 1);
        this.totalCount.update((t) => t + 1);

        this.triggerLiveToast(item);
      } catch (err) {
        console.error('Failed to parse incoming notification stream event:', err);
      }
    });

    // Real-time unread count synchronization (e.g., when read in another tab)
    this.eventSource.addEventListener('unread_count', (event: MessageEvent) => {
      try {
        const payload: { count: number } = JSON.parse(event.data);
        if (typeof payload.count === 'number') {
          this.unreadCount.set(payload.count);
          this.counts.update((c) => ({ ...c, unread: payload.count }));
        }
      } catch (err) {
        console.error('Failed to parse unread_count stream event:', err);
      }
    });

    // Keepalive ping from server
    this.eventSource.addEventListener('ping', () => {
      // Connection active
    });

    this.eventSource.onerror = () => {
      // Browser automatically retries with backoff.
      // If user logged out, close stream completely.
      if (!this.authService.currentUser()) {
        this.disconnectEventStream();
      }
    };
  }

  /**
   * Closes the SSE connection cleanly.
   */
  disconnectEventStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Checks connection health when browser tab returns to focus.
   */
  private initVisibilityListener(): void {
    if (typeof window === 'undefined') return;

    const onFocusOrVisible = () => {
      if (!document.hidden && this.authService.currentUser()) {
        if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
          this.connectEventStream();
          this.fetchUnreadCount().subscribe();
        }
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    });
  }

  /**
   * Fetches the complete aggregated notification counts for all tabs.
   */
  fetchCounts(): Observable<NotificationCountsDto> {
    return this.http.get<NotificationCountsDto>(`${this.apiUrl}/counts`).pipe(
      tap((counts) => {
        this.counts.set(counts);
        this.totalCount.set(counts.all);
        this.unreadCount.set(counts.unread);
      }),
      catchError(() =>
        of({
          all: 0,
          unread: 0,
          assignments: 0,
          statusUpdates: 0,
          deadlines: 0,
        }),
      ),
    );
  }

  /**
   * Refreshes recent notifications and unread badge count for the app shell dropdown.
   * Deduplicates concurrent in-flight requests to avoid redundant duplicate API calls.
   */
  refreshRecent(limit = 6): Observable<NotificationListResponse> {
    if (!this.authService.currentUser()) {
      return of({ data: [], total: 0, unreadCount: 0 });
    }

    if (this.inFlightRecent$) {
      return this.inFlightRecent$;
    }

    this.inFlightRecent$ = this.loadNotifications({ limit, offset: 0 }).pipe(
      finalize(() => {
        this.inFlightRecent$ = null;
      }),
      shareReplay(1),
    );

    this.inFlightRecent$.subscribe();
    return this.inFlightRecent$;
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
    if (filter.category) {
      params = params.set('category', filter.category);
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
        res.data.forEach((item) => this.knownNotificationIds.add(item.id));
        this.notifications.set(res.data);
        if (!filter.category || filter.category === 'ALL') {
          this.totalCount.set(res.total);
          this.counts.update((c) => ({ ...c, all: res.total }));
        }
        this.unreadCount.set(res.unreadCount);
        this.counts.update((c) => ({ ...c, unread: res.unreadCount }));
      }),
      catchError(() => of({ data: [], total: 0, unreadCount: 0 })),
      finalize(() => this.isLoading.set(false)),
    );
  }

  /**
   * Displays an interactive live toast popup with one-click navigation to the target entity.
   */
  private triggerLiveToast(item: NotificationDto): void {
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
   * Fetches unread count on demand (used for initial baseline or manual refresh).
   */
  fetchUnreadCount(): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(`${this.apiUrl}/unread-count`).pipe(
      tap((res) => {
        const prev = this.unreadCount();
        this.unreadCount.set(res.count);
        this.counts.update((c) => ({ ...c, unread: res.count }));
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
    this.counts.update((c) => ({ ...c, unread: Math.max(0, c.unread - 1) }));

    return this.http.patch<NotificationDto>(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() => this.fetchCounts().subscribe()),
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
    this.counts.update((c) => ({ ...c, unread: 0 }));

    return this.http.patch<{ count: number }>(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => this.fetchCounts().subscribe()),
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
    const target = this.notifications().find((n) => n.id === id);
    const wasUnread = target?.isRead === false;

    this.notifications.update((list) => list.filter((item) => item.id !== id));
    this.totalCount.update((t) => Math.max(0, t - 1));
    if (wasUnread) {
      this.unreadCount.update((c) => Math.max(0, c - 1));
    }

    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.fetchCounts().subscribe()),
      catchError(() => {
        this.refreshRecent();
        return of({ success: false });
      }),
    );
  }
}

// Backward-compatibility alias
export { NotificationService as InAppNotificationService };
