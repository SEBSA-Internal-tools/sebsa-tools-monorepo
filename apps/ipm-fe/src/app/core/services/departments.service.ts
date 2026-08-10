import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Department } from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DepartmentsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Department[]> {
    return this.http.get<Department[]>('/api/departments');
  }
}
