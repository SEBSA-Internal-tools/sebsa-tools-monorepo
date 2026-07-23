import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SummaryCard } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class SummaryCardsService {
  private mockCards: SummaryCard[] = [
    {
      label: 'Active Projects',
      value: '12',
      change: '+2 this week',
      icon: 'folder_open',
    },
    {
      label: 'Open Tasks',
      value: '38',
      change: '9 due today',
      icon: 'task_alt',
    },
    {
      label: 'Blocked Items',
      value: '4',
      change: 'Needs attention',
      icon: 'warning',
    },
    {
      label: 'Delivery Health',
      value: '87%',
      change: 'On track overall',
      icon: 'monitor_heart',
    },
  ];

  getSummaryCards(): Observable<SummaryCard[]> {
    return of(this.mockCards);
  }
}
