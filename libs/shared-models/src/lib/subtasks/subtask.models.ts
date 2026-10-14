import { UserSummary } from '../users/user-summary.model';

/** Fixed Subtask lifecycle — deliberately smaller than TaskStatus/CaseStatus
 * since a Subtask is the leaf of the hierarchy. */
export type SubtaskStatus = 'TO_DO' | 'IN_PROGRESS' | 'DONE';

/** Subtask is deliberately lean — no priority, sprint, milestone, CSO
 * labeling, category, dependencies, comments, or attachments; those stay
 * meaningful only at Case/Task granularity. */
export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: SubtaskStatus;
  dueDate: string | null;
  jiraStatusLabel: string | null;
  subtaskTypeId: string | null;
  subtaskType: { id: string; name: string } | null;
  assignees: Pick<UserSummary, 'id' | 'name' | 'email'>[];
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubtaskRequest {
  title: string;
  description?: string;
  status?: SubtaskStatus;
  dueDate?: string;
  assigneeIds?: string[];
  jiraStatusLabel?: string;
  subtaskTypeId?: string;
}

/** Nullable fields may be sent as `null` to clear them. */
export type UpdateSubtaskRequest = Partial<
  Omit<CreateSubtaskRequest, 'description' | 'dueDate' | 'subtaskTypeId'>
> & {
  description?: string | null;
  dueDate?: string | null;
  subtaskTypeId?: string | null;
};

export interface AssignSubtaskRequest {
  assigneeIds: string[];
}
