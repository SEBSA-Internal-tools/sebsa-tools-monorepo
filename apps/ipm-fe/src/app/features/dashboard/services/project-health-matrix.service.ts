import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ProjectHealthMatrix } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class ProjectHealthMatrixService {
  private mockProjectHealthMatrix: ProjectHealthMatrix[] = [
    {
      projectName: 'Website Revamp',
      health: 'On Track',
      healthStatus: 'success',
      budget: 85,
      timeline: 68,
      resources: 92,
      risks: 2,
      completionPercentage: 68,
      team: ['Alice Johnson', 'Bob Smith'],
    },
    {
      projectName: 'Mobile App Release',
      health: 'At Risk',
      healthStatus: 'warning',
      budget: 45,
      timeline: 42,
      resources: 58,
      risks: 5,
      completionPercentage: 42,
      team: ['Carol Davis', 'David Wilson'],
    },
    {
      projectName: 'Client Onboarding',
      health: 'On Track',
      healthStatus: 'success',
      budget: 88,
      timeline: 81,
      resources: 95,
      risks: 1,
      completionPercentage: 81,
      team: ['Eve Martinez', 'Frank Brown'],
    },
    {
      projectName: 'AI Integration',
      health: 'Critical',
      healthStatus: 'danger',
      budget: 25,
      timeline: 18,
      resources: 35,
      risks: 8,
      completionPercentage: 18,
      team: ['Grace Lee', 'Henry White'],
    },
    {
      projectName: 'Infrastructure Upgrade',
      health: 'On Track',
      healthStatus: 'success',
      budget: 92,
      timeline: 75,
      resources: 88,
      risks: 0,
      completionPercentage: 75,
      team: ['Iris Taylor', 'Jack Miller'],
    },
    {
      projectName: 'Security Enhancement',
      health: 'At Risk',
      healthStatus: 'warning',
      budget: 70,
      timeline: 60,
      resources: 72,
      risks: 3,
      completionPercentage: 60,
      team: ['Karen Anderson', 'Leo Thomas'],
    },
  ];

  getProjectHealthMatrix(): Observable<ProjectHealthMatrix[]> {
    return of(this.mockProjectHealthMatrix);
  }
}
