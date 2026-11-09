-- Real, persistent, role-specific notifications — replaces the client-only, in-memory `activities`
-- state in app/context/DataContext.tsx that reset on every page refresh and was never shared
-- across users or roles. See docs/04-rbac-security.md §17.
--
-- Recipient-centric (who should SEE this), unlike the existing `audit_logs` table (actor-centric,
-- "who DID this" — and itself unused by any app code, left as-is here).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;

-- All inserts happen server-side via the service-role admin client (lib/notifications.ts) — there
-- is deliberately no insert policy for regular users, only select/update of their own rows.
create policy notifications_select_own on notifications for select using (user_id = auth.uid());
create policy notifications_update_own on notifications for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
