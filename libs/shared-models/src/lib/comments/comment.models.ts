/** A comment belongs to exactly one of these. */
export type CommentTargetType = 'CASE' | 'TASK';

export interface CommentAuthor {
  id: string;
  name: string;
  email: string;
}

export interface CommentMentionSummary {
  id: string;
  name: string;
}

export interface CommentSummary {
  id: string;
  caseId: string | null;
  taskId: string | null;
  parentCommentId: string | null;
  /** Plain text. Never HTML — the client must render it escaped. */
  body: string;
  isEdited: boolean;
  author: CommentAuthor;
  mentions: CommentMentionSummary[];
  /** Direct replies, newest last. Threading is one level deep. */
  replies: CommentSummary[];
  createdAt: string;
  updatedAt: string;
  /** Whether the requesting user may edit or delete this comment. */
  canModify: boolean;
}

export interface CreateCommentRequest {
  caseId?: string;
  taskId?: string;
  parentCommentId?: string;
  body: string;
  mentionedUserIds?: string[];
}

export interface UpdateCommentRequest {
  body: string;
  mentionedUserIds?: string[];
}
