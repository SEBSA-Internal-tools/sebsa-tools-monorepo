import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Project } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  private mockProjects: Project[] = [
    {
      name: 'Website Revamp',
      owner: 'Design Team',
      status: 'In progress',
      statusTone: 'progress',
      progress: 68,
      due: '18 Jul',
    },
    {
      name: 'Mobile App Release',
      owner: 'Product Squad',
      status: 'At risk',
      statusTone: 'warning',
      progress: 42,
      due: '10 Jul',
    },
    {
      name: 'Client Onboarding',
      owner: 'Delivery',
      status: 'On track',
      statusTone: 'success',
      progress: 81,
      due: '24 Jul',
    },
  ];

  getProjects(): Observable<Project[]> {
    return of(this.mockProjects);
  }
}
