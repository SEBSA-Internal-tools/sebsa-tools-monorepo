import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommentSummary, CommentTargetType } from '@sebsa-pm-tool/shared-models';
import { CommentsService } from '../../services/comments.service';
import { AttachmentsService } from '../../services/attachments.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { forkJoin, Subscription } from 'rxjs';
import type { UploadAttachmentResponse } from '@sebsa-pm-tool/shared-models';

/** Matches the server-side cap in CreateCommentDto. */
const BODY_MAX_LENGTH = 5000;

/** Keeps the autocomplete list short enough to scan without scrolling. */
const MENTION_RESULT_LIMIT = 6;
const MENTION_ALL_ID = '__all__';

type MentionContext = 'new' | 'reply' | 'edit';

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
export class CommentSectionComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) targetType!: CommentTargetType;
  @Input({ required: true }) targetId!: string;
  /** Project members available to mention. */
  @Input() mentionableUsers: MentionableUser[] = [];

  private readonly comments = inject(CommentsService);
  private readonly attachments = inject(AttachmentsService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly thread = signal<CommentSummary[]>([]);
  protected readonly standaloneAttachments = signal<UploadAttachmentResponse[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly maxLength = BODY_MAX_LENGTH;

  protected newBody = '';

  /** Everyone picked from the autocomplete this session, by id. A pick only
   * counts as a mention while its "@Name" is still in the text, so deleting the
   * text removes the mention without any extra bookkeeping. */
  private readonly insertedMentions = new Map<string, string>();
  private readonly replyInsertedMentions = new Map<string, string>();
  private readonly editInsertedMentions = new Map<string, string>();
  private readonly editAllMentionIds = new Set<string>();

  protected readonly mentionMatches = signal<MentionableUser[]>([]);
  protected readonly mentionHighlight = signal(0);
  protected readonly mentionContext = signal<MentionContext | null>(null);
  private mentionStart = -1;
  private caretPosition = 0;

  protected readonly replyingTo = signal<string | null>(null);
  protected replyBody = '';

  protected readonly editingId = signal<string | null>(null);
  protected editBody = '';

  // File attachment state
  protected selectedFiles = signal<File[]>([]);
  protected replyFiles = signal<File[]>([]);
  protected editFiles = signal<File[]>([]);
  protected isUploadingFiles = signal(false);
  private readonly attachmentChanges = this.attachments.changed$.subscribe(() => this.load());

  ngOnDestroy(): void {
    this.attachmentChanges.unsubscribe();
  }

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
        const linkedIds = new Set(thread.flatMap((comment) => [
          ...(comment.attachments ?? []).map((attachment) => attachment.id),
          ...comment.replies.flatMap((reply) => (reply.attachments ?? []).map((attachment) => attachment.id)),
        ]));
        const request = this.targetType === 'CASE'
          ? this.attachments.getCaseAttachments(this.targetId)
          : this.attachments.getTaskAttachments(this.targetId);
        request.subscribe({
          next: (allAttachments) => this.standaloneAttachments.set(allAttachments.filter((a) => !linkedIds.has(a.id))),
        });
      },
      error: () => {
        this.errorMessage.set('Could not load comments. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  protected post(): void {
    const body = this.newBody.trim();
    const files = this.selectedFiles();
    if ((!body && files.length === 0) || this.isSaving()) return;
    // A single space supports file-only comments while remaining compatible
    // with API instances that still require a non-empty comment body.
    const bodyToPersist = body || ' ';
    const mentionedUserIds = this.activeMentionIds();

    this.isSaving.set(true);
    this.comments
      .create({
        ...(this.targetType === 'CASE' ? { caseId: this.targetId } : { taskId: this.targetId }),
        body: bodyToPersist,
        ...(mentionedUserIds.length > 0 && { mentionedUserIds }),
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

  private uploadAttachmentsForComment(commentId?: string, files = this.selectedFiles(), clearDraft = true): void {
    if (files.length === 0) {
      if (clearDraft) this.selectedFiles.set([]);
      this.isSaving.set(false);
      if (commentId) this.load();
      return;
    }

    this.isUploadingFiles.set(true);
    let uploadedCount = 0;

    files.forEach((file) => {
      this.attachments.uploadAttachment(file, this.targetType, this.targetId, commentId).subscribe({
        next: () => {
          uploadedCount++;
          if (uploadedCount === files.length) {
            if (clearDraft) this.selectedFiles.set([]);
            this.isUploadingFiles.set(false);
            this.isSaving.set(false);
            this.attachments.notifyChanged();
            this.load();
          }
        },
        error: () => {
          this.toast.error(`Failed to upload ${file.name}`);
          uploadedCount++;
          if (uploadedCount === files.length) {
            if (clearDraft) this.selectedFiles.set([]);
            this.isUploadingFiles.set(false);
            this.isSaving.set(false);
            this.attachments.notifyChanged();
            this.load();
          }
        },
      });
    });
  }

  protected startReply(commentId: string): void {
    this.replyingTo.set(commentId);
    this.replyBody = '';
    this.replyFiles.set([]);
    this.replyInsertedMentions.clear();
    this.closeMentions();
    this.editingId.set(null);
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
    this.replyBody = '';
    this.replyFiles.set([]);
    this.replyInsertedMentions.clear();
    this.closeMentions();
  }

  protected postReply(parentCommentId: string): void {
    const body = this.replyBody.trim();
    const files = this.replyFiles();
    if ((!body && files.length === 0) || this.isSaving()) return;
    const bodyToPersist = body || ' ';
    const mentionedUserIds = this.activeMentionIds('reply');

    this.isSaving.set(true);
    this.comments
      .create({
        ...(this.targetType === 'CASE' ? { caseId: this.targetId } : { taskId: this.targetId }),
        parentCommentId,
        body: bodyToPersist,
        ...(mentionedUserIds.length > 0 && { mentionedUserIds }),
      })
      .subscribe({
        next: (reply) => {
          this.cancelReply();
          this.uploadAttachmentsForComment(reply.id, files, false);
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
    this.editFiles.set([]);
    this.editInsertedMentions.clear();
    this.editAllMentionIds.clear();
    if (comment.mentions.length > 0 && this.hasMention(comment.body, 'All')) {
      this.editInsertedMentions.set(MENTION_ALL_ID, 'All');
      comment.mentions.forEach((mention) => this.editAllMentionIds.add(mention.id));
    } else {
      comment.mentions.forEach((mention) =>
        this.editInsertedMentions.set(mention.id, mention.name),
      );
    }
    this.closeMentions();
    this.replyingTo.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editBody = '';
    this.editFiles.set([]);
    this.editInsertedMentions.clear();
    this.editAllMentionIds.clear();
    this.closeMentions();
  }

  protected saveEdit(commentId: string): void {
    const body = this.editBody.trim();
    const files = this.editFiles();
    if ((!body && files.length === 0) || this.isSaving()) return;

    if (!body) {
      this.isSaving.set(true);
      this.cancelEdit();
      this.uploadAttachmentsForComment(commentId, files, false);
      return;
    }

    this.isSaving.set(true);
    this.comments.update(commentId, {
      body,
      mentionedUserIds: this.activeMentionIds('edit'),
    }).subscribe({
      next: () => {
        this.cancelEdit();
        this.editFiles.set([]);
        this.uploadAttachmentsForComment(commentId, files, false);
      },
      error: () => {
        this.toast.error('Could not save the change.');
        this.isSaving.set(false);
      },
    });
  }

  protected remove(comment: CommentSummary): void {
    const linkedAttachments = comment.attachments ?? [];
    const deleteAttachments = linkedAttachments.length > 0
      ? window.confirm(`This comment has ${linkedAttachments.length} attached file(s): ${linkedAttachments.map((a) => a.fileName).join(', ')}.\n\nDelete these files too? Select OK to delete them, or Cancel to keep them. The comment will be deleted either way.`)
      : false;
    if (linkedAttachments.length === 0 && !window.confirm('Delete this comment? This cannot be undone.')) return;

    const deleteComment = () => this.comments.delete(comment.id).subscribe({
      next: () => {
        this.toast.success('Comment deleted.');
        if (deleteAttachments) this.attachments.notifyChanged();
        this.load();
      },
      error: () => this.toast.error('Could not delete the comment.'),
    });

    if (!deleteAttachments) {
      deleteComment();
      return;
    }
    forkJoin(linkedAttachments.map((attachment) => this.attachments.deleteAttachment(attachment.id))).subscribe({
      next: () => {
        this.attachments.notifyChanged();
        deleteComment();
      },
      error: () => this.toast.error('Could not delete all files attached to this comment. The comment was kept.'),
    });
  }

  protected canDeleteAttachment(attachment: { uploadedBy: { id: string } }): boolean {
    const user = this.auth.currentUser();
    return attachment.uploadedBy.id === user?.id
      || user?.systemRole === 'ADMIN'
      || user?.systemRole === 'SUPER_ADMIN';
  }

  protected deleteAttachment(attachment: { id: string; fileName: string }): void {
    if (!window.confirm(`Delete "${attachment.fileName}"?`)) return;
    this.attachments.deleteAttachment(attachment.id).subscribe({
      next: () => {
        this.toast.success('Attachment deleted.');
        this.attachments.notifyChanged();
        this.load();
      },
      error: () => this.toast.error('Could not delete the attachment.'),
    });
  }

  // ---------------------------------------------------------------------------
  // @-mention autocomplete
  // ---------------------------------------------------------------------------

  /** Ids whose "@Name" still appears in the selected draft. `@All` expands to
   * every mentionable project member except the signed-in user. The server
   * still validates every id against active project membership. */
  protected activeMentionIds(context: MentionContext = 'new'): string[] {
    const draft = this.draftFor(context);
    const inserted = this.mentionsFor(context);
    const currentUserId = this.auth.currentUser()?.id;
    const ids = [...inserted.entries()]
      .filter(([id, name]) => id !== MENTION_ALL_ID && this.hasMention(draft, name))
      .map(([id]) => id)
      .filter((id) => id !== currentUserId);

    if (inserted.has(MENTION_ALL_ID) && this.hasMention(draft, 'All')) {
      if (context === 'edit') {
        ids.push(...this.editAllMentionIds);
      }
      ids.push(
        ...this.mentionableUsers
          .filter((user) => user.id !== currentUserId)
          .map((user) => user.id),
      );
    }

    return [...new Set(ids)];
  }

  protected activeMentionNames(context: MentionContext = 'new'): string[] {
    const draft = this.draftFor(context);
    return [...this.mentionsFor(context).entries()]
      .filter(([, name]) => this.hasMention(draft, name))
      .map(([, name]) => name);
  }

  protected onMentionInput(context: MentionContext, textarea: HTMLTextAreaElement): void {
    this.mentionContext.set(context);
    this.caretPosition = textarea.selectionStart ?? this.draftFor(context).length;
    this.refreshMentionMatches(context);
  }

  /** Arrow keys and Enter drive the list while it is open; otherwise the
   * textarea behaves normally. */
  protected onMentionKeydown(
    event: KeyboardEvent,
    context: MentionContext,
    textarea: HTMLTextAreaElement,
  ): void {
    if (this.mentionContext() !== context || this.mentionMatches().length === 0) return;

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
          this.selectMention(choice, context, textarea);
        }
        return;
      }
      case 'Escape':
        event.preventDefault();
        this.closeMentions();
        return;
    }
  }

  protected selectMention(
    user: MentionableUser,
    context: MentionContext,
    textarea: HTMLTextAreaElement,
  ): void {
    if (this.mentionStart < 0 || this.mentionContext() !== context) return;

    const draft = this.draftFor(context);
    const before = draft.slice(0, this.mentionStart);
    const after = draft.slice(this.caretPosition);
    const inserted = `@${user.name} `;

    this.setDraft(context, `${before}${inserted}${after}`);
    this.mentionsFor(context).set(user.id, user.name);
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
  private refreshMentionMatches(context: MentionContext): void {
    const upToCaret = this.draftFor(context).slice(0, this.caretPosition);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(upToCaret);

    if (!match) {
      this.closeMentions();
      return;
    }

    const query = match[1].toLowerCase();
    this.mentionStart = this.caretPosition - match[1].length - 1;

    const currentUserId = this.auth.currentUser()?.id;
    const eligibleUsers = this.mentionableUsers.filter(
      (user) => user.id !== currentUserId,
    );
    const candidates: MentionableUser[] = eligibleUsers.length > 0
      ? [{ id: MENTION_ALL_ID, name: 'All' }, ...eligibleUsers]
      : [];
    const matches = candidates
      .filter((user) => user.name.toLowerCase().includes(query))
      .slice(0, MENTION_RESULT_LIMIT);

    this.mentionMatches.set(matches);
    this.mentionHighlight.set(0);
  }

  protected closeMentions(): void {
    this.mentionMatches.set([]);
    this.mentionHighlight.set(0);
    this.mentionContext.set(null);
    this.mentionStart = -1;
  }

  protected usesAllMention(comment: CommentSummary): boolean {
    return comment.mentions.length > 0 && this.hasMention(comment.body, 'All');
  }

  private hasMention(body: string, name: string): boolean {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)@${escapedName}(?=$|\\s|[.,!?;:])`).test(body);
  }

  private mentionsFor(context: MentionContext): Map<string, string> {
    if (context === 'reply') return this.replyInsertedMentions;
    if (context === 'edit') return this.editInsertedMentions;
    return this.insertedMentions;
  }

  private draftFor(context: MentionContext): string {
    if (context === 'reply') return this.replyBody;
    if (context === 'edit') return this.editBody;
    return this.newBody;
  }

  private setDraft(context: MentionContext, value: string): void {
    if (context === 'reply') {
      this.replyBody = value;
    } else if (context === 'edit') {
      this.editBody = value;
    } else {
      this.newBody = value;
    }
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

  protected onFileSelected(event: Event, context: 'new' | 'reply' | 'edit' = 'new'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);
    const currentFiles = [...(context === 'reply'
      ? this.replyFiles()
      : context === 'edit'
        ? this.editFiles()
        : this.selectedFiles())];

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

    if (context === 'reply') this.replyFiles.set(currentFiles);
    else if (context === 'edit') this.editFiles.set(currentFiles);
    else this.selectedFiles.set(currentFiles);
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

  protected removeFile(index: number, context: 'new' | 'reply' | 'edit' = 'new'): void {
    const files = [...(context === 'reply'
      ? this.replyFiles()
      : context === 'edit'
        ? this.editFiles()
        : this.selectedFiles())];
    files.splice(index, 1);
    if (context === 'reply') this.replyFiles.set(files);
    else if (context === 'edit') this.editFiles.set(files);
    else this.selectedFiles.set(files);
  }

  protected triggerFileInput(inputId = 'comment-file-input'): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    input?.click();
  }

  private resetComposers(): void {
    this.newBody = '';
    this.insertedMentions.clear();
    this.replyInsertedMentions.clear();
    this.editInsertedMentions.clear();
    this.editAllMentionIds.clear();
    this.closeMentions();
    this.replyBody = '';
    this.editBody = '';
    this.replyingTo.set(null);
    this.editingId.set(null);
    this.selectedFiles.set([]);
    this.replyFiles.set([]);
    this.editFiles.set([]);
  }
}
