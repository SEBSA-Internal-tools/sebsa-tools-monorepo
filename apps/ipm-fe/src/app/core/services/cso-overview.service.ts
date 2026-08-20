import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import {
  ProjectSummary,
  TaskCategory,
  TaskSummary as BackendTaskSummary,
} from '@sebsa-pm-tool/shared-models';

export interface CsoOverviewFilters {
  projectId?: string;
  customerId?: string;
  priority?: string;
  assigneeId?: string;
  /** Restricts to the Functional or Technical queue when set. */
  category?: TaskCategory;
}

export interface CsoTaskView {
  id: string;
  title: string;
  priority: string;
  priorityColor: string | null;
  /** Positional bucket derived from the task's own project's stage order —
   *  same convention as TasksService.getStatusForStageId, computed per-task
   *  here since CSO Overview spans multiple projects with different stages. */
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  workflowStageName: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  customerName?: string;
}

interface WorkflowStageRef {
  id: string;
  name: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class CsoOverviewService {
  private readonly http = inject(HttpClient);

  private readonly _tasks = signal<CsoTaskView[]>([]);
  readonly tasks = this._tasks.asReadonly();

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  load(filters: CsoOverviewFilters): void {
    this._isLoading.set(true);

    let params = new HttpParams().set('isCsoLabeled', 'true');
    if (filters.projectId) params = params.set('projectId', filters.projectId);
    if (filters.customerId) params = params.set('customerId', filters.customerId);
    if (filters.priority) params = params.set('priority', filters.priority);
    if (filters.assigneeId) params = params.set('assigneeId', filters.assigneeId);
    if (filters.category) params = params.set('category', filters.category);

    this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(switchMap((tasks) => this.resolveDetails(tasks)))
      .subscribe({
        next: (views) => {
          this._tasks.set(views);
          this._isLoading.set(false);
        },
        error: () => {
          this._tasks.set([]);
          this._isLoading.set(false);
        },
      });
  }

  /** For each distinct project among the results, loads its ordered workflow
   *  stages (for status bucketing) and its customerName (for display) —
   *  neither is present on the flat cross-project task response. */
  private resolveDetails(tasks: BackendTaskSummary[]): Observable<CsoTaskView[]> {
    if (tasks.length === 0) return of([]);

    const projectIds = [...new Set(tasks.map((t) => t.projectId))];
    const stageRequests = projectIds.reduce<Record<string, Observable<WorkflowStageRef[]>>>(
      (acc, projectId) => {
        acc[projectId] = this.http.get<WorkflowStageRef[]>(
          `/api/projects/${projectId}/workflow-stages`,
        );
        return acc;
      },
      {},
    );

    return forkJoin({
      stagesByProject: forkJoin(stageRequests),
      projects: this.http.get<ProjectSummary[]>('/api/projects'),
    }).pipe(
      map(({ stagesByProject, projects }) => {
        const customerNameByProjectId = new Map(
          projects.map((project) => [project.id, project.customer.name]),
        );
        return tasks.map((task) =>
          this.toCsoTaskView(
            task,
            stagesByProject[task.projectId] ?? [],
            customerNameByProjectId.get(task.projectId),
          ),
        );
      }),
    );
  }

  private toCsoTaskView(
    task: BackendTaskSummary,
    stages: WorkflowStageRef[],
    customerName: string | undefined,
  ): CsoTaskView {
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((stage) => stage.id === task.workflowStageId);

    let statusLabel: CsoTaskView['statusLabel'] = 'todo';
    if (sorted.length > 0) {
      if (index === 0) statusLabel = 'new';
      else if (index === sorted.length - 1) statusLabel = 'done';
      else if (index === 1) statusLabel = 'todo';
      else statusLabel = 'inprogress';
    }

    return {
      id: task.id,
      title: task.title,
      priority: task.priority?.name ?? '',
      priorityColor: task.priority?.color ?? null,
      statusLabel,
      workflowStageName: task.workflowStage.name,
      assignee: task.assignees.map((a) => a.name).join(', ') || undefined,
      dueDate: task.dueDate ?? '',
      projectId: task.projectId,
      projectName: task.project.name,
      customerName,
    };
  }
}
