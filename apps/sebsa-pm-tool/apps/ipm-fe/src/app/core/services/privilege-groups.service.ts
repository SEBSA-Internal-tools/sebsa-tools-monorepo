import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreatePrivilegeGroupRequest,
  PrivilegeGroup,
  UpdatePrivilegeGroupRequest,
} from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PrivilegeGroupsService {
  private readonly http = inject(HttpClient);

  list(): Observable<PrivilegeGroup[]> {
    return this.http.get<PrivilegeGroup[]>('/api/privilege-groups');
  }

  create(dto: CreatePrivilegeGroupRequest): Observable<PrivilegeGroup> {
    return this.http.post<PrivilegeGroup>('/api/privilege-groups', dto);
  }

  update(id: string, dto: UpdatePrivilegeGroupRequest): Observable<PrivilegeGroup> {
    return this.http.patch<PrivilegeGroup>(`/api/privilege-groups/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/privilege-groups/${id}`);
  }
}
