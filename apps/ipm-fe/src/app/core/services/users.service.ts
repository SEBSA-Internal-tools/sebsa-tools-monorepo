import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { UserSummary } from '@sebsa-pm-tool/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  search(term: string): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>('/api/users', { params: { search: term } });
  }
}
