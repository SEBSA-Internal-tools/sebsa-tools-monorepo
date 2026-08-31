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
}

export type UpdateSubtaskRequest = Partial<CreateSubtaskRequest>;

export interface AssignSubtaskRequest {
  assigneeIds: string[];
}
