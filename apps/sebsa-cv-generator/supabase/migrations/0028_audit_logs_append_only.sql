-- Audit records are append-only from application code. Reads remain governed by the existing
-- reviewer-or-above SELECT policy; clients receive no write policy and cannot edit/delete logs.
alter table audit_logs enable row level security;
alter table audit_logs force row level security;

revoke insert, update, delete, truncate on table audit_logs from anon, authenticated;

create index if not exists audit_logs_entity_idx
  on audit_logs (entity_type, entity_id, created_at desc);
