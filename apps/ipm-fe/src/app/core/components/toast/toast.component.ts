import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  standalone: true,
  selector: 'app-toast',
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  private readonly notificationService = inject(NotificationService);
  readonly notifications = this.notificationService.notifications;

  closeNotification(id: string): void {
    this.notificationService.dismiss(id);
  }
}
