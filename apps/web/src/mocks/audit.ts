import type { AuditActionType, AuditEntityType, AuditLog, User } from '@sdp/contracts';
import { db } from './db.ts';

export interface MockAuditInput {
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string | null;
  description: string;
  oldValue?: AuditLog['oldValue'];
  newValue?: AuditLog['newValue'];
  taskId?: string | null;
  targetUserId?: string | null;
  metadata?: AuditLog['metadata'];
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
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    taskId: input.taskId ?? null,
    targetUserId: input.targetUserId ?? null,
    metadata: input.metadata ?? null,
  };
  db.auditLogs.push(record);
  return record;
}
