import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { TeamMember } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class WorkloadService {
  private mockWorkload: TeamMember[] = [
    { name: 'Ava', role: 'PM', load: 78 },
    { name: 'Noah', role: 'Frontend', load: 64 },
    { name: 'Maya', role: 'Backend', load: 52 },
    { name: 'Liam', role: 'QA', load: 46 },
  ];

  getTeamWorkload(): Observable<TeamMember[]> {
    return of(this.mockWorkload);
  }
}
