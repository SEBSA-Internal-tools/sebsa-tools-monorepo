-- The six original flags did not describe what the application can actually do:
-- one flag gated both cases and tasks, subtasks and comments were governed only
-- by isReadOnly, and canManageWorkflow covered two unrelated things.
--
-- New values are DERIVED from the old ones rather than assigned per group name,
-- so every existing group keeps exactly the permissions it has today. Nobody
-- gains or loses access from this migration.

ALTER TABLE "privilege_groups" ADD COLUMN "canCreateCase"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canEditCase"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canDeleteCase"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canEditTask"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canComment"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canManageSprints" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privilege_groups" ADD COLUMN "canManageLabels"  BOOLEAN NOT NULL DEFAULT false;

UPDATE "privilege_groups" SET
  -- canCreateTask/canDeleteTask gated cases as well as tasks.
  "canCreateCase"    = "canCreateTask",
  "canDeleteCase"    = "canDeleteTask",
  -- Editing a case, task, subtask or comment was only ever gated by isReadOnly.
  "canEditCase"      = NOT "isReadOnly",
  "canEditTask"      = NOT "isReadOnly",
  "canComment"       = NOT "isReadOnly",
  -- canManageWorkflow covered sprints and labels together.
  "canManageSprints" = "canManageWorkflow",
  "canManageLabels"  = "canManageWorkflow";

ALTER TABLE "privilege_groups" DROP COLUMN "canManageWorkflow";
