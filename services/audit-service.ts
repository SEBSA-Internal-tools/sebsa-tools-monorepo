import { employeeDetailFields } from '@/lib/employeeDetails';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UpdateEmployeeInput, Employee } from '@/types/domain';

// `audit_logs.action` is free text in Postgres (0011_audit_logs.sql) — this union is the
// application-side contract, so new event types are added here rather than in a migration.
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'DOWNLOAD'
  | 'APPROVE'
  | 'REJECT'
  // Account access lifecycle (app/(authenticated)/repository/actions.ts). Logged separately
  // from profile CRUD because granting and revoking sign-in access is an access-control event,
  // which the retention/privacy protocol tracks distinctly from profile edits.
  | 'ACCOUNT_INVITED'
  | 'ACCOUNT_INVITE_RESENT'
  | 'ACCOUNT_DEACTIVATED'
  | 'ACCOUNT_REACTIVATED'
  // Assessment module (services/assessment-admin-service.ts). The first three also appear on rows
  // imported from the old assessment tool, so history and new events read the same.
  | 'ASSESSMENT_CYCLE_SENT'
  | 'ASSESSMENT_CYCLE_DEACTIVATED'
  | 'ASSESSMENT_CYCLE_REACTIVATED'
  | 'ASSESSMENT_INVITATION_RESENT'
  | 'ASSESSMENT_REMINDERS_SENT'
  | 'ASSESSMENT_QUESTION_ADDED'
  | 'ASSESSMENT_QUESTION_UPDATED'
  | 'ASSESSMENT_QUESTION_DELETED';
export type AuditMetadata = Record<string, unknown>;

export interface AuditChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface AuditEvent {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: AuditMetadata;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: AuditMetadata;
  createdAt: string;
}

/** Reads all audit rows visible under the caller's existing RLS policy. */
export async function listAuditLogs(
  supabase: SupabaseClient,
  limit?: number
): Promise<AuditLogRecord[]> {
  let query = supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity_type, entity_id, metadata, created_at')
    .order('created_at', { ascending: false });
  if (limit != null) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id as string | null).filter((id): id is string => Boolean(id)))];
  const namesByUserId = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', actorIds);
    if (profileError) throw profileError;
    for (const profile of profiles ?? []) {
      if (profile.user_id && profile.full_name) namesByUserId.set(profile.user_id as string, profile.full_name as string);
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    actorId: row.actor_id as string | null,
    actorName: row.actor_id ? namesByUserId.get(row.actor_id as string) ?? 'Unknown User' : 'System',
    action: row.action as string,
    entityType: row.entity_type as string | null,
    entityId: row.entity_id as string | null,
    metadata: (row.metadata ?? {}) as AuditMetadata,
    createdAt: row.created_at as string,
  }));
}

/**
 * The single append-only audit writer for backend code. It deliberately uses the server-only
 * service client because authenticated users have no audit_logs INSERT/UPDATE/DELETE policies.
 * Call this only after the corresponding business operation succeeds.
 */
export async function recordAuditLog(event: AuditEvent): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient.from('audit_logs').insert({
    actor_id: event.actorId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    console.error('Failed to append audit log', { event, error: error.message });
    throw new Error('The operation succeeded, but its audit entry could not be recorded.');
  }
}

/** Returns top-level business fields whose submitted values differ from the current values. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

/** Builds JSON-safe, display-ready changes for the editable employee profile fields. */
export function profileChanges(current: Employee, proposed: UpdateEmployeeInput): AuditChange[] {
  const fields: Array<[string, unknown, unknown]> = [
    ['Full Name', current.name, proposed.name],
    ...employeeDetailFields.filter(f => proposed[f.key] !== undefined).map(f => [f.label, current[f.key] ?? '', proposed[f.key] ?? ''] as [string, unknown, unknown]),
    ['Role', current.currentPosition || current.role || '', proposed.currentPosition || proposed.role || ''],
    ['Department', current.department || '', proposed.department || ''],
    ['Summary', current.summary ?? '', proposed.summary ?? ''],
    ['Skills', current.skills ?? [], proposed.skills ?? []],
    ['Work Experience', current.cvExperience ?? [], proposed.cvExperience ?? []],
    ['Education', current.cvAcademic ?? [], proposed.cvAcademic ?? []],
    ['Special Projects', current.specialProjects ?? [], proposed.specialProjects ?? []],
    ['Certifications', current.cvCertifications ?? [], proposed.cvCertifications ?? []],
  ];

  // A submitted avatar URL means the photo was replaced. The old signed URL is intentionally
  // represented as presence/absence because it is temporary and unsuitable for durable audit data.
  if (proposed.avatarUrl) fields.push(['Photo', Boolean(current.avatar), true]);

  const normalizeText = (value: unknown) => String(value ?? '').trim();
  const normalizers: Record<string, (value: unknown) => unknown> = {
    Skills: (value) => ((value as unknown[] | undefined) ?? []).map(normalizeText),
    'Work Experience': (value) => ((value as Record<string, unknown>[] | undefined) ?? []).map((entry) => ({
      position: normalizeText(entry.position),
      company: normalizeText(entry.company),
      period: normalizeText(entry.period),
      tasks: ((entry.tasks as unknown[] | undefined) ?? []).map(normalizeText),
    })),
    Education: (value) => ((value as Record<string, unknown>[] | undefined) ?? []).map((entry) => ({
      qualification: normalizeText(entry.qualification),
      institution: normalizeText(entry.institution),
      period: normalizeText(entry.period),
    })),
    'Special Projects': (value) => ((value as Record<string, unknown>[] | undefined) ?? []).map((entry) => ({
      title: normalizeText(entry.title),
      brief: normalizeText(entry.brief),
      skills: ((entry.skills as unknown[] | undefined) ?? []).map(normalizeText),
    })),
    Certifications: (value) => ((value as Record<string, unknown>[] | undefined) ?? []).map((entry) => ({
      name: normalizeText(entry.name),
      issuer: normalizeText(entry.issuer),
      year: normalizeText(entry.year),
    })),
  };

  return fields
    // Database reads and form submissions can represent the same data differently (for example,
    // an omitted optional property versus an empty string). Compare canonical values, while
    // retaining the original old/new values in metadata for an accurate audit record.
    .filter(([field, before, after]) => {
      const normalize = normalizers[field];
      return JSON.stringify(normalize ? normalize(before) : before)
        !== JSON.stringify(normalize ? normalize(after) : after);
    })
    .map(([field, old_value, new_value]) => ({ field, old_value, new_value }));
}
