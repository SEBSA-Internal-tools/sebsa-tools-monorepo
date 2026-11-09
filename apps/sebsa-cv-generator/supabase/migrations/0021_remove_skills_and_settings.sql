-- 1. Remove foreign key columns referencing files table
alter table profiles drop column if exists original_cv_file_id cascade;
alter table opportunities drop column if exists original_file_id cascade;

-- 2. Remove foreign key constraint from generated_cvs referencing templates
alter table generated_cvs drop constraint if exists generated_cvs_template_id_fkey cascade;
alter table generated_cvs alter column template_id drop not null;

-- 3. Drop tables
drop table if exists profile_skills cascade;
drop table if exists skills cascade;
drop table if exists app_settings cascade;
drop table if exists files cascade;
drop table if exists templates cascade;
