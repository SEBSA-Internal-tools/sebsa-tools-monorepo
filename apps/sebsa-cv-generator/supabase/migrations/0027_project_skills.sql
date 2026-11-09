-- Adds a skills column to `projects` (the Special Projects section) so each project can carry
-- its own structured skill tags — used by the AI CV-selection flow to reason about which
-- projects/skills are relevant to a customer opportunity. Same shape as the just-removed
-- `projects.tags` column (0025_drop_unused_fields.sql); existing rows default to an empty array
-- and every read/write path already treats a missing/empty skills list as valid.
alter table projects add column if not exists skills text[] not null default '{}';
