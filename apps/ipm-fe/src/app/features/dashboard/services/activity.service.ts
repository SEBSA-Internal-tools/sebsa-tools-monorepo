import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ActivityItem } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private mockActivity: ActivityItem[] = [
    {
      actor: 'Ava',
      action: 'updated',
      target: 'Website Revamp scope',
      time: '5m ago',
    },
    {
      actor: 'Maya',
      action: 'commented on',
      target: 'API freeze checklist',
      time: '23m ago',
    },
    {
      actor: 'Noah',
      action: 'moved',
      target: 'Login flow to In Review',
      time: '1h ago',
    },
    {
      actor: 'Product Board',
      action: 'approved',
      target: 'July release plan',
      time: '3h ago',
    },
  ];

  getRecentActivity(): Observable<ActivityItem[]> {
    return of(this.mockActivity);
  }
}
