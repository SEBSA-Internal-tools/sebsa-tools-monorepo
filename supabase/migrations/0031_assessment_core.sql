-- Knowledge-assessment module (ported from the standalone SEBSA Internal Assessment tool, which
-- ran on MongoDB). ADDITIVE ONLY: creates new assessment_* tables, indexes, policies and one
-- trigger function. It does not alter or read any existing table except through the existing
-- RBAC helper current_user_role() (0002), so it cannot affect CV Generator data.
--
-- Design notes
--   * People are referenced by auth.users(id), NOT profiles(id): every employee takes the
--     assessment, but a profiles row exists only for people in the CV repository.
--   * HR / assessment-admin privileges belong to cv_reviewer and super_admin ONLY (decision recorded
--     in docs/04-rbac-security.md section 18). Admin is deliberately excluded, so this uses its own
--     helper, is_assessment_manager(), instead of the broader is_assessment_manager().
--   * The answer key lives in assessment_questions.correct_option. Employees get NO policy on
--     that table: question delivery and scoring happen server-side with the service role, which
--     strips the key before anything reaches the browser.
--   * Attempts / certificates / invitations are written only by server code (service role). There
--     is deliberately no client insert/update policy on them.
--   * Certificates are rendered on demand from the attempt (as in the old tool), so no file path
--     or storage bucket is needed.
--   * legacy_mongo_id keeps the original ObjectId (as text) so the one-off import is idempotent
--     and traceable. It can be dropped once the cut-over is verified.

create or replace function public.assessment_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Who may manage assessments (questions incl. the answer key, cycles, invitations, everyone's
-- results). security definer so policies can call it without recursing into user_roles' own RLS.
create or replace function public.is_assessment_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select current_user_role() in ('cv_reviewer', 'super_admin')
$$;

-- Question bank ---------------------------------------------------------------------------
create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('a', 'b', 'c', 'd')),
  category text,
  -- Retire a question without deleting the history that references it.
  status text not null default 'active' check (status in ('active', 'inactive')),
  legacy_mongo_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessment_questions_status_idx on assessment_questions (status);

-- Cycles ----------------------------------------------------------------------------------
create table if not exists assessment_cycles (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  passing_score int not null default 8 check (passing_score between 0 and 10),
  status text not null default 'active' check (status in ('active', 'closed', 'deactivated')),
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid references auth.users(id) on delete set null,
  legacy_mongo_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Not unique on status: the legacy data already has two active cycles at once.
create index if not exists assessment_cycles_status_opened_idx on assessment_cycles (status, opened_at desc);

-- Invitations (one per person per cycle) --------------------------------------------------
create table if not exists assessment_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references assessment_cycles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'completed', 'resent', 'expired')),
  email_status text not null default 'sent' check (email_status in ('sent', 'failed')),
  email_error text,
  -- Opaque delivery reference from the mail provider (was brevoMessageId). Microsoft Graph's
  -- sendMail returns no id, so this may stay null after the mail transport changes.
  delivery_ref text,
  resent_at timestamptz,
  legacy_mongo_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessment_invitations_user_cycle_idx on assessment_invitations (user_id, cycle_id);
create index if not exists assessment_invitations_cycle_idx on assessment_invitations (cycle_id);

-- Attempts (max two per person per cycle) -------------------------------------------------
create table if not exists assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid not null references assessment_cycles(id) on delete cascade,
  attempt_number int not null default 1 check (attempt_number between 1 and 2),
  selected_question_ids uuid[] not null default '{}',
  -- { "<question uuid>": "a" | "b" | "c" | "d" }
  answers jsonb not null default '{}',
  score int not null check (score between 0 and 10),
  passed boolean not null default false,
  -- true when no further attempts are allowed for this person + cycle
  is_final boolean not null default false,
  submitted_at timestamptz not null default now(),
  legacy_mongo_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id, attempt_number)
);
create index if not exists assessment_attempts_cycle_idx on assessment_attempts (cycle_id);

-- Certificates ----------------------------------------------------------------------------
create table if not exists assessment_certificates (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references assessment_attempts(id) on delete cascade,
  certificate_number text not null unique,
  issued_at timestamptz not null default now(),
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz,
  email_error text,
  legacy_mongo_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'assessment_questions', 'assessment_cycles', 'assessment_invitations',
    'assessment_attempts', 'assessment_certificates'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format(
      'create trigger %I before update on %I for each row execute function public.assessment_touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

-- Row Level Security ----------------------------------------------------------------------
alter table assessment_questions enable row level security;
alter table assessment_cycles enable row level security;
alter table assessment_invitations enable row level security;
alter table assessment_attempts enable row level security;
alter table assessment_certificates enable row level security;

-- Questions: assessment managers only (they must see and edit the answer key). Employees: nothing.
drop policy if exists assessment_questions_reviewer_all on assessment_questions;
create policy assessment_questions_reviewer_all on assessment_questions
  for all using (is_assessment_manager()) with check (is_assessment_manager());

-- Cycles: any signed-in user may read (label/status only; nothing sensitive), assessment managers manage.
drop policy if exists assessment_cycles_select on assessment_cycles;
create policy assessment_cycles_select on assessment_cycles
  for select using (auth.uid() is not null);
drop policy if exists assessment_cycles_reviewer_write on assessment_cycles;
create policy assessment_cycles_reviewer_write on assessment_cycles
  for all using (is_assessment_manager()) with check (is_assessment_manager());

-- Invitations: own rows, or any row for assessment managers. They can write (send/resend);
-- employees never write directly.
drop policy if exists assessment_invitations_select on assessment_invitations;
create policy assessment_invitations_select on assessment_invitations
  for select using (user_id = auth.uid() or is_assessment_manager());
drop policy if exists assessment_invitations_reviewer_write on assessment_invitations;
create policy assessment_invitations_reviewer_write on assessment_invitations
  for all using (is_assessment_manager()) with check (is_assessment_manager());

-- Attempts: read-only for clients (own, or all for assessment managers). Written by server code only.
drop policy if exists assessment_attempts_select on assessment_attempts;
create policy assessment_attempts_select on assessment_attempts
  for select using (user_id = auth.uid() or is_assessment_manager());

-- Certificates: read-only for clients (own via the attempt, or all for assessment managers).
drop policy if exists assessment_certificates_select on assessment_certificates;
create policy assessment_certificates_select on assessment_certificates
  for select using (
    is_assessment_manager()
    or exists (
      select 1 from assessment_attempts a
      where a.id = assessment_certificates.attempt_id and a.user_id = auth.uid()
    )
  );

-- Belt and braces: RLS already blocks anon, but make it explicit that anon has no table access.
revoke all on assessment_questions, assessment_cycles, assessment_invitations,
  assessment_attempts, assessment_certificates from anon;
