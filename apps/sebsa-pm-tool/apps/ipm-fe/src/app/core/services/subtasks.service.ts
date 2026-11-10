import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateSubtaskRequest,
  Subtask,
  UpdateSubtaskRequest,
} from '@sebsa-pm-tool/shared-models';

@Injectable({ providedIn: 'root' })
export class SubtasksService {
  private readonly http = inject(HttpClient);

  getByTask(taskId: string): Observable<Subtask[]> {
    return this.http.get<Subtask[]>(`/api/tasks/${taskId}/subtasks`);
  }

  create(taskId: string, dto: CreateSubtaskRequest): Observable<Subtask> {
    return this.http.post<Subtask>(`/api/tasks/${taskId}/subtasks`, dto);
  }

  update(subtaskId: string, dto: UpdateSubtaskRequest): Observable<Subtask> {
    return this.http.patch<Subtask>(`/api/subtasks/${subtaskId}`, dto);
  }

  delete(subtaskId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/subtasks/${subtaskId}`);
  }

  assignUsers(subtaskId: string, assigneeIds: string[]): Observable<Subtask> {
    return this.http.post<Subtask>(`/api/subtasks/${subtaskId}/assignees`, { assigneeIds });
  }

  unassignUser(subtaskId: string, userId: string): Observable<Subtask> {
    return this.http.delete<Subtask>(`/api/subtasks/${subtaskId}/assignees/${userId}`);
  }
}
