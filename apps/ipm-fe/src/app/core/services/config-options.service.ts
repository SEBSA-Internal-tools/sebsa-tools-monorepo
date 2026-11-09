import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ConfigKind,
  ConfigOption,
  ConfigScope,
  CreateConfigOptionRequest,
  ReorderConfigOptionsRequest,
  UpdateConfigOptionRequest,
} from '@sebsa-pm-tool/shared-models';

@Injectable({ providedIn: 'root' })
export class ConfigOptionsService {
  private readonly http = inject(HttpClient);

  list(
    scope: ConfigScope,
    options: { kind?: ConfigKind; includeInactive?: boolean; parentId?: string } = {},
  ): Observable<ConfigOption[]> {
    let params = new HttpParams().set('scope', scope);
    if (options.kind) params = params.set('kind', options.kind);
    if (options.includeInactive) params = params.set('includeInactive', 'true');
    if (options.parentId) params = params.set('parentId', options.parentId);

    return this.http.get<ConfigOption[]>('/api/config-options', { params });
  }

  create(dto: CreateConfigOptionRequest): Observable<ConfigOption> {
    return this.http.post<ConfigOption>('/api/config-options', dto);
  }

  update(id: string, dto: UpdateConfigOptionRequest): Observable<ConfigOption> {
    return this.http.patch<ConfigOption>(`/api/config-options/${id}`, dto);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/config-options/${id}`);
  }

  reorder(
    kind: ConfigKind,
    scope: ConfigScope,
    dto: ReorderConfigOptionsRequest,
  ): Observable<ConfigOption[]> {
    return this.http.patch<ConfigOption[]>(
      `/api/config-options/reorder/${kind}/${scope}`,
      dto,
    );
  }
}
