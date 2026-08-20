import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  priority: 'High' | 'Medium' | 'Low';
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

  getWorkflowStages(projectId: string): Observable<{ id: string; name: string; order: number; isDefault: boolean; taskCount: number }[]> {
    return this.http.get<{ id: string; name: string; order: number; isDefault: boolean; taskCount: number }[]>(`/api/projects/${projectId}/workflow-stages`);
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

  reorderWorkflowStages(projectId: string, stageIds: string[]): Observable<{ id: string; name: string; order: number }[]> {
    return this.http.patch<{ id: string; name: string; order: number }[]>(
      `/api/projects/${projectId}/workflow-stages/reorder`,
      { stageIds },
    );
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

  getSprintsObservable(projectId: string): Observable<Sprint[]> {
    return this.http.get<SprintSummary[]>(`/api/projects/${projectId}/sprints`) as Observable<Sprint[]>;
  }
}
