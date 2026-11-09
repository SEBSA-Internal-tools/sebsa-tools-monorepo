-- Manual assessment recipients and reliable invitation/reminder delivery.

-- The application treats this as one invitation per employee and cycle. Enforce that invariant
-- in Postgres so overlapping administrator requests cannot create duplicates.
drop index if exists assessment_invitations_user_cycle_idx;
create unique index if not exists assessment_invitations_user_cycle_unique
  on assessment_invitations (user_id, cycle_id);

create table if not exists assessment_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references assessment_cycles(id) on delete cascade,
  email_type text not null check (email_type in ('invitation', 'reminder')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id, email_type)
);

create index if not exists assessment_email_deliveries_cycle_type_idx
  on assessment_email_deliveries (cycle_id, email_type, status);

drop trigger if exists assessment_email_deliveries_touch on assessment_email_deliveries;
create trigger assessment_email_deliveries_touch
  before update on assessment_email_deliveries
  for each row execute function public.assessment_touch_updated_at();

alter table assessment_email_deliveries enable row level security;

drop policy if exists assessment_email_deliveries_reviewer_select on assessment_email_deliveries;
create policy assessment_email_deliveries_reviewer_select on assessment_email_deliveries
  for select using (is_assessment_manager());

drop policy if exists assessment_email_deliveries_reviewer_write on assessment_email_deliveries;
create policy assessment_email_deliveries_reviewer_write on assessment_email_deliveries
  for all using (is_assessment_manager()) with check (is_assessment_manager());

revoke all on assessment_email_deliveries from anon;

-- Only one request can claim a pending logical email, preventing concurrent duplicate sends.
create or replace function public.claim_assessment_email_delivery(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update assessment_email_deliveries
     set status = 'sending', attempt_count = attempt_count + 1, last_attempt_at = now()
   where id = p_delivery_id and status = 'pending';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_assessment_email_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_assessment_email_delivery(uuid) to service_role;
