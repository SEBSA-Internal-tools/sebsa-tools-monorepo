import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { CommentTargetType, UploadAttachmentResponse } from '@sebsa-pm-tool/shared-models';

@Injectable({
  providedIn: 'root',
})
export class AttachmentsService {
  private readonly http = inject(HttpClient);
  private readonly changedSubject = new Subject<void>();
  readonly changed$ = this.changedSubject.asObservable();

  notifyChanged(): void {
    this.changedSubject.next();
  }

  uploadAttachment(
    file: File,
    targetType: CommentTargetType,
    targetId: string,
    commentId?: string,
  ): Observable<UploadAttachmentResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const idParam = targetType === 'CASE' ? 'caseId' : 'taskId';
    const params: string[] = [`${idParam}=${targetId}`];
    if (commentId) {
      params.push(`commentId=${commentId}`);
    }

    return this.http.post<UploadAttachmentResponse>(
      `/api/attachments/upload?${params.join('&')}`,
      formData,
    );
  }

  getTaskAttachments(taskId: string): Observable<UploadAttachmentResponse[]> {
    return this.http.get<UploadAttachmentResponse[]>(`/api/attachments/task/${taskId}`);
  }

  getCaseAttachments(caseId: string): Observable<UploadAttachmentResponse[]> {
    return this.http.get<UploadAttachmentResponse[]>(`/api/attachments/case/${caseId}`);
  }

  deleteAttachment(attachmentId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/attachments/${attachmentId}`);
  }

  /** Fetched as a blob (not a plain <a href>) so the auth interceptor can
   *  attach the bearer token — the download route is guarded. */
  downloadFile(filePath: string): Observable<Blob> {
    return this.http.get(`/api/attachments/download/${encodeURIComponent(filePath)}`, {
      responseType: 'blob',
    });
  }
}
