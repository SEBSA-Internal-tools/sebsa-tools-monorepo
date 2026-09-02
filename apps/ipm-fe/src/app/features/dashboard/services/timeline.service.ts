import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Milestone } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class TimelineService {
  getMilestones(): Observable<Milestone[]> {
    return of([]);
  }
}
