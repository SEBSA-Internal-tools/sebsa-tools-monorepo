import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import {
  CreateTaskDependencyRequest,
  CreateTaskRequest,
  Task as BackendTask,
  TaskCategory,
  TaskCategoryAssignmentEntry,
  TaskDependenciesView,
  TaskStatusHistoryEntry,
  TaskSummary as BackendTaskSummary,
  TaskListSummary as BackendTaskListSummary,
  UpdateTaskRequest,
  UpdateTaskResponse,
} from '@sebsa-pm-tool/shared-models';

export interface WorkflowStage {
  id: string;
  name: string;
  order: number;
}

export interface TaskView {
  id: string;
  title: string;
  parentTaskId?: string | null;
  category: string;
  /** Functional/Technical classification tag — distinct from `category`
   *  above (which is actually the task *type* label, e.g. "Bug"). Null for
   *  ordinary tasks that were never tagged. */
  tag: TaskCategory | null;
  /** Raw workflowStageId UUID — used for Kanban column mapping and PATCH requests. */
  status: string;
  description?: string;
  /** Human-readable positional label derived from stage order: 'new' | 'todo' | 'inprogress' | 'done'.
   *  Used by Overview, TaskList, and Sprint views for badge display and stats. */
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  priority: 'High' | 'Medium' | 'Low';
  duration: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
  sprintId?: string;
  workflowStageId: string;
  isCsoLabeled: boolean;
}

export interface TaskListView {
  id: string;
  title: string;
  description: string;
  category: string;
  tag: TaskCategory | null;
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  priority: 'High' | 'Medium' | 'Low';
  duration: string;
  assignee?: string;
  dueDate: string;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);

  // ─────────────────────────────────────────────────────────────────────────
  // Core reactive state: a Signal<TaskView[]> so all consumers (including
  // OnPush components) react automatically without markForCheck().
  // The BehaviorSubject is kept for RxJS-based consumers (tasks$).
  // ─────────────────────────────────────────────────────────────────────────
  private readonly _tasks = signal<TaskView[]>([]);

  /** Signal — preferred for OnPush components and computed() derivations. */
  readonly tasks = this._tasks.asReadonly();

  /** Observable — kept for legacy RxJS consumers (other views, subscriptions). */
  readonly tasks$: Observable<TaskView[]>;

  private readonly _tasksSubject = new BehaviorSubject<TaskView[]>([]);

  private currentProjectId?: string;
  private currentWorkflowStages: WorkflowStage[] = [];

  constructor() {
    this.tasks$ = this._tasksSubject.asObservable();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Push a new task list atomically to both the signal and the RxJS subject. */
  private setState(tasks: TaskView[]): void {
    this._tasks.set(tasks);
    this._tasksSubject.next(tasks);
  }

  get currentTasks(): TaskView[] {
    return this._tasks();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  loadTasks(projectId: string, workflowStages: WorkflowStage[]): void {
    this.currentProjectId = projectId;
    this.currentWorkflowStages = [...workflowStages].sort((a, b) => a.order - b.order);

    const params = new HttpParams().set('projectId', projectId);
    this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(
        map((tasks) => tasks.map((task) => this.toTaskView(task, this.currentWorkflowStages))),
      )
      .subscribe({ next: (tasks) => this.setState(tasks) });
  }

  /**
   * POST a new task to the API. On success, appends the mapped TaskView to
   * the reactive state so every subscriber (Kanban, TaskList, Overview) sees
   * it immediately — no page reload required.
   */
  createTask(dto: CreateTaskRequest, workflowStages: WorkflowStage[]): Observable<TaskView> {
    const sortedStages = [...workflowStages].sort((a, b) => a.order - b.order);
    return this.http.post<BackendTask>('/api/tasks', dto).pipe(
      map((task) => this.toTaskView(task, sortedStages)),
      tap((newTask) => {
        if (dto.projectId === this.currentProjectId) {
          // Immutable append — new array reference triggers signal consumers & BehaviorSubject.
          this.setState([...this._tasks(), newTask]);
        }
      }),
    );
  }

  /**
   * PATCH an existing task. On success, replaces the task in reactive state
   * with an immutable map — new array reference triggers change detection.
   */
  updateTask(taskId: string, dto: UpdateTaskRequest, workflowStages: WorkflowStage[]): Observable<TaskView> {
    const sortedStages = [...workflowStages].sort((a, b) => a.order - b.order);
    return this.http.patch<BackendTask>(`/api/tasks/${taskId}`, dto).pipe(
      map((task) => this.toTaskView(task, sortedStages)),
      tap((updatedTask) => {
        if (updatedTask.projectId === this.currentProjectId) {
          // Immutable replace — new array reference triggers signal consumers & BehaviorSubject.
          this.setState(
            this._tasks().map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          );
        }
      }),
    );
  }

  /**
   * Moves a task to a new workflow stage. The `newWorkflowStageId` is the raw
   * UUID emitted by the Kanban drop handler (stage.id) — no label translation.
   */
  updateTaskStatus(
    taskId: string,
    newWorkflowStageId: string,
    workflowStages: WorkflowStage[],
  ): Observable<TaskView> {
    return this.updateTask(taskId, { workflowStageId: newWorkflowStageId }, workflowStages);
  }

  /**
   * Performs a LOCAL-ONLY optimistic stage move on the signal state without
   * hitting the network. Called by the Kanban component before firing the
   * PATCH request so the UI responds instantly. On network error the Kanban
   * calls this again with the original stageId to roll back.
   */
  patchTaskStageLocally(taskId: string, newStageId: string, workflowStages: WorkflowStage[]): void {
    const sortedStages = [...workflowStages].sort((a, b) => a.order - b.order);
    this.setState(
      this._tasks().map((t) => {
        if (t.id !== taskId) return t;
        // Produce a new task object with the updated stage fields.
        return {
          ...t,
          workflowStageId: newStageId,
          status: newStageId,
          statusLabel: this.getStatusForStageId(newStageId, sortedStages),
        };
      }),
    );
  }

  getSprintTasks(sprintId: string): TaskView[] {
    return this._tasks().filter((task) => task.sprintId === sprintId);
  }

  getMyAssignedTasks() {
    return this.http
      .get<BackendTaskSummary[]>('/api/tasks/my-assigned')
      .pipe(
        map((tasks) =>
          tasks.map((task) => this.toTaskView(task, [])),
        ),
      );
  }

  getTaskById(taskId: string): Observable<BackendTask> {
    return this.http.get<BackendTask>(`/api/tasks/${taskId}`);
  }

  /** Lightweight lookup for pickers (parent-task / dependency-target search)
   *  — reuses the existing filtered list endpoint, no new backend route. */
  searchTasksInProject(projectId: string, search?: string): Observable<BackendTaskSummary[]> {
    let params = new HttpParams().set('projectId', projectId);
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

  getCategoryHistory(taskId: string): Observable<TaskCategoryAssignmentEntry[]> {
    return this.http.get<TaskCategoryAssignmentEntry[]>(`/api/tasks/${taskId}/category-history`);
  }

  updateTaskDetails(taskId: string, dto: UpdateTaskRequest): Observable<UpdateTaskResponse> {
    return this.http.patch<UpdateTaskResponse>(`/api/tasks/${taskId}`, dto);
  }

  deleteTask(taskId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/tasks/${taskId}`).pipe(
      tap(() => {
        // Immutable filter — new array reference triggers signal consumers & BehaviorSubject,
        // so Kanban/list views drop the deleted task without a manual reload.
        this.setState(this._tasks().filter((t) => t.id !== taskId));
      }),
    );
  }

  getTasksByProject(projectId: string): TaskView[] {
    return this._tasks().filter((task) => task.projectId === projectId);
  }

  getTaskList(projectId: string): Observable<TaskListView[]> {
    const params = new HttpParams().set('projectId', projectId);
    return this.http
      .get<BackendTaskListSummary[]>('/api/tasks/list', { params })
      .pipe(
        map((tasks) =>
          tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description ?? '',
            category: task.type ?? 'Task',
            tag: task.category ?? null,
            statusLabel: this.getStatusForStageId(task.workflowStageId, this.currentWorkflowStages),
            priority: this.mapPriority(task.priority),
            duration: task.dueDate ? `${task.dueDate.slice(0, 10)}` : 'No due date',
            assignee: task.assignee?.name || undefined,
            dueDate: task.dueDate ?? '',
          }))
        )
      );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mappers
  // ─────────────────────────────────────────────────────────────────────────

  private toTaskView(task: BackendTask | BackendTaskSummary, workflowStages: WorkflowStage[]): TaskView {
    const assignee = task.assignees?.map((a) => a.name).join(', ') || undefined;
    const priority = this.mapPriority(task.priority);
    // statusLabel is the positional label for badge/stats display in Overview,
    // TaskList, and Sprint views. status (UUID) is what Kanban uses for routing.
    const statusLabel = this.getStatusForStageId(task.workflowStageId, workflowStages);

    return {
      id: task.id,
      title: task.title,
      parentTaskId: task.parentTaskId ?? null,
      category: task.type ?? 'Task',
      tag: task.category ?? null,
      // UUID — Kanban column routing matches on this directly.
      status: task.workflowStageId,
      statusLabel,
      priority,
      duration: task.dueDate ? `${task.dueDate.slice(0, 10)}` : 'No due date',
      assignee,
      dueDate: task.dueDate ?? '',
      projectId: task.projectId,
      sprintId: task.sprintId ?? undefined,
      workflowStageId: task.workflowStageId,
      isCsoLabeled: task.isCsoLabeled,
      description: task.description ?? '',
    };
  }

  private mapPriority(priority: BackendTask['priority']): TaskView['priority'] {
    switch (priority) {
      case 'CRITICAL':
      case 'HIGH':
        return 'High';
      case 'MEDIUM':
        return 'Medium';
      case 'LOW':
        return 'Low';
      default:
        return 'Medium';
    }
  }

  private getStatusForStageId(stageId: string, workflowStages: WorkflowStage[]): TaskView['statusLabel'] {
    const sorted = [...workflowStages].sort((a, b) => a.order - b.order);
    if (!sorted.length) return 'todo';

    const index = sorted.findIndex((stage) => stage.id === stageId);
    if (index === 0) return 'new';
    if (index === sorted.length - 1) return 'done';
    if (index === 1) return 'todo';
    return 'inprogress';
  }
}