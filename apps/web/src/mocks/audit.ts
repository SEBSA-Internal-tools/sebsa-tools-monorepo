import type { AuditActionType, AuditEntityType, AuditLog, User } from '@sdp/contracts';
import { db } from './db.ts';

export interface MockAuditInput {
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string | null;
  description: string;
  /** Any serialisable snapshot; normalised to plain JSON as the API would store it. */
  oldValue?: unknown;
  newValue?: unknown;
  taskId?: string | null;
  targetUserId?: string | null;
  metadata?: AuditLog['metadata'];
}

/** Round-trips through JSON so optional `undefined` fields disappear, as on the wire. */
function toJson(value: unknown): AuditLog['newValue'] {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as AuditLog['newValue']);
}

export function recordMockAudit(actor: User, input: MockAuditInput): AuditLog {
  const record: AuditLog = {
    id: `audit-${String(Date.now())}-${String(db.auditLogs.length + 1)}`,
    timestamp: new Date().toISOString(),
    actorUserId: actor.id,
    actorName: actor.name,
    actorRole: actor.roles.join(', '),
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description,
    oldValue: toJson(input.oldValue),
    newValue: toJson(input.newValue),
    taskId: input.taskId ?? null,
    targetUserId: input.targetUserId ?? null,
    metadata: input.metadata ?? null,
  };
  db.auditLogs.push(record);
  return record;
}
