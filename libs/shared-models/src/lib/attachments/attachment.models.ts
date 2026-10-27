import { UserSummary } from '../users/user-summary.model';

export interface AttachmentSummary {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  uploadedBy: Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>;
  createdAt: string;
}

export interface CreateAttachmentRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  taskId?: string;
  caseId?: string;
  commentId?: string;
}

export interface UploadAttachmentResponse {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  uploadedBy: Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>;
  createdAt: string;
}
