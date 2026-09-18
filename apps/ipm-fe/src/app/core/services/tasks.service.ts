import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, tap, map, of, finalize, shareReplay } from 'rxjs';
import {
  CreateTaskDependencyRequest,
  CreateTaskRequest,
  Subtask,
  Task as BackendTask,
  TaskDependenciesView,
  TaskStatus,
  TaskStatusHistoryEntry,
  TaskSummary as BackendTaskSummary,
  TaskListSummary as BackendTaskListSummary,
  TaskCategory,
  UpdateTaskRequest,
  UpdateTaskResponse,
} from '@sebsa-pm-tool/shared-models';

/** Fixed, global lifecycle — replaces the old per-project WorkflowStage list. */
export const TASK_STATUSES: { id: TaskStatus; name: string }[] = [
  { id: 'TO_DO', name: 'To Do' },
  { id: 'IN_PROGRESS', name: 'In Progress' },
  { id: 'IN_REVIEW', name: 'In Review' },
  { id: 'BLOCKED', name: 'Blocked' },
  { id: 'DONE', name: 'Done' },
  { id: 'CANCELLED', name: 'Cancelled' },
];

export interface TaskView {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
  priority: string;
  priorityColor: string | null;
  duration: string;
  assignee?: string;
  assigneeIds?: string[];
  dueDate: string;
  startDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  caseId: string;
  caseTitle: string;
  caseType: string;
  projectId: string;
  projectName?: string;
  category?: TaskCategory | null;
  taskTypeName?: string;
  subtaskCount?: number;
  subtasks?: Subtask[];
  isCsoLabeled?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  private readonly _tasks = signal<TaskView[]>([]);
  readonly tasks = this._tasks.asReadonly();

  readonly tasks$: Observable<TaskView[]>;
  private readonly _tasksSubject = new BehaviorSubject<TaskView[]>([]);

  private currentCaseId?: string;
  private currentProjectId?: string;
  private readonly inFlightLoads = new Map<string, Observable<TaskView[]>>();

  constructor() {
    this.tasks$ = this._tasksSubject.asObservable();
  }

  private setState(tasks: TaskView[]): void {
    this._tasks.set(tasks);
    this._tasksSubject.next(tasks);
  }

  get currentTasks(): TaskView[] {
    return this._tasks();
  }

  loadTasksByCase(caseId: string): void {
    this.currentCaseId = caseId;
    const params = new HttpParams().set('caseId', caseId);
    this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(map((tasks) => tasks.map((task) => this.toTaskView(task))))
      .subscribe({ next: (tasks) => this.setState(tasks) });
  }

  loadTasksByProject(projectId: string, force = false): Observable<TaskView[]> {
    if (!force && this.currentProjectId === projectId && this._tasks().length > 0) {
      return of(this._tasks().filter((t) => t.projectId === projectId));
    }

    const cacheKey = `project_${projectId}`;
    const existing$ = this.inFlightLoads.get(cacheKey);
    if (existing$) {
      return existing$;
    }

    this.currentProjectId = projectId;
    const params = new HttpParams().set('projectId', projectId);
    const req$ = this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(
        map((tasks) => tasks.map((task) => this.toTaskView(task))),
        tap((tasks) => this.setState(tasks)),
        finalize(() => this.inFlightLoads.delete(cacheKey)),
        shareReplay(1)
      );

    this.inFlightLoads.set(cacheKey, req$);
    req$.subscribe({ error: (err) => console.error('Failed to load project tasks:', err) });
    return req$;
  }

  loadAllTasks(projectId?: string, force = false): Observable<TaskView[]> {
    const cacheKey = projectId ? `project_${projectId}` : '__ALL_TASKS__';
    const existing$ = this.inFlightLoads.get(cacheKey);
    if (!force && existing$) {
      return existing$;
    }

    let params = new HttpParams();
    if (projectId) {
      this.currentProjectId = projectId;
      params = params.set('projectId', projectId);
    } else {
      this.currentProjectId = undefined;
    }

    const req$ = this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(
        map((tasks) => tasks.map((task) => this.toTaskView(task))),
        tap((tasks) => this.setState(tasks)),
        finalize(() => this.inFlightLoads.delete(cacheKey)),
        shareReplay(1)
      );

    this.inFlightLoads.set(cacheKey, req$);
    return req$;
  }

  createTask(dto: CreateTaskRequest): Observable<TaskView> {
    return this.http.post<BackendTask>('/api/tasks', dto).pipe(
      map((task) => this.toTaskView(task)),
      tap((newTask) => {
        if (dto.caseId === this.currentCaseId || (this.currentProjectId && newTask.projectId === this.currentProjectId)) {
          this.setState([...this._tasks(), newTask]);
        }
      }),
    );
  }

  updateTask(taskId: string, dto: UpdateTaskRequest): Observable<UpdateTaskResponse> {
    return this.http.patch<UpdateTaskResponse>(`/api/tasks/${taskId}`, dto).pipe(
      tap((response) => {
        const updatedTask = this.toTaskView(response.task);
        if (updatedTask.caseId === this.currentCaseId || updatedTask.projectId === this.currentProjectId) {
          this.setState(this._tasks().map((t) => (t.id === updatedTask.id ? updatedTask : t)));
        }
      }),
    );
  }

  updateTaskStatus(taskId: string, status: TaskStatus): Observable<UpdateTaskResponse> {
    return this.updateTask(taskId, { status });
  }

  /**
   * Local-only optimistic status move — called by the Kanban component
   * before firing the PATCH request so the UI responds instantly. On
   * network error the caller re-invokes this with the original status.
   */
  patchTaskStatusLocally(taskId: string, newStatus: TaskStatus): void {
    this.setState(this._tasks().map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
  }

  getMyAssignedTasks() {
    return this.http
      .get<BackendTaskSummary[]>('/api/tasks/my-assigned')
      .pipe(map((tasks) => tasks.map((task) => this.toTaskView(task))));
  }

  getTaskById(taskId: string): Observable<BackendTask> {
    return this.http.get<BackendTask>(`/api/tasks/${taskId}`);
  }

  /** Lightweight lookup for pickers (dependency-target search) — reuses the
   *  existing filtered list endpoint, no new backend route. */
  searchTasksInCase(caseId: string, search?: string): Observable<BackendTaskSummary[]> {
    let params = new HttpParams().set('caseId', caseId);
    if (search) params = params.set('search', search);
    return this.http.get<BackendTaskSummary[]>('/api/tasks', { params });
  }

  getDependencies(taskId: string): Observable<TaskDependenciesView> {
    return this.http.get<TaskDependenciesView>(`/api/tasks/${taskId}/dependencies`);
  }

  createDependency(taskId: string, dto: CreateTaskDependencyRequest): Observable<void> {
    return this.http.post<void>(`/api/tasks/${taskId}/dependencies`, dto);
  }

  removeDependency(taskId: string, dependencyId: string): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${taskId}/dependencies/${dependencyId}`);
  }

  getStatusHistory(taskId: string): Observable<TaskStatusHistoryEntry[]> {
    return this.http.get<TaskStatusHistoryEntry[]>(`/api/tasks/${taskId}/status-history`);
  }

  updateTaskDetails(taskId: string, dto: UpdateTaskRequest): Observable<UpdateTaskResponse> {
    return this.http.patch<UpdateTaskResponse>(`/api/tasks/${taskId}`, dto).pipe(
      tap((response) => {
        const updatedView = this.toTaskView(response.task);
        if (updatedView.caseId === this.currentCaseId || updatedView.projectId === this.currentProjectId) {
          this.setState(
            this._tasks().map((t) => (t.id === updatedView.id ? updatedView : t))
          );
        }
      })
    );
  }

  deleteTask(taskId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/tasks/${taskId}`).pipe(
      tap(() => {
        this.setState(this._tasks().filter((t) => t.id !== taskId));
      }),
    );
  }

  getTasksByCase(caseId: string): TaskView[] {
    return this._tasks().filter((task) => task.caseId === caseId);
  }

  getTaskList(caseId: string): Observable<TaskView[]> {
    const params = new HttpParams().set('caseId', caseId);
    return this.http
      .get<BackendTaskListSummary[]>('/api/tasks/list', { params })
      .pipe(
        map((tasks) =>
          tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description ?? '',
            status: task.status,
            priority: this.mapPriority(task.priority),
            priorityColor: task.priority?.color ?? null,
            duration: task.dueDate ? `${task.dueDate.slice(0, 10)}` : 'No due date',
            assignee: task.assignee?.name || undefined,
            dueDate: task.dueDate ?? '',
            caseId,
            caseTitle: '',
            caseType: '',
            projectId: '',
          })),
        ),
      );
  }

  private toTaskView(task: BackendTask | BackendTaskSummary): TaskView {
    const assignee = task.assignees?.map((a) => a.name).join(', ') || undefined;
    const assigneeIds = task.assignees?.map((a) => a.id) || [];
    const projectName = 'project' in task.case && task.case.project ? task.case.project.name : undefined;
    const subtasks =
      'subtasks' in task && Array.isArray(task.subtasks)
        ? (task.subtasks as unknown as Subtask[])
        : undefined;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      description: task.description ?? '',
      priority: this.mapPriority(task.priority),
      priorityColor: task.priority?.color ?? null,
      duration: task.dueDate ? `${task.dueDate.slice(0, 10)}` : 'No due date',
      assignee,
      assigneeIds,
      dueDate: task.dueDate ?? '',
      startDate: task.startDate ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      caseId: task.caseId,
      caseTitle: task.case.title,
      caseType: task.case.type,
      projectId: task.case.projectId,
      projectName,
      category: task.category,
      taskTypeName: task.taskType?.name,
      subtaskCount: task.subtaskCount,
      subtasks,
      isCsoLabeled: task.case.isCsoLabeled,
    };
  }

  private mapPriority(priority?: { id: string; name: string; color: string | null } | string): string {
    const priorityName = typeof priority === 'string' ? priority : priority?.name;
    return priorityName || 'Medium';
  }
}
