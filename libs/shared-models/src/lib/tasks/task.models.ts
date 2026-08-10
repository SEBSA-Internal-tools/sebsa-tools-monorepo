import { UserSummary } from '../users/user-summary.model';

export type TaskType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT' | 'TEST' | 'SUBTASK';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskDependencyType = 'BLOCKS' | 'RELATES_TO' | 'DUPLICATE_OF';

export interface TaskLabelSummary {
  id: string;
  name: string;
  color: string | null;
}

export interface TaskSummary {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  workflowStageId: string;
  sprintId: string | null;
  milestoneId: string | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  assignees: Pick<UserSummary, 'id' | 'name' | 'email'>[];
  labels: TaskLabelSummary[];
  subtaskCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Detail-view shape — includes description and the subtask list. */
export interface Task extends TaskSummary {
  description: string | null;
  subtasks: Pick<TaskSummary, 'id' | 'title' | 'workflowStageId'>[];
}

export interface CreateTaskRequest {
  projectId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  workflowStageId: string;
  sprintId?: string;
  milestoneId?: string;
  startDate?: string;
  dueDate?: string;
  storyPoints?: number;
  reminderLeadMinutes?: number;
  assigneeIds?: string[];
  labelIds?: string[];
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
