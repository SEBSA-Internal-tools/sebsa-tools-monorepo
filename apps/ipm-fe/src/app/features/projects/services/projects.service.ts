import { Injectable } from '@angular/core';
import { Observable, of, shareReplay, BehaviorSubject } from 'rxjs';

export interface ProjectItem {
  id: string;
  name: string;
  owner: string;
  status: 'Open' | 'Closed';
  visibility: 'Private' | 'Public';
  lastUpdated: string;
  icon?: string;
}

export interface ProjectsHeroData {
  title: string;
  description: string;
  ctaLabel: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectsService {
  private projects$ = new BehaviorSubject<ProjectItem[]>([
    {
      id: '954',
      name: '@SEBSA / Global ERP Rollout',
      owner: 'SEBSA',
      status: 'Open',
      visibility: 'Private',
      lastUpdated: 'Oct 24, 2023',
      icon: 'folder_open',
    },
    {
      id: '902',
      name: '@SEBSA / Q4 Financial Audit Prep',
      owner: 'SEBSA',
      status: 'Closed',
      visibility: 'Public',
      lastUpdated: 'Oct 20, 2023',
      icon: 'assessment',
    },
    {
      id: '1',
      name: "@Sanjeewa001's untitled project",
      owner: 'Sanjeewa001',
      status: 'Open',
      visibility: 'Private',
      lastUpdated: 'May 1, 2024',
      icon: 'folder',
    },
  ]);

  getProjects(): Observable<ProjectItem[]> {
    return this.projects$.asObservable().pipe(shareReplay(1));
  }

  getOpenProjects(): Observable<ProjectItem[]> {
    return of(this.projects$.value.filter((p) => p.status === 'Open')).pipe(
      shareReplay(1)
    );
  }

  getClosedProjects(): Observable<ProjectItem[]> {
    return of(this.projects$.value.filter((p) => p.status === 'Closed')).pipe(
      shareReplay(1)
    );
  }

  addProject(project: Omit<ProjectItem, 'id'>): void {
    const newProject: ProjectItem = {
      ...project,
      id: String(Date.now()),
    };
    const currentProjects = this.projects$.value;
    this.projects$.next([...currentProjects, newProject]);
  }

  deleteProject(projectId: string): void {
    const currentProjects = this.projects$.value;
    const updatedProjects = currentProjects.filter((p) => p.id !== projectId);
    this.projects$.next(updatedProjects);
  }

  searchProjects(query: string): Observable<ProjectItem[]> {
    return of(
      this.projects$.value.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.owner.toLowerCase().includes(query.toLowerCase())
      )
    ).pipe(shareReplay(1));
  }

  getHeroData(): ProjectsHeroData {
    return {
      title: 'Welcome to Projects',
      description:
        'A flexible workspace to manage your ERP implementations, tasks, and consulting workflows. Built to be flexible and adaptable, giving you a live canvas to filter, sort, and group issues.',
      ctaLabel: 'Learn more',
    };
  }
}
