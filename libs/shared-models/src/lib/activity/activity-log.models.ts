/** Mirrors the Prisma `EntityType` enum (prisma/schema.prisma) for use outside the backend. */
export type ActivityEntityType =
  | 'PROJECT'
  | 'CASE'
  | 'TASK'
  | 'SUBTASK'
  | 'COMMENT'
  | 'SPRINT'
  | 'MILESTONE'
  | 'USER'
  | 'PROJECT_MEMBER';

/** Mirrors the Prisma `ActivityAction` enum (prisma/schema.prisma) for use outside the backend. */
export type ActivityAction =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'DELETED'
  | 'RESTORED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'COMMENTED'
  | 'ATTACHMENT_ADDED'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'SPRINT_STARTED'
  | 'SPRINT_COMPLETED'
  | 'MILESTONE_REACHED';

/** Null when the acting user has since been hard-deleted (ActivityLog.actorId is SetNull). */
export interface ActivityLogActor {
  id: string;
  name: string;
  email: string;
}

/** A single before/after pair captured on an UPDATED or STATUS_CHANGED entry. */
export interface ActivityFieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface ActivityLogMetadata {
  changes?: ActivityFieldChange[];
  [key: string]: unknown;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  /** Human-readable label for the entity as it stood when the entry was written. */
  entityLabel: string | null;
  action: ActivityAction;
  description: string;
  metadata: ActivityLogMetadata | null;
  actor: ActivityLogActor | null;
  createdAt: string;
}

export interface ActivityLogPage {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Distinct values present in the log, so the audit screen can populate its
 * filter dropdowns without the client hard-coding (or guessing) them. */
export interface AuditLogFilterOptions {
  actors: ActivityLogActor[];
  projects: Array<{ id: string; name: string }>;
  entityTypes: ActivityEntityType[];
  actions: ActivityAction[];
}
