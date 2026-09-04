import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CreateSubtaskTypeRequest, SubtaskType, UpdateSubtaskTypeRequest } from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SubtaskTypesService {
  private readonly http = inject(HttpClient);

  list(): Observable<SubtaskType[]> {
    return this.http.get<SubtaskType[]>('/api/subtask-types');
  }

  create(dto: CreateSubtaskTypeRequest): Observable<SubtaskType> {
    return this.http.post<SubtaskType>('/api/subtask-types', dto);
  }

  update(id: string, dto: UpdateSubtaskTypeRequest): Observable<SubtaskType> {
    return this.http.patch<SubtaskType>(`/api/subtask-types/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/subtask-types/${id}`);
  }
}
