import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  NotificationDto,
  NotificationFilterParams,
  NotificationListResponse,
  UnreadCountResponse,
} from '@sebsa-pm-tool/shared-models';
import { catchError, finalize, interval, Observable, of, Subscription, tap } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class InAppNotificationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiUrl = '/api/notifications';

  readonly notifications = signal<NotificationDto[]>([]);
  readonly unreadCount = signal<number>(0);
  readonly totalCount = signal<number>(0);
  readonly isLoading = signal<boolean>(false);

  private pollSubscription?: Subscription;

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

    // Start background light polling every 60 seconds
    this.pollSubscription = interval(60000).subscribe(() => {
      if (this.authService.currentUser()) {
        this.fetchUnreadCount().subscribe();
      }
    });
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
   * Lightweight poll for navbar badge count.
   */
  fetchUnreadCount(): Observable<UnreadCountResponse> {
    return this.http.get<UnreadCountResponse>(`${this.apiUrl}/unread-count`).pipe(
      tap((res) => {
        this.unreadCount.set(res.count);
      }),
      catchError(() => of({ count: 0 })),
    );
  }

  /**
   * Marks a single notification as read with optimistic UI update.
   */
  markAsRead(id: string): Observable<NotificationDto | null> {
    // Optimistic update
    this.notifications.update((list) =>
      list.map((item) => (item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item)),
    );
    this.unreadCount.update((c) => Math.max(0, c - 1));

    return this.http.patch<NotificationDto>(`${this.apiUrl}/${id}/read`, {}).pipe(
      catchError((err) => {
        // Refresh on failure
        this.refreshRecent();
        return of(null);
      }),
    );
  }

  /**
   * Marks all notifications as read for current user with optimistic UI update.
   */
  markAllAsRead(): Observable<{ count: number }> {
    // Optimistic update
    this.notifications.update((list) =>
      list.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() })),
    );
    this.unreadCount.set(0);

    return this.http.patch<{ count: number }>(`${this.apiUrl}/read-all`, {}).pipe(
      catchError((err) => {
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

    // Optimistic update
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
