import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import type { CaseView } from '@sebsa-pm-tool/shared-models';

@Injectable({
  providedIn: 'root',
})
export class CsoService {
  private readonly apiUrl = '/api/cso';

  constructor(private readonly http: HttpClient) {}

  getCases(): Observable<CaseView[]> {
    return this.http.get<CaseView[]>(`${this.apiUrl}/cases`);
  }
}
