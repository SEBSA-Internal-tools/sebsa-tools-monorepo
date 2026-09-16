import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommentSummary, CommentTargetType } from '@sebsa-pm-tool/shared-models';
import { CommentsService } from '../../services/comments.service';
import { AttachmentsService } from '../../services/attachments.service';
import { ToastService } from '../../services/toast.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/** Matches the server-side cap in CreateCommentDto. */
const BODY_MAX_LENGTH = 5000;

/** Keeps the autocomplete list short enough to scan without scrolling. */
const MENTION_RESULT_LIMIT = 6;

/** Minimal shape needed to offer someone as a mention. */
export interface MentionableUser {
  id: string;
  name: string;
}

/**
 * Comment thread for a case or task: post, reply one level deep, edit and
 * delete your own. Bodies are rendered through interpolation only — never
 * innerHTML — so user text can never execute as markup.
 */
@Component({
  standalone: true,
  selector: 'app-comment-section',
  imports: [CommonModule, FormsModule, UserAvatarComponent],
  templateUrl: './comment-section.component.html',
  styleUrl: './comment-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentSectionComponent implements OnChanges {
  @Input({ required: true }) targetType!: CommentTargetType;
  @Input({ required: true }) targetId!: string;
  /** Project members available to mention. */
  @Input() mentionableUsers: MentionableUser[] = [];

  private readonly comments = inject(CommentsService);
  private readonly attachments = inject(AttachmentsService);
  private readonly toast = inject(ToastService);

  protected readonly thread = signal<CommentSummary[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly maxLength = BODY_MAX_LENGTH;

  protected newBody = '';

  /** Everyone picked from the autocomplete this session, by id. A pick only
   * counts as a mention while its "@Name" is still in the text, so deleting the
   * text removes the mention without any extra bookkeeping. */
  private readonly insertedMentions = new Map<string, string>();

  protected readonly mentionMatches = signal<MentionableUser[]>([]);
  protected readonly mentionHighlight = signal(0);
  private mentionStart = -1;
  private caretPosition = 0;

  protected readonly replyingTo = signal<string | null>(null);
  protected replyBody = '';

  protected readonly editingId = signal<string | null>(null);
  protected editBody = '';

  // File attachment state
  protected selectedFiles = signal<File[]>([]);
  protected isUploadingFiles = signal(false);

  ngOnChanges(): void {
    this.resetComposers();
    this.load();
  }

  protected get commentCount(): number {
    return this.thread().reduce((total, comment) => total + 1 + comment.replies.length, 0);
  }

  protected load(): void {
    if (!this.targetId) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.comments.getThread(this.targetType, this.targetId).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load comments. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  protected post(): void {
    const body = this.newBody.trim();
    if (!body || this.isSaving()) return;

    this.isSaving.set(true);
    this.comments
      .create({
        ...(this.targetType === 'CASE' ? { caseId: this.targetId } : { taskId: this.targetId }),
        body,
        ...(this.activeMentionIds().length > 0 && { mentionedUserIds: this.activeMentionIds() }),
      })
      .subscribe({
        next: (comment) => {
          this.newBody = '';
          this.insertedMentions.clear();
          this.closeMentions();
          this.uploadAttachmentsForComment(comment.id);
        },
        error: () => {
          this.toast.error('Could not post the comment.');
          this.isSaving.set(false);
        },
      });
  }

  private uploadAttachmentsForComment(commentId: string): void {
    const files = this.selectedFiles();
    if (files.length === 0) {
      this.selectedFiles.set([]);
      this.isSaving.set(false);
      this.load();
      return;
    }

    this.isUploadingFiles.set(true);
    let uploadedCount = 0;

    files.forEach((file) => {
      this.attachments.uploadAttachment(file, this.targetType, this.targetId, commentId).subscribe({
        next: () => {
          uploadedCount++;
          if (uploadedCount === files.length) {
            this.selectedFiles.set([]);
            this.isUploadingFiles.set(false);
            this.isSaving.set(false);
            this.load();
          }
        },
        error: () => {
          this.toast.error(`Failed to upload ${file.name}`);
          uploadedCount++;
          if (uploadedCount === files.length) {
            this.selectedFiles.set([]);
            this.isUploadingFiles.set(false);
            this.isSaving.set(false);
            this.load();
          }
        },
      });
    });
  }

  protected startReply(commentId: string): void {
    this.replyingTo.set(commentId);
    this.replyBody = '';
    this.editingId.set(null);
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
    this.replyBody = '';
  }

  protected postReply(parentCommentId: string): void {
    const body = this.replyBody.trim();
    if (!body || this.isSaving()) return;

    this.isSaving.set(true);
    this.comments
      .create({
        ...(this.targetType === 'CASE' ? { caseId: this.targetId } : { taskId: this.targetId }),
        parentCommentId,
        body,
      })
      .subscribe({
        next: () => {
          this.cancelReply();
          this.isSaving.set(false);
          this.load();
        },
        error: () => {
          this.toast.error('Could not post the reply.');
          this.isSaving.set(false);
        },
      });
  }

  protected startEdit(comment: CommentSummary): void {
    this.editingId.set(comment.id);
    this.editBody = comment.body;
    this.replyingTo.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editBody = '';
  }

  protected saveEdit(commentId: string): void {
    const body = this.editBody.trim();
    if (!body || this.isSaving()) return;

    this.isSaving.set(true);
    this.comments.update(commentId, { body }).subscribe({
      next: () => {
        this.cancelEdit();
        this.isSaving.set(false);
        this.load();
      },
      error: () => {
        this.toast.error('Could not save the change.');
        this.isSaving.set(false);
      },
    });
  }

  protected remove(commentId: string): void {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;

    this.comments.delete(commentId).subscribe({
      next: () => {
        this.toast.success('Comment deleted.');
        this.load();
      },
      error: () => this.toast.error('Could not delete the comment.'),
    });
  }

  // ---------------------------------------------------------------------------
  // @-mention autocomplete
  // ---------------------------------------------------------------------------

  /** Ids whose "@Name" still appears in the draft. The server re-validates that
   * each one is a member of the project. */
  protected activeMentionIds(): string[] {
    return [...this.insertedMentions.entries()]
      .filter(([, name]) => this.newBody.includes(`@${name}`))
      .map(([id]) => id);
  }

  protected activeMentionNames(): string[] {
    return this.activeMentionIds().map((id) => this.insertedMentions.get(id) ?? '');
  }

  protected onBodyInput(textarea: HTMLTextAreaElement): void {
    this.caretPosition = textarea.selectionStart ?? this.newBody.length;
    this.refreshMentionMatches();
  }

  /** Arrow keys and Enter drive the list while it is open; otherwise the
   * textarea behaves normally. */
  protected onBodyKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (this.mentionMatches().length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.mentionHighlight.update((i) => (i + 1) % this.mentionMatches().length);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.mentionHighlight.update(
          (i) => (i - 1 + this.mentionMatches().length) % this.mentionMatches().length,
        );
        return;
      case 'Enter':
      case 'Tab': {
        const choice = this.mentionMatches()[this.mentionHighlight()];
        if (choice) {
          event.preventDefault();
          this.selectMention(choice, textarea);
        }
        return;
      }
      case 'Escape':
        event.preventDefault();
        this.closeMentions();
        return;
    }
  }

  protected selectMention(user: MentionableUser, textarea: HTMLTextAreaElement): void {
    if (this.mentionStart < 0) return;

    const before = this.newBody.slice(0, this.mentionStart);
    const after = this.newBody.slice(this.caretPosition);
    const inserted = `@${user.name} `;

    this.newBody = `${before}${inserted}${after}`;
    this.insertedMentions.set(user.id, user.name);
    this.closeMentions();

    // Put the caret straight after the inserted name so typing continues there.
    const caret = before.length + inserted.length;
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  /** An "@" starts a mention only at the beginning of the text or after
   * whitespace, so an email address never opens the list. */
  private refreshMentionMatches(): void {
    const upToCaret = this.newBody.slice(0, this.caretPosition);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(upToCaret);

    if (!match) {
      this.closeMentions();
      return;
    }

    const query = match[1].toLowerCase();
    this.mentionStart = this.caretPosition - match[1].length - 1;

    const matches = this.mentionableUsers
      .filter((user) => user.name.toLowerCase().includes(query))
      .slice(0, MENTION_RESULT_LIMIT);

    this.mentionMatches.set(matches);
    this.mentionHighlight.set(0);
  }

  protected closeMentions(): void {
    this.mentionMatches.set([]);
    this.mentionHighlight.set(0);
    this.mentionStart = -1;
  }

  protected initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected relativeTime(isoDate: string): string {
    const minutes = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return new Date(isoDate).toLocaleDateString();
  }

  protected absoluteTime(isoDate: string): string {
    return new Date(isoDate).toLocaleString();
  }

  protected trackById(_index: number, comment: CommentSummary): string {
    return comment.id;
  }

  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  protected getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'picture_as_pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'table_chart';
    return 'attach_file';
  }

  protected downloadAttachment(filePath: string, fileName: string): void {
    this.attachments.downloadFile(filePath).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Failed to download file'),
    });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    const currentFiles = this.selectedFiles();

    // Validate files
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        this.toast.error(`${file.name} exceeds 50MB limit`);
        continue;
      }
      if (!this.isAllowedFileType(file.type)) {
        this.toast.error(`${file.name} type not allowed`);
        continue;
      }

      // Add to selected files if not duplicate
      if (!currentFiles.some((f) => f.name === file.name)) {
        currentFiles.push(file);
      }
    }

    this.selectedFiles.set(currentFiles);
    input.value = '';
  }

  private isAllowedFileType(mimeType: string): boolean {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/gif',
      'text/plain',
      'text/csv',
    ];
    return allowedTypes.includes(mimeType);
  }

  protected removeFile(index: number): void {
    const files = this.selectedFiles();
    files.splice(index, 1);
    this.selectedFiles.set([...files]);
  }

  protected triggerFileInput(): void {
    const input = document.querySelector<HTMLInputElement>('#comment-file-input');
    input?.click();
  }

  private resetComposers(): void {
    this.newBody = '';
    this.insertedMentions.clear();
    this.closeMentions();
    this.replyBody = '';
    this.editBody = '';
    this.replyingTo.set(null);
    this.editingId.set(null);
    this.selectedFiles.set([]);
  }
}
