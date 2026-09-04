import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateTaskComplexityLevelRequest,
  CreateTaskTypeRequest,
  TaskComplexityLevel,
  TaskType,
  UpdateTaskComplexityLevelRequest,
  UpdateTaskTypeRequest,
} from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TaskTypesService {
  private readonly http = inject(HttpClient);

  list(): Observable<TaskType[]> {
    return this.http.get<TaskType[]>('/api/task-types');
  }

  create(dto: CreateTaskTypeRequest): Observable<TaskType> {
    return this.http.post<TaskType>('/api/task-types', dto);
  }

  update(id: string, dto: UpdateTaskTypeRequest): Observable<TaskType> {
    return this.http.patch<TaskType>(`/api/task-types/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/task-types/${id}`);
  }

  createComplexityLevel(taskTypeId: string, dto: CreateTaskComplexityLevelRequest): Observable<TaskComplexityLevel> {
    return this.http.post<TaskComplexityLevel>(`/api/task-types/${taskTypeId}/complexity-levels`, dto);
  }

  updateComplexityLevel(
    taskTypeId: string,
    levelId: string,
    dto: UpdateTaskComplexityLevelRequest,
  ): Observable<TaskComplexityLevel> {
    return this.http.patch<TaskComplexityLevel>(`/api/task-types/${taskTypeId}/complexity-levels/${levelId}`, dto);
  }

  removeComplexityLevel(taskTypeId: string, levelId: string): Observable<void> {
    return this.http.delete<void>(`/api/task-types/${taskTypeId}/complexity-levels/${levelId}`);
  }
}
