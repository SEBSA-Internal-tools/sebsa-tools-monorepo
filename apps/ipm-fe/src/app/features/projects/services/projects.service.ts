import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import {
  Project,
  ProjectSummary,
  ProjectRole,
  ProjectMemberSummary,
  CreateProjectRequest,
  UpdateProjectRequest,
  AddProjectMemberRequest,
  UpdateProjectMemberRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  SprintSummary,
  CreateProjectPriorityRequest,
  UpdateProjectPriorityRequest,
} from '@sebsa-pm-tool/shared-models';

export interface Task {
  id: string;
  title: string;
  category: string;
  status: 'new' | 'todo' | 'inprogress' | 'done';
  priority: string;
  duration: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
  sprintId?: string;
}

export interface Sprint {
  id: string;
  name: string;
  projectId: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  goal?: string | null;
  taskCount?: number;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  tasks?: Task[];
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
  private readonly http = inject(HttpClient);


  getProjects(): Observable<ProjectSummary[]> {
    return this.http.get<ProjectSummary[]>('/api/projects');
  }

  getProject(id: string): Observable<Project> {
    return this.http.get<Project>(`/api/projects/${id}`);
  }

  createProject(dto: CreateProjectRequest): Observable<Project> {
    return this.http.post<Project>('/api/projects', dto);
  }

  updateProject(id: string, dto: UpdateProjectRequest): Observable<Project> {
    return this.http.patch<Project>(`/api/projects/${id}`, dto);
  }

  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`);
  }

  getRoles(id: string): Observable<ProjectRole[]> {
    return this.http.get<ProjectRole[]>(`/api/projects/${id}/roles`);
  }

  getWorkflowStages(projectId: string): Observable<{ id: string; name: string; order: number; isDefault: boolean }[]> {
    return this.http.get<{ id: string; name: string; order: number; isDefault: boolean }[]>(`/api/projects/${projectId}/workflow-stages`);
  }

  createWorkflowStage(
    projectId: string,
    name: string,
    order?: number,
  ): Observable<{ id: string; name: string; order: number }> {
    return this.http.post<{ id: string; name: string; order: number }>(
      `/api/projects/${projectId}/workflow-stages`,
      { name, ...(order !== undefined && { order }) },
    );
  }

  updateWorkflowStage(
    projectId: string,
    stageId: string,
    name: string,
    order?: number
  ): Observable<{ id: string; name: string; order: number }> {
    return this.http.patch<{ id: string; name: string; order: number }>(
      `/api/projects/${projectId}/workflow-stages/${stageId}`,
      { name, ...(order !== undefined && { order }) }
    );
  }

  deleteWorkflowStage(projectId: string, stageId: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/workflow-stages/${stageId}`);
  }

  getProjectPriorities(projectId: string): Observable<{ id: string; name: string; color: string | null; order: number; isDefault: boolean }[]> {
    return this.http.get<{ id: string; name: string; color: string | null; order: number; isDefault: boolean }[]>(`/api/projects/${projectId}/priorities`);
  }

  createProjectPriority(projectId: string, dto: CreateProjectPriorityRequest): Observable<{ id: string; name: string; color: string | null; order: number }> {
    return this.http.post<{ id: string; name: string; color: string | null; order: number }>(`/api/projects/${projectId}/priorities`, dto);
  }

  updateProjectPriority(projectId: string, priorityId: string, dto: UpdateProjectPriorityRequest): Observable<{ id: string; name: string; color: string | null; order: number }> {
    return this.http.patch<{ id: string; name: string; color: string | null; order: number }>(`/api/projects/${projectId}/priorities/${priorityId}`, dto);
  }

  deleteProjectPriority(projectId: string, priorityId: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/priorities/${priorityId}`);
  }

  createRole(id: string, dto: CreateRoleRequest): Observable<ProjectRole> {
    return this.http.post<ProjectRole>(`/api/projects/${id}/roles`, dto);
  }

  updateRole(id: string, roleId: string, dto: UpdateRoleRequest): Observable<ProjectRole> {
    return this.http.patch<ProjectRole>(`/api/projects/${id}/roles/${roleId}`, dto);
  }

  getMembers(id: string): Observable<ProjectMemberSummary[]> {
    return this.http.get<ProjectMemberSummary[]>(`/api/projects/${id}/members`);
  }

  addMember(id: string, dto: AddProjectMemberRequest): Observable<ProjectMemberSummary> {
    return this.http.post<ProjectMemberSummary>(`/api/projects/${id}/members`, dto);
  }

  updateMemberRole(
    id: string,
    memberId: string,
    dto: UpdateProjectMemberRoleRequest,
  ): Observable<ProjectMemberSummary> {
    return this.http.patch<ProjectMemberSummary>(
      `/api/projects/${id}/members/${memberId}`,
      dto,
    );
  }

  removeMember(id: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}/members/${memberId}`);
  }

  getHeroData(): ProjectsHeroData {
    return {
      title: 'Welcome to Projects',
      description:
        'A flexible workspace to manage your ERP implementations, tasks, and consulting workflows. Built to be flexible and adaptable, giving you a live canvas to filter, sort, and group issues.',
      ctaLabel: 'Learn more',
    };
  }


  private readonly defaultSprints: Sprint[] = [
    {
      id: 'SPR-001',
      name: 'Sprint 1: Foundation Setup',
      projectId: '954',
      status: 'COMPLETED',
      startDate: '2024-01-01',
      endDate: '2024-01-14',
      description: 'Initial infrastructure and database setup',
      createdAt: '2023-12-15',
      updatedAt: '2024-01-14',
      taskCount: 5,
      goal: 'Complete foundation setup',
    },
    {
      id: 'SPR-002',
      name: 'Sprint 2: Data Migration',
      projectId: '954',
      status: 'ACTIVE',
      startDate: '2024-01-15',
      endDate: '2024-01-31',
      description: 'Legacy data migration and validation',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-20',
      taskCount: 8,
      goal: 'Migrate legacy data',
    },
    {
      id: 'SPR-003',
      name: 'Sprint 3: Testing & QA',
      projectId: '954',
      status: 'PLANNED',
      startDate: '2024-02-01',
      endDate: '2024-02-14',
      description: 'Comprehensive testing and quality assurance',
      createdAt: '2024-01-10',
      updatedAt: '2024-01-10',
      taskCount: 6,
      goal: 'Complete QA testing',
    },
  ];

  private sprints$ = new BehaviorSubject<Sprint[]>(this.defaultSprints);

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
      sprintId: 'SPR-002',
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
      sprintId: 'SPR-001',
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
      sprintId: 'SPR-002',
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
      sprintId: 'SPR-002',
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
      sprintId: 'SPR-003',
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
    priority: string;
    dueDate: string;
    description: string;
    sprintId?: string;
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
      sprintId: formData.sprintId,
    };
    const currentTasks = this.tasks$.value;
    this.tasks$.next([...currentTasks, newTask]);
  }

  getSprints(projectId: string): Sprint[] {
    this.http.get<SprintSummary[]>(`/api/projects/${projectId}/sprints`).pipe(
      tap((sprints: any) => {
        const current = this.sprints$.value.filter((s) => s.projectId !== projectId);
        this.sprints$.next([...current, ...sprints]);
      }),
    ).subscribe();
    return this.sprints$.value.filter((s) => s.projectId === projectId);
  }

  getSprintsObservable(projectId: string): Observable<Sprint[]> {
    return this.http.get<SprintSummary[]>(`/api/projects/${projectId}/sprints`).pipe(
      tap((sprints: any) => {
        const current = this.sprints$.value.filter((s) => s.projectId !== projectId);
        this.sprints$.next([...current, ...sprints]);
      }),
    ) as Observable<Sprint[]>;
  }

  getSprintById(sprintId: string): Sprint | undefined {
    return this.sprints$.value.find((s) => s.id === sprintId);
  }

  getSprintTasks(sprintId: string): Task[] {
    return this.tasks$.value.filter((t) => t.sprintId === sprintId);
  }

  createSprint(formData: {
    name: string;
    projectId: string;
    startDate: string;
    endDate: string;
    description?: string;
  }): Sprint {
    const newSprint: Sprint = {
      id: `SPR-${String(this.sprints$.value.length + 1).padStart(3, '0')}`,
      name: formData.name,
      projectId: formData.projectId,
      status: 'PLANNED',
      startDate: formData.startDate,
      endDate: formData.endDate,
      description: formData.description,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      taskCount: 0,
      goal: null,
    };
    const currentSprints = this.sprints$.value;
    this.sprints$.next([...currentSprints, newSprint]);
    return newSprint;
  }

  deleteSprint(sprintId: string): void {
    const currentSprints = this.sprints$.value;
    const updatedSprints = currentSprints.filter((s) => s.id !== sprintId);
    this.sprints$.next(updatedSprints);

    const tasks = this.tasks$.value.map((t) =>
      t.sprintId === sprintId ? { ...t, sprintId: undefined } : t
    );
    this.tasks$.next(tasks);
  }

  updateSprintStatus(sprintId: string, status: Sprint['status']): void {
    const sprints = this.sprints$.value.map((s) =>
      s.id === sprintId ? { ...s, status } : s
    );
    this.sprints$.next(sprints);
  }
}
