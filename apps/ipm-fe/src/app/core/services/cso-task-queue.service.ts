import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { ProjectSummary, TaskCategory, TaskStatus, TaskSummary } from '@sebsa-pm-tool/shared-models';

export interface CsoTaskQueueFilters {
  projectId?: string;
  customerId?: string;
  priorityId?: string;
  /** Which queue — Functional or Technical. Required: this is what routes
   *  a task into a queue in the first place. */
  category: TaskCategory;
}

export interface CsoQueueTaskView {
  id: string;
  title: string;
  priority: string;
  priorityColor: string | null;
  /** Bucketed from the fixed, global TaskStatus enum. */
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  taskTypeName: string | null;
  complexityName: string | null;
  complexityColor: string | null;
  dueDate: string;
  caseId: string;
  caseTitle: string;
  projectId: string;
  projectName: string;
  customerName?: string;
}

function bucketStatus(status: TaskStatus): CsoQueueTaskView['statusLabel'] {
  switch (status) {
    case 'TO_DO':
      return 'new';
    case 'IN_PROGRESS':
    case 'IN_REVIEW':
    case 'BLOCKED':
      return 'inprogress';
    case 'DONE':
    case 'CANCELLED':
      return 'done';
    default:
      return 'todo';
  }
}

/** Backs the CSO Functional/Technical Queue tabs — unlike CsoOverviewService
 *  (which stays Case-based, feeding Overview/Dashboard/KPI), this queries
 *  Tasks directly: a task's own `category` tag is what routes it into a
 *  queue, independent of its parent Case's category. A queue is unclaimed
 *  work only — `unassigned=true` is always sent, so a task drops out the
 *  moment someone is assigned to it (it then surfaces in their own
 *  Assigned Tasks list instead). */
@Injectable({ providedIn: 'root' })
export class CsoTaskQueueService {
  private readonly http = inject(HttpClient);

  private readonly _tasks = signal<CsoQueueTaskView[]>([]);
  readonly tasks = this._tasks.asReadonly();

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  load(filters: CsoTaskQueueFilters): void {
    this._isLoading.set(true);

    let params = new HttpParams()
      .set('isCsoLabeled', 'true')
      .set('unassigned', 'true')
      .set('category', filters.category);
    if (filters.projectId) params = params.set('projectId', filters.projectId);
    if (filters.customerId) params = params.set('customerId', filters.customerId);
    if (filters.priorityId) params = params.set('priorityId', filters.priorityId);

    this.http
      .get<TaskSummary[]>('/api/tasks', { params })
      .pipe(switchMap((tasks) => this.resolveDetails(tasks)))
      .subscribe({
        next: (views) => {
          this._tasks.set(views);
          this._isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load CSO tasks:', err);
          this._tasks.set([]);
          this._isLoading.set(false);
        },
      });
  }

  /** customerName isn't present on the flat tasks response, so resolve it
   *  via one /api/projects call, same trick CsoOverviewService uses. */
  private resolveDetails(tasks: TaskSummary[]): Observable<CsoQueueTaskView[]> {
    if (tasks.length === 0) return of([]);

    return this.http.get<ProjectSummary[]>('/api/projects').pipe(
      catchError(() => of([])),
      map((projects) => {
        const projectById = new Map(projects.map((project) => [project.id, project]));
        return tasks.map((task) => this.toQueueTaskView(task, projectById.get(task.case.projectId)));
      }),
    );
  }

  private toQueueTaskView(task: TaskSummary, project: ProjectSummary | undefined): CsoQueueTaskView {
    return {
      id: task.id,
      title: task.title,
      priority: task.priority?.name ?? '',
      priorityColor: task.priority?.color ?? null,
      statusLabel: bucketStatus(task.status),
      taskTypeName: task.taskType?.name ?? null,
      complexityName: task.complexityLevel?.name ?? null,
      complexityColor: task.complexityLevel?.color ?? null,
      dueDate: task.dueDate ?? '',
      caseId: task.caseId,
      caseTitle: task.case?.title ?? '',
      projectId: task.case.projectId,
      projectName: project?.name ?? '',
      customerName: project?.customer?.name,
    };
  }
}
