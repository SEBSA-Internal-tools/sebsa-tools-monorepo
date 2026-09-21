import { UserSummary } from '../users/user-summary.model';
import { TaskLabelSummary } from '../tasks/task.models';

/** Epic/Story/Bug/Improvement/Test classification a Case carries — this used
 * to be Task.type before Task/Subtask were split out underneath Case
 * (Customer -> Project -> Case -> Task -> Subtask). GENERAL is used both for
 * auto-migrated placeholder containers and for teams that don't want to
 * categorize a Case as one of the other five. */
export type CaseType = 'EPIC' | 'STORY' | 'BUG' | 'IMPROVEMENT' | 'TEST' | 'GENERAL';

/** Fixed Case lifecycle — not customizable per project (see TaskStatus in
 * task.models.ts for the equivalent at the Task level). */
export type CaseStatus = 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE' | 'CANCELLED';

/** Functional/Technical classification tag — nullable on ordinary cases,
 * required whenever isCsoLabeled is true (enforced server-side). Lives on
 * Case (not Task) now, alongside CSO labeling. */
export type CaseCategory = 'FUNCTIONAL' | 'TECHNICAL';
/** Alias kept for the many existing frontend call sites written against the
 * pre-split name (the concept moved from Task to Case, the name didn't). */
export type TaskCategory = CaseCategory;

/** List-view shape — returned by GET /cases. */
export interface CaseSummary {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  type: CaseType;
  status: CaseStatus;
  priorityId: string;
  sprintId: string | null;
  milestoneId: string | null;
  dueDate: string | null;
  isCsoLabeled: boolean;
  category: CaseCategory | null;
  jiraStatusLabel: string | null;
  project: { id: string; name: string; isCsoProject: boolean };
  priority: { id: string; name: string; color: string | null };
  assignees: Pick<UserSummary, 'id' | 'name' | 'email'>[];
  startDate?: string | null;
  storyPoints?: number | null;
  createdBy?: Pick<UserSummary, 'id' | 'name'>;
  labels?: TaskLabelSummary[];
  taskCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Detail-view shape. */
export interface Case extends CaseSummary {
  /** Set when a Jira issue is linked to this case. Read-only here — the
   * integration is one-way, so nothing written in this app reaches Jira. */
  jiraIssueKey: string | null;
  /** The linked issue's status name, shown beside our own status because a
   * Jira workflow rarely lines up with ours. */
  jiraDescription: string | null;
  /** When the last change was pulled from Jira. */
  jiraSyncedAt: string | null;
  startDate: string | null;
  storyPoints: number | null;
  sprint: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  labels: TaskLabelSummary[];
  taskCount: number;
  createdAt: string;
  updatedAt: string;
  tasks: { id: string; title: string; status: string }[];
}

export interface CreateCaseRequest {
  projectId: string;
  title: string;
  description?: string;
  type: CaseType;
  status?: CaseStatus;
  priorityId?: string;
  sprintId?: string;
  milestoneId?: string;
  startDate?: string;
  dueDate?: string;
  storyPoints?: number;
  assigneeIds?: string[];
  labelIds?: string[];
  isCsoLabeled?: boolean;
  /** Required when isCsoLabeled is true. */
  category?: CaseCategory;
  jiraStatusLabel?: string;
}

export type UpdateCaseRequest = Partial<Omit<CreateCaseRequest, 'projectId'>>;

export interface AssignCaseRequest {
  assigneeIds: string[];
}

export interface CaseLabelsRequest {
  labelIds: string[];
}

export interface CaseStatusHistoryEntry {
  id: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  changedAt: string;
  changedBy: { id: string; name: string };
}

/** One entry in a case's Functional/Technical assignment history — see
 * CaseCategoryAssignment in schema.prisma. Rendered as e.g. "Functional
 * Assigned - Alice", then "Technical Assigned - Bob" once converted, so the
 * earlier assignment is never lost. */
export interface CaseCategoryAssignmentEntry {
  id: string;
  category: CaseCategory;
  assignee: { id: string; name: string } | null;
  changedAt: string;
  changedBy: { id: string; name: string };
}
