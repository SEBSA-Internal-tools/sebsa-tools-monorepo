import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Toast, ToastService } from '../../services/toast.service';

@Component({
  standalone: true,
  selector: 'app-toast',
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);
  readonly notifications = this.toastService.toasts;

  closeNotification(id: string): void {
    this.toastService.dismiss(id);
  }

  handleAction(toast: Toast): void {
    if (toast.onAction) {
      toast.onAction();
    }
    this.closeNotification(toast.id);
  }
}
