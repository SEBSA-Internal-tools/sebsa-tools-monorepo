-- Drops columns confirmed dead across the whole codebase (no insert/update ever writes real data
-- into them, and any read path is either unreachable or renders nothing): profiles.phone,
-- profiles.specialty, profiles.location, departments.description, projects.tags, and four
-- generated_cvs columns left behind by earlier removals (0021 templates, 0023 opportunities) that
-- were only ever written as null/{}/empty and never read back.
alter table profiles drop column if exists phone;
alter table profiles drop column if exists specialty;
alter table profiles drop column if exists location;

alter table departments drop column if exists description;

alter table projects drop column if exists tags;

alter table generated_cvs drop column if exists opportunity_id;
alter table generated_cvs drop column if exists template_id;
alter table generated_cvs drop column if exists ai_highlights;
alter table generated_cvs drop column if exists parent_generated_cv_id;
