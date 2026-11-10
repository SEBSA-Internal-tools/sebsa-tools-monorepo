import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ActivityItem } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  getRecentActivity(): Observable<ActivityItem[]> {
    return of([]);
  }
}
