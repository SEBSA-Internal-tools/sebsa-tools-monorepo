import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'in-app';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 3000): void {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const toast: Toast = { id, message, type, duration };

    this.toasts.update((current) => [...current, toast]);

    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  showInApp(options: {
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: string;
    duration?: number;
  }): void {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    const toast: Toast = {
      id,
      type: 'in-app',
      title: options.title,
      message: options.message,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
      icon: options.icon || 'notifications',
      duration: options.duration ?? 6000,
    };

    this.toasts.update((current) => [...current, toast]);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => this.dismiss(id), toast.duration);
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
    this.toasts.update((current) => current.filter((n) => n.id !== id));
  }

  dismissAll(): void {
    this.toasts.set([]);
  }
}
