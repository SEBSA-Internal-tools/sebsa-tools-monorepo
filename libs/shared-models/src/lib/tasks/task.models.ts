import { UserSummary } from '../users/user-summary.model';

export type TaskType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'IMPROVEMENT' | 'TEST' | 'SUBTASK';
export type TaskDependencyType = 'BLOCKS' | 'RELATES_TO' | 'DUPLICATE_OF';
/** Functional/Technical classification tag — nullable on ordinary project
 * tasks, required whenever isCsoLabeled is true (enforced server-side). */
export type TaskCategory = 'FUNCTIONAL' | 'TECHNICAL';

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
  priorityId: string;
  workflowStageId: string;
  sprintId: string | null;
  dueDate: string | null;
  description: string | null;
  isCsoLabeled: boolean;
  category: TaskCategory | null;
  project: { id: string; name: string };
  workflowStage: { id: string; name: string };
  priority: { id: string; name: string; color: string | null };
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
  priorityId: string;
  priority: { id: string; name: string; color: string | null };
  dueDate: string | null;
  category: TaskCategory | null;
  assignee: Pick<UserSummary, 'id' | 'name' | 'email'> | null;
}

/** Detail-view shape — includes the subtask list. */
export interface Task extends TaskSummary {
  parentTaskId: string | null;
  parentTask: { id: string; title: string } | null;
  /** Full ancestor chain from the top-level task down to (not including) this
   *  task itself — e.g. [GrandparentTask, ParentTask] — for breadcrumb display. */
  ancestors: { id: string; title: string }[];
  milestoneId: string | null;
  startDate: string | null;
  storyPoints: number | null;
  reminderLeadMinutes: number | null;
  sprint: { id: string; name: string } | null;
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
  priorityId?: string;
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
  /** Required when isCsoLabeled is true. */
  category?: TaskCategory;
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
  fromStage: { id: string; name: string } | null;
  toStage: { id: string; name: string };
  changedAt: string;
  changedBy: { id: string; name: string };
}

/** One entry in a task's Functional/Technical assignment history — see
 * TaskCategoryAssignment in schema.prisma. Rendered on the task detail page
 * as e.g. "Functional Assigned - Alice", then "Technical Assigned - Bob"
 * once the task is converted, so the earlier assignment is never lost. */
export interface TaskCategoryAssignmentEntry {
  id: string;
  category: TaskCategory;
  assignee: { id: string; name: string } | null;
  changedAt: string;
  changedBy: { id: string; name: string };
}
