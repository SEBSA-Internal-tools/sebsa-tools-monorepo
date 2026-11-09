import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CommentSummary,
  CommentTargetType,
  CreateCommentRequest,
  UpdateCommentRequest,
} from '@sebsa-pm-tool/shared-models';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);

  getThread(targetType: CommentTargetType, targetId: string): Observable<CommentSummary[]> {
    const params = new HttpParams().set(
      targetType === 'CASE' ? 'caseId' : 'taskId',
      targetId,
    );
    return this.http.get<CommentSummary[]>('/api/comments', { params });
  }

  create(dto: CreateCommentRequest): Observable<CommentSummary> {
    return this.http.post<CommentSummary>('/api/comments', dto);
  }

  update(id: string, dto: UpdateCommentRequest): Observable<CommentSummary> {
    return this.http.patch<CommentSummary>(`/api/comments/${id}`, dto);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/comments/${id}`);
  }
}
