/**
 * Re-export NotificationService for backward compatibility.
 * Database/inbox notifications are managed by NotificationService.
 * Flash/popup messages are managed by ToastService.
 */
export * from './notification.service';
