import { UserSummary } from '../users/user-summary.model';

export type TaskDependencyType = 'BLOCKS' | 'RELATES_TO' | 'DUPLICATE_OF';

/** Fixed Task lifecycle. Replaces the old per-project, admin-configurable
 * WorkflowStage model with a single well-known list shared by every project. */
export type TaskStatus = 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE' | 'CANCELLED';

export interface TaskLabelSummary {
  id: string;
  name: string;
  color: string | null;
}

/** List-view shape — returned by GET /tasks, /tasks/my-assigned, and
 * within a Case's task list. Fields only the detail fetch (GET /tasks/:id)
 * populates are optional here; `Task` below re-declares them as required. */
export interface TaskSummary {
  id: string;
  caseId: string;
  title: string;
  status: TaskStatus;
  priorityId: string;
  dueDate: string | null;
  description: string | null;
  jiraStatusLabel: string | null;
  case: { id: string; title: string; type: string; projectId: string };
  priority: { id: string; name: string; color: string | null };
  assignees: Pick<UserSummary, 'id' | 'name' | 'email'>[];
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
  status: TaskStatus;
  priorityId: string;
  priority: { id: string; name: string; color: string | null };
  dueDate: string | null;
  assignee: Pick<UserSummary, 'id' | 'name' | 'email'> | null;
}

/** Detail-view shape — includes the subtask list. */
export interface Task extends TaskSummary {
  reminderLeadMinutes: number | null;
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  labels: TaskLabelSummary[];
  subtaskCount: number;
  createdAt: string;
  updatedAt: string;
  subtasks: { id: string; title: string; status: string }[];
}

export interface CreateTaskRequest {
  caseId: string;
  title: string;
  description?: string;
  priorityId?: string;
  status?: TaskStatus;
  startDate?: string;
  dueDate?: string;
  storyPoints?: number;
  reminderLeadMinutes?: number;
  assigneeIds?: string[];
  labelIds?: string[];
  jiraStatusLabel?: string;
}

export type UpdateTaskRequest = Partial<Omit<CreateTaskRequest, 'caseId'>>;

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
  status: TaskStatus;
  /** The TaskDependency row's own id — needed to call DELETE
   *  /tasks/:id/dependencies/:dependencyId. Only removable from the
   *  dependency's source task, so `blockedBy` entries carry it too but the
   *  UI shouldn't offer a remove action there (this task is the target). */
  dependencyId: string;
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

export interface TaskStatusHistoryEntry {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedAt: string;
  changedBy: { id: string; name: string };
}
