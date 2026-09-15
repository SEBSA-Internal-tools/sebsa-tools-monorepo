import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttachmentsService } from '../../services/attachments.service';
import { ToastService } from '../../services/toast.service';
import type { CommentTargetType, UploadAttachmentResponse } from '@sebsa-pm-tool/shared-models';

@Component({
  selector: 'app-task-attachments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-attachments.component.html',
  styleUrl: './task-attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAttachmentsComponent implements OnChanges {
  /** Which entity owns the attachments shown here. Defaults to TASK so
   *  existing [taskId]-only usages keep working unchanged. */
  @Input() targetType: CommentTargetType = 'TASK';
  @Input({ required: true }) targetId!: string;

  private readonly attachmentsService = inject(AttachmentsService);
  private readonly toast = inject(ToastService);

  attachments = signal<UploadAttachmentResponse[]>([]);
  isLoading = signal(false);

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
    // Create a download link
    const link = document.createElement('a');
    link.href = `/api/attachments/download/${encodeURIComponent(attachment.filePath)}`;
    link.download = attachment.fileName;
    link.click();
  }

  deleteAttachment(attachmentId: string, fileName: string): void {
    if (!confirm(`Delete "${fileName}"?`)) return;

    this.attachmentsService.deleteAttachment(attachmentId).subscribe({
      next: () => {
        this.toast.success('Attachment deleted');
        this.loadAttachments();
      },
      error: () => {
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
