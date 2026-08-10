-- Reverts prisma/migrations/20260810110808_add_project_and_task_display_numbers.
-- Per this project's migration convention, the old migration file is left
-- in place as historical record rather than edited/deleted — this is a new,
-- separate forward migration that undoes it instead.
--
-- Reason: the projectNumber/taskNumber design (global sequential integers)
-- was premature — the actual requirement is a per-project prefixed key
-- (e.g. "DER-1"), which needs a different schema shape entirely. Dropping
-- these now rather than carrying unused columns until that's designed.
--
-- Dropping each column also drops its owning sequence and unique index
-- automatically (both were created OWNED BY / ON these columns).

ALTER TABLE "projects" DROP COLUMN "projectNumber";
ALTER TABLE "tasks" DROP COLUMN "taskNumber";
