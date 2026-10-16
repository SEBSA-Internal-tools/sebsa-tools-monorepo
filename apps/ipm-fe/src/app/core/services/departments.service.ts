import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateDepartmentRequest,
  Department,
  UpdateDepartmentRequest,
} from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DepartmentsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Department[]> {
    return this.http.get<Department[]>('/api/departments');
  }

  create(dto: CreateDepartmentRequest): Observable<Department> {
    return this.http.post<Department>('/api/departments', dto);
  }

  update(id: string, dto: UpdateDepartmentRequest): Observable<Department> {
    return this.http.patch<Department>(`/api/departments/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/departments/${id}`);
  }
}
