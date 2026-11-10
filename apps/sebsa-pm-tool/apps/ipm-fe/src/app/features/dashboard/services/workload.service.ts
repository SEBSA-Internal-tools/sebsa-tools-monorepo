import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { TeamMember } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class WorkloadService {
  getTeamWorkload(): Observable<TeamMember[]> {
    return of([]);
  }
}
