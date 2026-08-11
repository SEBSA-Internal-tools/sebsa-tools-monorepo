import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  readonly notifications = signal<Notification[]>([]);

  show(message: string, type: NotificationType = 'info', duration: number = 3000): void {
    const id = Date.now().toString();
    const notification: Notification = { id, message, type, duration };

    this.notifications.update((current) => [...current, notification]);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(message: string, duration?: number): void {
    this.show(message, 'success', duration);
  }

  error(message: string, duration?: number): void {
    this.show(message, 'error', duration);
  }

  info(message: string, duration?: number): void {
    this.show(message, 'info', duration);
  }

  warning(message: string, duration?: number): void {
    this.show(message, 'warning', duration);
  }

  dismiss(id: string): void {
    this.notifications.update((current) => current.filter((n) => n.id !== id));
  }

  dismissAll(): void {
    this.notifications.set([]);
  }
}
