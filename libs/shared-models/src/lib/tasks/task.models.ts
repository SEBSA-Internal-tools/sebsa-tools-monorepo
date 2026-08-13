import { UserSummary } from '../users/user-summary.model';

export type TaskType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT' | 'TEST' | 'SUBTASK';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskDependencyType = 'BLOCKS' | 'RELATES_TO' | 'DUPLICATE_OF';

export interface TaskLabelSummary {
  id: string;
  name: string;
  color: string | null;
}

/** List-view shape — returned by GET /tasks, /tasks/my-assigned, and
 * subtask lists. Fields only the detail fetch (GET /tasks/:id) populates
 * are optional here; `Task` below re-declares them as required. */
export interface TaskSummary {
  id: string;
  projectId: string;
  parentTaskId?: string | null;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  workflowStageId: string;
  sprintId: string | null;
  dueDate: string | null;
  description: string | null;
  isCsoLabeled: boolean;
  project: { id: string; name: string };
  workflowStage: { id: string; name: string };
  assignees: Pick<UserSummary, 'id' | 'name' | 'email'>[];
  milestoneId?: string | null;
  startDate?: string | null;
  storyPoints?: number | null;
  createdBy?: Pick<UserSummary, 'id' | 'name'>;
  labels?: TaskLabelSummary[];
  subtaskCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskListSummary {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  workflowStageId: string;
  priority: TaskPriority;
  dueDate: string | null;
  assignee: Pick<UserSummary, 'id' | 'name' | 'email'> | null;
}

/** Detail-view shape — includes the subtask list. */
export interface Task extends TaskSummary {
  parentTaskId: string | null;
  milestoneId: string | null;
  startDate: string | null;
  storyPoints: number | null;
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  labels: TaskLabelSummary[];
  subtaskCount: number;
  createdAt: string;
  updatedAt: string;
  subtasks: Pick<TaskSummary, 'id' | 'title' | 'workflowStageId'>[];
}

export interface CreateTaskRequest {
  projectId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  /** Omit to fall back to the project's default Backlog stage. */
  workflowStageId?: string;
  sprintId?: string;
  milestoneId?: string;
  startDate?: string;
  dueDate?: string;
  storyPoints?: number;
  reminderLeadMinutes?: number;
  assigneeIds?: string[];
  labelIds?: string[];
  isCsoLabeled?: boolean;
}

export type UpdateTaskRequest = Partial<Omit<CreateTaskRequest, 'projectId'>>;

/** Update returns dependency-enforcement warnings alongside the task rather
 * than throwing — hard-blocking an unmet-dependency transition is only a
 * Should Have per the FSD, the warning itself is Must Have. */
export interface UpdateTaskResponse {
  task: Task;
  warnings: string[];
}

export interface AssignTaskRequest {
  assigneeIds: string[];
}

export interface TaskLabelsRequest {
  labelIds: string[];
}

export interface CreateTaskDependencyRequest {
  targetTaskId: string;
  type: TaskDependencyType;
}

export interface TaskDependencyTaskRef {
  id: string;
  title: string;
  workflowStageId: string;
}

/** BLOCKED_BY is derived (reverse of another task's BLOCKS row targeting
 * this one), not a storable dependency type — see schema.prisma's
 * TaskDependency comment. */
export interface TaskDependenciesView {
  blocks: TaskDependencyTaskRef[];
  relatesTo: TaskDependencyTaskRef[];
  duplicateOf: TaskDependencyTaskRef[];
  blockedBy: TaskDependencyTaskRef[];
}
