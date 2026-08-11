import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, map, tap } from 'rxjs';
import {
  CreateTaskRequest,
  Task as BackendTask,
  TaskSummary as BackendTaskSummary,
  UpdateTaskRequest,
  UpdateTaskResponse,
} from '@sebsa-pm-tool/shared-models';

export interface WorkflowStage {
  id: string;
  name: string;
  order: number;
}

type KanbanStatus = 'new' | 'todo' | 'inprogress' | 'done';

export interface TaskView {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: 'High' | 'Medium' | 'Low';
  duration: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
  sprintId?: string;
  workflowStageId: string;
}

@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly http = inject(HttpClient);
  private readonly tasksSubject = new BehaviorSubject<TaskView[]>([]);
  readonly tasks$ = this.tasksSubject.asObservable();

  private currentProjectId?: string;
  private currentWorkflowStages: WorkflowStage[] = [];

  get currentTasks(): TaskView[] {
    return this.tasksSubject.value;
  }

  loadTasks(projectId: string, workflowStages: WorkflowStage[]): void {
    this.currentProjectId = projectId;
    this.currentWorkflowStages = [...workflowStages].sort((a, b) => a.order - b.order);

    const params = new HttpParams().set('projectId', projectId);
    this.http
      .get<BackendTaskSummary[]>('/api/tasks', { params })
      .pipe(
        map((tasks) => tasks.map((task) => this.toTaskView(task, this.currentWorkflowStages))),
      )
      .subscribe({ next: (tasks) => this.tasksSubject.next(tasks) });
  }

  createTask(dto: CreateTaskRequest, workflowStages: WorkflowStage[]) {
    const sortedStages = [...workflowStages].sort((a, b) => a.order - b.order);
    return this.http.post<BackendTask>('/api/tasks', dto).pipe(
      map((task) => this.toTaskView(task, sortedStages)),
      tap((task) => {
        if (dto.projectId === this.currentProjectId) {
          this.tasksSubject.next([...this.tasksSubject.value, task]);
        }
      }),
    );
  }

  updateTask(taskId: string, dto: UpdateTaskRequest, workflowStages: WorkflowStage[]) {
    const sortedStages = [...workflowStages].sort((a, b) => a.order - b.order);
    return this.http.patch<BackendTask>(`/api/tasks/${taskId}`, dto).pipe(
      map((task) => this.toTaskView(task, sortedStages)),
      tap((task) => {
        if (task.projectId === this.currentProjectId) {
          this.tasksSubject.next(
            this.tasksSubject.value.map((existingTask) =>
              existingTask.id === task.id ? task : existingTask,
            ),
          );
        }
      }),
    );
  }

    updateTaskStatus(
    taskId: string,
    status: KanbanStatus,
    workflowStages: WorkflowStage[],
    ) {
    const workflowStageId = this.getStageIdForStatus(
        status,
        workflowStages,
    );

    if (!workflowStageId) {
        throw new Error(`No workflow stage found for status: ${status}`);
    }

    const sortedStages = [...workflowStages].sort(
        (a, b) => a.order - b.order,
    );

    return this.http
        .patch<BackendTask>(
        `/api/tasks/${taskId}`,
        {
            workflowStageId,
        },
        )
        .pipe(
        map((task) => this.toTaskView(task, sortedStages)),
        tap((updatedTask) => {
            if (updatedTask.projectId === this.currentProjectId) {
            this.tasksSubject.next(
                this.tasksSubject.value.map((task) =>
                task.id === taskId
                    ? {
                        ...updatedTask,
                        status,
                    }
                    : task,
                ),
            );
            }
        }),
        );
    }

  getSprintTasks(sprintId: string): TaskView[] {
    return this.tasksSubject.value.filter((task) => task.sprintId === sprintId);
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

  updateTaskDetails(taskId: string, dto: UpdateTaskRequest): Observable<UpdateTaskResponse> {
    return this.http.patch<UpdateTaskResponse>(`/api/tasks/${taskId}`, dto);
  }

  getTasksByProject(projectId: string): TaskView[] {
    return this.tasksSubject.value.filter((task) => task.projectId === projectId);
  }

  private toTaskView(task: BackendTask | BackendTaskSummary, workflowStages: WorkflowStage[]): TaskView {
    const assignee = task.assignees?.map((a) => a.name).join(', ') || undefined;
    const stageStatus = this.getStatusForStageId(task.workflowStageId, workflowStages);
    const priority = this.mapPriority(task.priority);

    return {
      id: task.id,
      title: task.title,
      category: task.type ?? 'Task',
      status: stageStatus,
      priority,
      duration: task.dueDate ? `${task.dueDate.slice(0, 10)}` : 'No due date',
      assignee,
      dueDate: task.dueDate ?? '',
      projectId: task.projectId,
      sprintId: task.sprintId ?? undefined,
      workflowStageId: task.workflowStageId,
    };
  }

  private mapPriority(priority: BackendTask['priority']): TaskView['priority'] {
    switch (priority) {
      case 'CRITICAL':
        return 'High';
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

  private getStatusForStageId(stageId: string, workflowStages: WorkflowStage[]): TaskView['status'] {
    const sorted = [...workflowStages].sort((a, b) => a.order - b.order);
    if (!sorted.length) {
      return 'todo';
    }

    const index = sorted.findIndex((stage) => stage.id === stageId);
    if (index === 0) {
      return 'new';
    }
    if (index === sorted.length - 1) {
      return 'done';
    }
    if (index === 1) {
      return 'todo';
    }
    return 'inprogress';
  }

private getStageIdForStatus(
  status: TaskView['status'],
  workflowStages: WorkflowStage[],
): string | undefined {
  const sorted = [...workflowStages].sort(
    (a, b) => a.order - b.order,
  );

  switch (status) {
    case 'new':
      return sorted[0]?.id;

    case 'todo':
      return sorted[1]?.id;

    case 'inprogress':
      return sorted[2]?.id;

    case 'done':
      return sorted[3]?.id;

    default:
      return undefined;
  }
}
}