-- SYNTHETIC development data. Nothing here is real: every person, address and question is made up.
-- Runs automatically on `supabase db reset` (local Docker) and is applied by hand to the shared dev
-- project. Idempotent: fixed ids + ON CONFLICT, so re-running is safe.
--
-- NEVER put real employee data, real credentials or the real assessment question bank in this file.
--
-- Sign in with any account below. Password for ALL of them:  DevPass-123!
--   super.admin@sebsa.test   Super Admin
--   admin@sebsa.test         Admin           (NOT an assessment manager)
--   reviewer@sebsa.test      CV Reviewer     (HR: manages assessments)
--   employee1@sebsa.test     Employee        (has a profile, invited to the sample cycle)
--   employee2@sebsa.test     Employee        (has a profile, invited to the sample cycle)
--   newhire@sebsa.test       Employee        (no profile yet -> exercises onboarding)

-- Accounts ---------------------------------------------------------------------------------------
-- The on_auth_user_created trigger gives each new account the 'employee' role; roles are set below.
with seed(id, email, role) as (
  values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'super.admin@sebsa.test', 'super_admin'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'admin@sebsa.test',       'admin'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'reviewer@sebsa.test',    'cv_reviewer'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'employee1@sebsa.test',   'employee'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'employee2@sebsa.test',   'employee'),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'newhire@sebsa.test',     'employee')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('DevPass-123!', extensions.gen_salt('bf')), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
from seed
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
from auth.users
where id::text like 'a0000000-0000-4000-8000-00000000000%'
  and not exists (select 1 from auth.identities i where i.user_id = auth.users.id and i.provider = 'email');

update public.user_roles r set role = s.role
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'super_admin'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'admin'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'cv_reviewer')
) as s(user_id, role)
where r.user_id = s.user_id;

-- Profiles (published, so they appear in the repository) ----------------------------------------------
insert into public.profiles (id, user_id, full_name, email, role_title, department_id, years_experience, summary, status)
select v.id, v.user_id, v.full_name, v.email, v.role_title, d.id, v.years, v.summary, 'published'
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000001'::uuid, 'Sam Superadmin',  'super.admin@sebsa.test', 'Head of Delivery',        'Service Delivery', 15.0, 'Synthetic profile used for local development.'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid, 'Alex Admin',      'admin@sebsa.test',       'Operations Manager',      'Service Delivery', 10.0, 'Synthetic profile used for local development.'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid, 'Riley Reviewer',   'reviewer@sebsa.test',    'HR Business Partner',     'Finance',           8.0, 'Synthetic profile used for local development.'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-000000000004'::uuid, 'Emma Employee',    'employee1@sebsa.test',   'Senior Backend Engineer', 'Technical',         7.5, 'Backend engineer with a focus on integrations and data pipelines. (Synthetic.)'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'a0000000-0000-4000-8000-000000000005'::uuid, 'Eli Employee',     'employee2@sebsa.test',   'Functional Consultant',   'Functional',        4.0, 'Functional consultant for supply-chain projects. (Synthetic.)'),
  -- profiles with no account yet, to populate the repository list
  ('b0000000-0000-4000-8000-000000000006'::uuid, null, 'Casey Contractor', 'casey@sebsa.test',       'DevOps Engineer',         'Build and Deployment', 6.0, 'Synthetic profile, no account yet.'),
  ('b0000000-0000-4000-8000-000000000007'::uuid, null, 'Jordan Joiner',    'jordan@sebsa.test',      'QA Analyst',              'Technical',         2.5, 'Synthetic profile, no account yet.')
) as v(id, user_id, full_name, email, role_title, dept, years, summary)
join public.departments d on d.name = v.dept
on conflict (id) do nothing;

insert into public.experiences (id, profile_id, company, role_title, employment_type, start_date, end_date, is_current, description, display_order)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'Acme Logistics (fictional)', 'Senior Backend Engineer', 'Full-time', '2021-03-01', null,         true,  'Built order-sync services and reporting pipelines.', 0),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', 'Globex Retail (fictional)',  'Backend Engineer',        'Full-time', '2018-06-01', '2021-02-28', false, 'Maintained REST APIs and nightly batch jobs.',       1)
on conflict (id) do nothing;

insert into public.projects (id, profile_id, name, description, display_order, skills)
values ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'Warehouse Sync Platform (fictional)', 'Near-real-time stock synchronisation across three warehouses.', 0, '{"TypeScript","PostgreSQL","Queues"}')
on conflict (id) do nothing;

insert into public.certifications (id, profile_id, name, issuer, issued_date)
values ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'Cloud Practitioner (fictional)', 'Example Academy', '2022-05-01')
on conflict (id) do nothing;

-- Assessment module: made-up questions (NOT the real bank) ----------------------------------------------
insert into public.assessment_questions (id, question_text, option_a, option_b, option_c, option_d, correct_option, category)
values
  ('f0000000-0000-4000-8000-000000000001', 'An email asks you to urgently confirm your password via a link. What should you do?', 'Click the link and confirm', 'Reply with your password', 'Report it as phishing and do not click', 'Forward it to all colleagues', 'c', 'Security awareness'),
  ('f0000000-0000-4000-8000-000000000002', 'Which of these is the strongest password?', 'Password123', 'The-quick-brown-fox-7-jumps!', 'qwerty', 'Your birthday', 'b', 'Security awareness'),
  ('f0000000-0000-4000-8000-000000000003', 'You find a USB stick in the car park. What should you do?', 'Plug it in to see whose it is', 'Take it home', 'Hand it to IT without plugging it in', 'Throw it in the bin', 'c', 'Security awareness'),
  ('f0000000-0000-4000-8000-000000000004', 'Customer data should be shared with a third party only when…', 'They ask politely', 'There is an approved agreement and a business need', 'It saves time', 'A colleague says it is fine', 'b', 'Data handling'),
  ('f0000000-0000-4000-8000-000000000005', 'Where should confidential documents be stored?', 'On a personal cloud drive', 'In approved company storage', 'On a shared USB stick', 'In a public chat channel', 'b', 'Data handling'),
  ('f0000000-0000-4000-8000-000000000006', 'What does "least privilege" mean?', 'Everyone gets admin rights', 'People get only the access they need for their job', 'Access is never reviewed', 'Passwords are shared within a team', 'b', 'Access control'),
  ('f0000000-0000-4000-8000-000000000007', 'When leaving your desk you should…', 'Leave the screen unlocked', 'Lock your screen', 'Turn the monitor off only', 'Ask a colleague to watch it', 'b', 'Access control'),
  ('f0000000-0000-4000-8000-000000000008', 'Multi-factor authentication helps because…', 'It makes passwords unnecessary', 'A stolen password alone is not enough to sign in', 'It speeds up sign-in', 'It encrypts email', 'b', 'Access control'),
  ('f0000000-0000-4000-8000-000000000009', 'You notice a suspicious login alert on your account. First step?', 'Ignore it', 'Report it to IT security immediately', 'Change your name', 'Wait a week', 'b', 'Incident response'),
  ('f0000000-0000-4000-8000-000000000010', 'Which is a safe way to share a large confidential file externally?', 'A public link anyone can open', 'An approved secure transfer tool with expiry', 'Personal email', 'A messaging app', 'b', 'Data handling'),
  ('f0000000-0000-4000-8000-000000000011', 'Public Wi-Fi at a café is best used…', 'For confidential work without protection', 'Only through the company VPN', 'To share passwords', 'With file sharing turned on', 'b', 'Security awareness'),
  ('f0000000-0000-4000-8000-000000000012', 'A visitor without a badge is in the office. You should…', 'Ignore them', 'Politely ask who they are meeting and escort them to reception', 'Give them your badge', 'Let them use your laptop', 'b', 'Physical security'),
  ('f0000000-0000-4000-8000-000000000013', 'Software updates should be…', 'Postponed indefinitely', 'Installed promptly', 'Disabled', 'Done only yearly', 'b', 'Security awareness'),
  ('f0000000-0000-4000-8000-000000000014', 'Personal data must be kept…', 'Forever', 'Only as long as there is a legitimate need', 'On personal devices', 'In plain text emails', 'b', 'Data handling'),
  ('f0000000-0000-4000-8000-000000000015', 'If you make a mistake that exposes data, you should…', 'Hide it', 'Report it straight away so it can be contained', 'Delete the logs', 'Blame a colleague', 'b', 'Incident response')
on conflict (id) do nothing;

insert into public.assessment_cycles (id, label, passing_score, status, opened_at, opened_by)
values ('90000000-0000-4000-8000-000000000001', 'DEV Sample Cycle', 8, 'active', now(), 'a0000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.assessment_invitations (id, user_id, cycle_id, expires_at, status, email_status)
select v.id, v.user_id, '90000000-0000-4000-8000-000000000001', now() + interval '7 days', 'pending', 'sent'
from (values
  ('91000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid),
  ('91000000-0000-4000-8000-000000000002'::uuid, 'a0000000-0000-4000-8000-000000000004'::uuid),
  ('91000000-0000-4000-8000-000000000003'::uuid, 'a0000000-0000-4000-8000-000000000005'::uuid),
  ('91000000-0000-4000-8000-000000000004'::uuid, 'a0000000-0000-4000-8000-000000000006'::uuid)
) as v(id, user_id)
on conflict (id) do nothing;
