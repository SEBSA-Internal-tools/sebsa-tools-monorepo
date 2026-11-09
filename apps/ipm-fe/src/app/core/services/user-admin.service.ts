import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserDepartmentRequest,
  UserAdminSummary,
} from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);

  listAll(): Observable<UserAdminSummary[]> {
    return this.http.get<UserAdminSummary[]>('/api/users/all');
  }

  listPending(): Observable<UserAdminSummary[]> {
    return this.http.get<UserAdminSummary[]>('/api/users/pending');
  }

  create(dto: CreateUserRequest): Observable<CreateUserResponse> {
    return this.http.post<CreateUserResponse>('/api/users', dto);
  }

  approve(id: string): Observable<UserAdminSummary> {
    return this.http.patch<UserAdminSummary>(`/api/users/${id}/approve`, {});
  }

  activate(id: string): Observable<UserAdminSummary> {
    return this.http.patch<UserAdminSummary>(`/api/users/${id}/activate`, {});
  }

  deactivate(id: string): Observable<UserAdminSummary> {
    return this.http.patch<UserAdminSummary>(`/api/users/${id}/deactivate`, {});
  }

  updateDepartment(
    id: string,
    dto: UpdateUserDepartmentRequest,
  ): Observable<UserAdminSummary> {
    return this.http.patch<UserAdminSummary>(`/api/users/${id}/department`, dto);
  }
}
