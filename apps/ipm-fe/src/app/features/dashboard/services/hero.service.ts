import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HeroData } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class HeroService {
  private heroMockData: HeroData = {
    title: 'Keep delivery, team load, and blockers in one view',
    description:
      'This dashboard gives a fast read on project health, task flow, and release risk so a PM can decide what needs attention first.',
    stats: [
      {
        icon: 'schedule',
        value: '7',
        label: 'days to next release',
      },
      {
        icon: 'group',
        value: '24',
        label: 'team members active',
      },
    ],
  };

  getHeroData(): Observable<HeroData> {
    return of(this.heroMockData);
  }
}
