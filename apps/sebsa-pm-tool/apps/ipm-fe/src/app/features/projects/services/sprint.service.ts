import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Sprint, SprintSummary } from '@sebsa-pm-tool/shared-models';

export interface CreateSprintRequest {
  name: string;
  startDate: string;
  endDate: string;
  goal?: string;
}

export interface UpdateSprintRequest {
  status?: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  name?: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

@Injectable({ providedIn: 'root' })
export class SprintService {
  private readonly http = inject(HttpClient);

  /** Get all sprints for a project */
  getSprints(projectId: string): Observable<SprintSummary[]> {
    return this.http.get<SprintSummary[]>(`/api/projects/${projectId}/sprints`);
  }

  /** Get a single sprint by ID */
  getSprintById(sprintId: string, projectId: string): Observable<Sprint> {
    return this.http.get<Sprint>(`/api/projects/${projectId}/sprints/${sprintId}`);
  }

  /** Create a new sprint under a project */
  createSprint(projectId: string, dto: CreateSprintRequest): Observable<Sprint> {
    return this.http.post<Sprint>(`/api/projects/${projectId}/sprints`, dto);
  }

  /** Update sprint fields or lifecycle status */
  updateSprint(
    projectId: string,
    sprintId: string,
    dto: UpdateSprintRequest,
  ): Observable<Sprint> {
    return this.http.patch<Sprint>(`/api/projects/${projectId}/sprints/${sprintId}`, dto);
  }

  /** Delete a sprint */
  deleteSprint(projectId: string, sprintId: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/sprints/${sprintId}`);
  }
}
