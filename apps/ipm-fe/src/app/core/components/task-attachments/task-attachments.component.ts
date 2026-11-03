import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttachmentsService } from '../../services/attachments.service';
import { ToastService } from '../../services/toast.service';
import { ConfirmationService } from '../../services/confirmation.service';
import type { CommentTargetType, UploadAttachmentResponse } from '@sebsa-pm-tool/shared-models';

@Component({
  selector: 'app-task-attachments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-attachments.component.html',
  styleUrl: './task-attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAttachmentsComponent implements OnChanges, OnDestroy {
  private readonly confirmation = inject(ConfirmationService);
  /** Which entity owns the attachments shown here. Defaults to TASK so
   *  existing [taskId]-only usages keep working unchanged. */
  @Input() targetType: CommentTargetType = 'TASK';
  @Input({ required: true }) targetId!: string;

  private readonly attachmentsService = inject(AttachmentsService);
  private readonly toast = inject(ToastService);

  attachments = signal<UploadAttachmentResponse[]>([]);
  isLoading = signal(false);
  protected readonly pendingDelete = signal<{ id: string; fileName: string } | null>(null);
  protected readonly isDeleting = signal(false);
  private readonly changedSubscription = this.attachmentsService.changed$.subscribe(() => this.loadAttachments());

  ngOnDestroy(): void {
    this.changedSubscription.unsubscribe();
  }

  ngOnChanges(): void {
    this.loadAttachments();
  }

  private loadAttachments(): void {
    if (!this.targetId) return;

    this.isLoading.set(true);
    const request =
      this.targetType === 'CASE'
        ? this.attachmentsService.getCaseAttachments(this.targetId)
        : this.attachmentsService.getTaskAttachments(this.targetId);

    request.subscribe({
      next: (attachments) => {
        this.attachments.set(attachments);
        this.isLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load attachments');
        this.isLoading.set(false);
      },
    });
  }

  downloadFile(attachment: UploadAttachmentResponse): void {
    this.attachmentsService.downloadFile(attachment.filePath).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download file'),
    });
  }

  deleteAttachment(attachmentId: string, fileName: string): void {
    if (this.isDeleting()) return;
    this.pendingDelete.set({ id: attachmentId, fileName });
  }

  cancelDelete(): void {
    if (!this.isDeleting()) this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const attachment = this.pendingDelete();
    if (!attachment || this.isDeleting()) return;

    this.isDeleting.set(true);
    this.attachmentsService.deleteAttachment(attachment.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.pendingDelete.set(null);
        this.toast.success('Attachment deleted');
        this.attachmentsService.notifyChanged();
        this.loadAttachments();
      },
      error: () => {
        this.isDeleting.set(false);
        this.toast.error('Failed to delete attachment');
      },
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString();
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'picture_as_pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'table_chart';
    return 'attach_file';
  }
}
