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

export interface Task {
  id: string;
  title: string;
  category: string;
  status: 'new' | 'todo' | 'inprogress' | 'done';
  priority: 'High' | 'Medium' | 'Low';
  duration: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
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

  getAllProjects(): ProjectItem[] {
    return this.projects$.value;
  }

  private tasks$ = new BehaviorSubject<Task[]>([
    {
      id: 'PMT-089',
      title: 'Review legacy data mapping docs',
      category: 'Data Migration',
      status: 'new',
      priority: 'High',
      duration: 'In stage: 2d',
      assignee: 'Sarah Miller',
      dueDate: '2024-01-15',
      projectId: '954',
    },
    {
      id: 'PMT-092',
      title: 'Setup initial staging environment',
      category: 'Infrastructure',
      status: 'todo',
      priority: 'High',
      duration: 'In stage: 1d',
      assignee: 'James Chen',
      dueDate: '2024-01-10',
      projectId: '954',
    },
    {
      id: 'PMT-093',
      title: 'Create migration scripts',
      category: 'Development',
      status: 'inprogress',
      priority: 'Medium',
      duration: 'In stage: 3d',
      assignee: 'Emma Rodriguez',
      dueDate: '2024-01-20',
      projectId: '954',
    },
    {
      id: 'PMT-094',
      title: 'Test data migration',
      category: 'Testing',
      status: 'done',
      priority: 'High',
      duration: 'In stage: 2d',
      assignee: 'David Kim',
      dueDate: '2024-01-12',
      projectId: '954',
    },
    {
      id: 'PMT-095',
      title: 'Document process flows',
      category: 'Documentation',
      status: 'new',
      priority: 'Low',
      duration: 'In stage: 1d',
      dueDate: '2024-01-25',
      projectId: '954',
    },
  ]);

  getTasks(projectId: string): Task[] {
    return this.tasks$.value.filter((t) => t.projectId === projectId);
  }

  updateTaskStatus(taskId: string, newStatus: string): void {
    const tasks = this.tasks$.value.map((t) =>
      t.id === taskId ? { ...t, status: newStatus as Task['status'] } : t
    );
    this.tasks$.next(tasks);
  }

  createTask(formData: {
    title: string;
    projectId: string;
    assignee: string;
    priority: 'High' | 'Medium' | 'Low';
    dueDate: string;
    description: string;
  }): void {
    const newTask: Task = {
      id: `PMT-${String(this.tasks$.value.length + 1).padStart(3, '0')}`,
      title: formData.title,
      category: 'Development',
      status: 'new',
      priority: formData.priority,
      duration: 'Just now',
      assignee: formData.assignee || undefined,
      dueDate: formData.dueDate,
      projectId: formData.projectId,
    };
    const currentTasks = this.tasks$.value;
    this.tasks$.next([...currentTasks, newTask]);
  }
}
