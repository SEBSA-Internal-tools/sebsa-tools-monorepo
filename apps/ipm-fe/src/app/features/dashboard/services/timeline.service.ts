import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Milestone } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class TimelineService {
  private mockMilestones: Milestone[] = [
    {
      title: 'Requirements sign-off',
      owner: 'Product',
      date: 'Today',
      complete: true,
    },
    {
      title: 'Design handoff',
      owner: 'UX',
      date: 'Tomorrow',
      complete: true,
    },
    {
      title: 'API freeze',
      owner: 'Engineering',
      date: '15 Jul',
      complete: false,
    },
    {
      title: 'UAT start',
      owner: 'Delivery',
      date: '19 Jul',
      complete: false,
    },
  ];

  getMilestones(): Observable<Milestone[]> {
    return of(this.mockMilestones);
  }
}
