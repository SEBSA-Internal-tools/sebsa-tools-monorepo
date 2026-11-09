-- Introduce the Case hierarchy level: Customer -> Project -> Case -> Task -> Subtask.
--
-- Hand-authored (not `prisma migrate dev`-generated) per
-- docs/database-architecture.md "Constraints added by hand": this migration
-- restructures Task.type/Task.parentTaskId into a new Case model, requires a
-- non-trivial data backfill Prisma's diff engine cannot express, and drops
-- the WorkflowStage model in favor of fixed status enums. See the approved
-- plan for full rationale.
--
-- Live data at authoring time: 98 tasks / 28 projects. Distribution and
-- verification queries are documented alongside the corresponding steps
-- below so the backfill logic can be audited against real numbers.

-- =============================================================================
-- STEP 1: New enums
-- =============================================================================

CREATE TYPE "CaseType" AS ENUM ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST', 'GENERAL');
CREATE TYPE "CaseStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');
CREATE TYPE "TaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED');
CREATE TYPE "SubtaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'DONE');

-- Not used by this migration's own data writes (only by future application
-- code), so safe to add and commit within the same transaction.
ALTER TYPE "EntityType" ADD VALUE 'CASE';
ALTER TYPE "EntityType" ADD VALUE 'SUBTASK';

-- =============================================================================
-- STEP 2: New tables (empty shells first; populated after Task is snapshotted)
-- =============================================================================

CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'TO_DO',
    "priorityId" TEXT NOT NULL,
    "sprintId" TEXT,
    "milestoneId" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "storyPoints" DOUBLE PRECISION,
    "isCsoLabeled" BOOLEAN NOT NULL DEFAULT false,
    "category" "TaskCategory",
    "jiraStatusLabel" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cases_projectId_idx" ON "cases"("projectId");
CREATE INDEX "cases_priorityId_idx" ON "cases"("priorityId");
CREATE INDEX "cases_sprintId_idx" ON "cases"("sprintId");
CREATE INDEX "cases_milestoneId_idx" ON "cases"("milestoneId");
CREATE INDEX "cases_dueDate_idx" ON "cases"("dueDate");

ALTER TABLE "cases" ADD CONSTRAINT "cases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "project_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_assignees" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_assignees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "case_assignees_caseId_userId_key" ON "case_assignees"("caseId", "userId");
CREATE INDEX "case_assignees_userId_idx" ON "case_assignees"("userId");
ALTER TABLE "case_assignees" ADD CONSTRAINT "case_assignees_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_assignees" ADD CONSTRAINT "case_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_labels" (
    "caseId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    CONSTRAINT "case_labels_pkey" PRIMARY KEY ("caseId", "labelId")
);
CREATE INDEX "case_labels_labelId_idx" ON "case_labels"("labelId");
ALTER TABLE "case_labels" ADD CONSTRAINT "case_labels_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_labels" ADD CONSTRAINT "case_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_status_history" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "CaseStatus",
    "toStatus" "CaseStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_status_history_caseId_idx" ON "case_status_history"("caseId");
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "case_category_assignments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "assigneeId" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_category_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "case_category_assignments_caseId_idx" ON "case_category_assignments"("caseId");
ALTER TABLE "case_category_assignments" ADD CONSTRAINT "case_category_assignments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_category_assignments" ADD CONSTRAINT "case_category_assignments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "case_category_assignments" ADD CONSTRAINT "case_category_assignments_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "subtasks" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SubtaskStatus" NOT NULL DEFAULT 'TO_DO',
    "dueDate" TIMESTAMP(3),
    "jiraStatusLabel" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "subtasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subtasks_taskId_idx" ON "subtasks"("taskId");
CREATE INDEX "subtasks_dueDate_idx" ON "subtasks"("dueDate");
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The taskId FK is added later (STEP 11), once `subtasks` is populated and
-- every referenced task id is confirmed to still exist in `tasks`.

CREATE TABLE "subtask_assignees" (
    "id" TEXT NOT NULL,
    "subtaskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subtask_assignees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subtask_assignees_subtaskId_userId_key" ON "subtask_assignees"("subtaskId", "userId");
CREATE INDEX "subtask_assignees_userId_idx" ON "subtask_assignees"("userId");
ALTER TABLE "subtask_assignees" ADD CONSTRAINT "subtask_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- subtaskId FK also added in STEP 11.

-- =============================================================================
-- STEP 3: New (nullable-for-now) columns on `tasks`, ahead of backfill
-- =============================================================================

ALTER TABLE "tasks" ADD COLUMN "caseId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "status" "TaskStatus";
ALTER TABLE "tasks" ADD COLUMN "jiraStatusLabel" TEXT;

-- =============================================================================
-- STEP 4: Snapshot the pre-migration Task hierarchy before mutating anything,
-- and a helper to translate a project's messy, free-text WorkflowStage names
-- into the new fixed status vocabulary. Best-effort keyword matching (there
-- is no clean 1:1 mapping in the real data) -- STEP 9 reports every stage
-- name that fell through to the TO_DO default for manual spot-check.
-- =============================================================================

CREATE TEMP TABLE "_orig_tasks" AS
SELECT id, type, "parentTaskId", "projectId", "priorityId", "createdById"
FROM "tasks";

CREATE FUNCTION pg_temp.derive_fixed_status(stage_name TEXT, is_default BOOLEAN)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN is_default THEN 'TO_DO'
    WHEN stage_name ILIKE '%progress%' OR stage_name ILIKE '%ongoing%' THEN 'IN_PROGRESS'
    WHEN stage_name ILIKE '%review%' OR stage_name ILIKE '%test%' OR stage_name ILIKE '%verif%' THEN 'IN_REVIEW'
    WHEN stage_name ILIKE '%block%' THEN 'BLOCKED'
    WHEN stage_name ILIKE '%done%' OR stage_name ILIKE '%complet%' OR stage_name ILIKE '%closed%' OR stage_name ILIKE '%merged%' THEN 'DONE'
    WHEN stage_name ILIKE '%cancel%' THEN 'CANCELLED'
    ELSE 'TO_DO'
  END;
$$ LANGUAGE SQL IMMUTABLE;

-- =============================================================================
-- STEP 5: Placeholder "General Tasks" Case per project, for orphaned
-- Task/Subtask-type rows with no Epic/Story/Bug/Improvement/Test ancestor
-- (64% of live tasks fall in this bucket -- required per the approved plan).
-- =============================================================================

CREATE TEMP TABLE "_placeholder_cases" AS
SELECT gen_random_uuid()::text AS id, sub."projectId", sub."priorityId", sub."createdById"
FROM (
  SELECT DISTINCT ON (ot."projectId") ot."projectId", ot."priorityId", ot."createdById"
  FROM "_orig_tasks" ot
  WHERE ot.type IN ('TASK', 'SUBTASK') AND ot."parentTaskId" IS NULL
  ORDER BY ot."projectId", ot.id
) sub;

INSERT INTO "cases" (id, "projectId", title, description, type, status, "priorityId", "createdById", "createdAt", "updatedAt")
SELECT id, "projectId", 'General Tasks',
       'Auto-created by the Case-hierarchy migration to hold tasks that had no Epic/Story/Bug/Improvement/Test ancestor. Re-organize into a proper Case as needed.',
       'GENERAL', 'TO_DO', "priorityId", "createdById", now(), now()
FROM "_placeholder_cases";

-- =============================================================================
-- STEP 6: Migrate Epic/Story/Bug/Improvement/Test rows into `cases`,
-- reusing their existing id (so every downstream FK that pointed at the old
-- task row keeps working by pointing at the same id, now in `cases`).
-- =============================================================================

INSERT INTO "cases" (
  id, "projectId", title, description, type, status, "priorityId", "sprintId", "milestoneId",
  "startDate", "dueDate", "storyPoints", "isCsoLabeled", category, "createdById", "createdAt", "updatedAt", "deletedAt"
)
SELECT
  t.id, t."projectId", t.title, t.description, t.type::text::"CaseType",
  pg_temp.derive_fixed_status(ws.name, ws."isDefault")::"CaseStatus",
  t."priorityId", t."sprintId", t."milestoneId", t."startDate", t."dueDate", t."storyPoints",
  t."isCsoLabeled", t.category, t."createdById", t."createdAt", t."updatedAt", t."deletedAt"
FROM "tasks" t
LEFT JOIN "workflow_stages" ws ON ws.id = t."workflowStageId"
WHERE t.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');

-- Carry over assignees/labels for these rows (Case supports both; 15
-- assignee rows and 0 label rows exist for case-type tasks in live data).
INSERT INTO "case_assignees" (id, "caseId", "userId", "assignedAt")
SELECT gen_random_uuid()::text, ta."taskId", ta."userId", ta."assignedAt"
FROM "task_assignees" ta
JOIN "_orig_tasks" ot ON ot.id = ta."taskId"
WHERE ot.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');

INSERT INTO "case_labels" ("caseId", "labelId")
SELECT tl."taskId", tl."labelId"
FROM "task_labels" tl
JOIN "_orig_tasks" ot ON ot.id = tl."taskId"
WHERE ot.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');

INSERT INTO "case_status_history" (id, "caseId", "fromStatus", "toStatus", "changedById", "changedAt")
SELECT
  tsh.id, tsh."taskId",
  CASE WHEN wsFrom.id IS NULL THEN NULL ELSE pg_temp.derive_fixed_status(wsFrom.name, wsFrom."isDefault")::"CaseStatus" END,
  pg_temp.derive_fixed_status(wsTo.name, wsTo."isDefault")::"CaseStatus",
  tsh."changedById", tsh."changedAt"
FROM "task_status_history" tsh
JOIN "_orig_tasks" ot ON ot.id = tsh."taskId"
LEFT JOIN "workflow_stages" wsFrom ON wsFrom.id = tsh."fromStageId"
JOIN "workflow_stages" wsTo ON wsTo.id = tsh."toStageId"
WHERE ot.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');

DO $$
DECLARE
  dep_count INT;
BEGIN
  SELECT count(*) INTO dep_count
  FROM "task_dependencies" td
  JOIN "_orig_tasks" ot ON ot.id = td."sourceTaskId" OR ot.id = td."targetTaskId"
  WHERE ot.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');
  IF dep_count > 0 THEN
    RAISE NOTICE 'Dropping % task_dependencies row(s) attached to a now-migrated Case (Case does not support dependencies in this pass).', dep_count;
  END IF;
END $$;

-- The original schema's self-referencing parentTaskId FK is ON DELETE
-- CASCADE. Sever it for any row whose immediate parent is about to be
-- deleted below, or Postgres would silently cascade-delete that row (and
-- transitively anything nested under it) before STEP 7/8 get a chance to
-- re-home it as a Task under the resolved Case. STEP 7's classification
-- reads from the "_orig_tasks" snapshot taken in STEP 4, not from this
-- live column, so nulling it here is safe.
UPDATE "tasks" SET "parentTaskId" = NULL
WHERE "parentTaskId" IN (SELECT id FROM "tasks" WHERE type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST'));

-- Remove the now-migrated rows from `tasks` (cascades cleanup of their
-- remaining task_assignees/task_labels/comments/attachments/status_history/
-- category_assignments/dependencies -- the ones worth keeping were already
-- copied above; comments/attachments are confirmed empty tables).
DELETE FROM "tasks" WHERE type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST');

-- =============================================================================
-- STEP 7: Build the full old-row -> new-row resolution map, covering every
-- one of the original 98 rows (including the ones just migrated to `cases`).
-- =============================================================================

CREATE TEMP TABLE "_task_migration" AS
SELECT
  ot.id AS old_id,
  ot.type AS old_type,
  ot."parentTaskId" AS old_parent_id,
  CASE
    WHEN ot.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST') THEN 'CASE'
    WHEN ot."parentTaskId" IS NULL THEN 'TASK'
    WHEN parent.type IN ('EPIC', 'STORY', 'BUG', 'IMPROVEMENT', 'TEST') THEN 'TASK'
    ELSE 'SUBTASK'
  END AS new_kind
FROM "_orig_tasks" ot
LEFT JOIN "_orig_tasks" parent ON parent.id = ot."parentTaskId";

ALTER TABLE "_task_migration" ADD COLUMN resolved_case_id TEXT;
ALTER TABLE "_task_migration" ADD COLUMN resolved_task_id TEXT;

-- CASE rows resolve to themselves (Case reused the old task id).
UPDATE "_task_migration" SET resolved_case_id = old_id WHERE new_kind = 'CASE';

-- TASK rows whose parent became a Case resolve to that parent's (reused) id.
UPDATE "_task_migration" SET resolved_case_id = old_parent_id
WHERE new_kind = 'TASK' AND old_parent_id IS NOT NULL;

-- TASK rows with no parent at all resolve to their project's placeholder Case.
UPDATE "_task_migration" tm
SET resolved_case_id = pc.id
FROM "_orig_tasks" ot
JOIN "_placeholder_cases" pc ON pc."projectId" = ot."projectId"
WHERE tm.old_id = ot.id AND tm.new_kind = 'TASK' AND tm.old_parent_id IS NULL;

-- TASK rows resolve to themselves as a task too (Task also reuses its id).
UPDATE "_task_migration" SET resolved_task_id = old_id WHERE new_kind = 'TASK';

-- SUBTASK rows resolve to their parent's (reused) task id, and transitively
-- inherit that parent's resolved Case.
UPDATE "_task_migration" SET resolved_task_id = old_parent_id WHERE new_kind = 'SUBTASK';

UPDATE "_task_migration" tm
SET resolved_case_id = parent_tm.resolved_case_id
FROM "_task_migration" parent_tm
WHERE tm.new_kind = 'SUBTASK' AND parent_tm.old_id = tm.old_parent_id;

DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT count(*) INTO bad_count FROM "_task_migration"
  WHERE (new_kind IN ('CASE', 'TASK') AND resolved_case_id IS NULL)
     OR (new_kind = 'SUBTASK' AND (resolved_task_id IS NULL OR resolved_case_id IS NULL));
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Case-hierarchy migration: % task row(s) could not be resolved to a Case/Task/Subtask -- aborting rather than guessing.', bad_count;
  END IF;
END $$;

-- =============================================================================
-- STEP 8: Backfill caseId + status on the rows that stay as `tasks`, and
-- repoint the category-assignment audit trail (all 27 live rows, whichever
-- of Case/Task/Subtask their original task became -- category now lives on
-- Case only) at each row's resolved Case.
-- =============================================================================

UPDATE "tasks" t
SET "caseId" = sub.resolved_case_id,
    "status" = sub.derived_status::"TaskStatus"
FROM (
  SELECT tm.old_id, tm.resolved_case_id, pg_temp.derive_fixed_status(ws.name, ws."isDefault") AS derived_status
  FROM "_task_migration" tm
  JOIN "tasks" tt ON tt.id = tm.old_id
  LEFT JOIN "workflow_stages" ws ON ws.id = tt."workflowStageId"
  WHERE tm.new_kind = 'TASK'
) sub
WHERE t.id = sub.old_id;

INSERT INTO "case_category_assignments" (id, "caseId", category, "assigneeId", "changedById", "changedAt")
SELECT tca.id, tm.resolved_case_id, tca.category, tca."assigneeId", tca."changedById", tca."changedAt"
FROM "task_category_assignments" tca
JOIN "_task_migration" tm ON tm.old_id = tca."taskId";

-- =============================================================================
-- STEP 9: Propagate isCsoLabeled/category from original Task-level data onto
-- the resolved Case, so classification set on what is now a Task or Subtask
-- (17 Task-kind + a handful of Subtask-kind rows in live data) isn't
-- silently lost now that only Case carries these fields. Case-kind rows
-- already carried their own value across directly in STEP 6. Read before the
-- rows that will become Subtasks are deleted from `tasks` in STEP 11.
-- =============================================================================

UPDATE "cases" c
SET "isCsoLabeled" = true,
    category = COALESCE(c.category, sub.category)
FROM (
  SELECT tm.resolved_case_id, t.category
  FROM "_task_migration" tm
  JOIN "tasks" t ON t.id = tm.old_id
  WHERE tm.new_kind IN ('TASK', 'SUBTASK') AND (t."isCsoLabeled" = true OR t.category IS NOT NULL)
) sub
WHERE c.id = sub.resolved_case_id;

-- =============================================================================
-- STEP 10: Subtasks -- rows whose immediate parent is itself a Task/Subtask.
-- =============================================================================

INSERT INTO "subtask_assignees" (id, "subtaskId", "userId", "assignedAt")
SELECT gen_random_uuid()::text, ta."taskId", ta."userId", ta."assignedAt"
FROM "task_assignees" ta
JOIN "_task_migration" tm ON tm.old_id = ta."taskId"
WHERE tm.new_kind = 'SUBTASK';

INSERT INTO "subtasks" (id, "taskId", title, description, status, "dueDate", "createdById", "createdAt", "updatedAt", "deletedAt")
SELECT
  t.id, tm.resolved_task_id, t.title, t.description,
  (CASE pg_temp.derive_fixed_status(ws.name, ws."isDefault")
     WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
     WHEN 'IN_REVIEW' THEN 'IN_PROGRESS'
     WHEN 'BLOCKED' THEN 'IN_PROGRESS'
     WHEN 'DONE' THEN 'DONE'
     WHEN 'CANCELLED' THEN 'DONE'
     ELSE 'TO_DO'
   END)::"SubtaskStatus",
  t."dueDate", t."createdById", t."createdAt", t."updatedAt", t."deletedAt"
FROM "tasks" t
JOIN "_task_migration" tm ON tm.old_id = t.id
LEFT JOIN "workflow_stages" ws ON ws.id = t."workflowStageId"
WHERE tm.new_kind = 'SUBTASK';

-- =============================================================================
-- STEP 11: Now that `subtasks` is populated and every taskId it references
-- still exists in `tasks` (Task-kind rows are never deleted), wire up the
-- FKs deferred from STEP 2.
-- =============================================================================

ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subtask_assignees" ADD CONSTRAINT "subtask_assignees_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "subtasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- STEP 12: Remove the now-migrated Subtask-bound rows from `tasks` (cascades
-- cleanup of their remaining task_assignees [already migrated above],
-- status_history [dropped -- Subtask has no status-history table, per the
-- approved plan's lean Subtask design], category_assignments [already
-- migrated in STEP 8], labels/watchers/comments/attachments [confirmed
-- empty in live data]).
-- =============================================================================

DO $$
DECLARE
  history_count INT;
BEGIN
  SELECT count(*) INTO history_count
  FROM "task_status_history" tsh
  JOIN "_task_migration" tm ON tm.old_id = tsh."taskId"
  WHERE tm.new_kind = 'SUBTASK';
  IF history_count > 0 THEN
    RAISE NOTICE 'Dropping % task_status_history row(s) for rows that became Subtasks (Subtask has no status-history table in the new schema).', history_count;
  END IF;
END $$;

-- Same cascade-severing safety net as STEP 6, in case any subtask-bound row
-- unexpectedly has its own children (not present in the live data at
-- authoring time -- max observed nesting depth was 2 -- but cheap insurance
-- against silently losing rows the same way STEP 6 originally did).
UPDATE "tasks" SET "parentTaskId" = NULL
WHERE "parentTaskId" IN (SELECT old_id FROM "_task_migration" WHERE new_kind = 'SUBTASK');

DELETE FROM "tasks" WHERE id IN (SELECT old_id FROM "_task_migration" WHERE new_kind = 'SUBTASK');

-- =============================================================================
-- STEP 13: Every remaining `tasks` row is now Task-kind with caseId/status
-- populated (STEP 8). Enforce NOT NULL and wire up the caseId FK.
-- =============================================================================

DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT count(*) INTO null_count FROM "tasks" WHERE "caseId" IS NULL OR "status" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Case-hierarchy migration: % task row(s) still missing caseId/status after backfill -- aborting rather than leaving orphaned tasks.', null_count;
  END IF;
END $$;

ALTER TABLE "tasks" ALTER COLUMN "caseId" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'TO_DO';

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tasks_caseId_idx" ON "tasks"("caseId");

-- =============================================================================
-- STEP 14: task_status_history -- swap the WorkflowStage FK pair for fixed
-- TaskStatus values (only rows for still-existing Task-kind ids remain here;
-- Case-kind and Subtask-kind rows' history was migrated/dropped above).
-- =============================================================================

ALTER TABLE "task_status_history" ADD COLUMN "fromStatus" "TaskStatus";
ALTER TABLE "task_status_history" ADD COLUMN "toStatus" "TaskStatus";

UPDATE "task_status_history" tsh
SET "fromStatus" = pg_temp.derive_fixed_status(ws.name, ws."isDefault")::"TaskStatus"
FROM "workflow_stages" ws
WHERE tsh."fromStageId" = ws.id;

UPDATE "task_status_history" tsh
SET "toStatus" = pg_temp.derive_fixed_status(ws.name, ws."isDefault")::"TaskStatus"
FROM "workflow_stages" ws
WHERE tsh."toStageId" = ws.id;

DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT count(*) INTO null_count FROM "task_status_history" WHERE "toStatus" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Case-hierarchy migration: % task_status_history row(s) missing toStatus after backfill.', null_count;
  END IF;
END $$;

ALTER TABLE "task_status_history" ALTER COLUMN "toStatus" SET NOT NULL;
ALTER TABLE "task_status_history" DROP COLUMN "fromStageId";
ALTER TABLE "task_status_history" DROP COLUMN "toStageId";

-- =============================================================================
-- STEP 15: Report every distinct WorkflowStage name that fell through to the
-- TO_DO default without matching a keyword (and wasn't the project's default
-- stage) -- worth a manual spot-check after this migration runs. Must run
-- before workflow_stages is dropped in STEP 16.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  ambiguous TEXT := '';
BEGIN
  FOR r IN
    SELECT DISTINCT name FROM "workflow_stages"
    WHERE NOT "isDefault"
      AND name NOT ILIKE '%progress%' AND name NOT ILIKE '%ongoing%'
      AND name NOT ILIKE '%review%' AND name NOT ILIKE '%test%' AND name NOT ILIKE '%verif%'
      AND name NOT ILIKE '%block%'
      AND name NOT ILIKE '%done%' AND name NOT ILIKE '%complet%' AND name NOT ILIKE '%closed%' AND name NOT ILIKE '%merged%'
      AND name NOT ILIKE '%cancel%'
  LOOP
    ambiguous := ambiguous || r.name || '; ';
  END LOOP;
  IF ambiguous <> '' THEN
    RAISE NOTICE 'Stage names mapped to the TO_DO default with no keyword match (spot-check these): %', ambiguous;
  END IF;
END $$;

-- =============================================================================
-- STEP 16: Drop old Task columns/tables no longer used, and the enum/table
-- they depended on. The temp tables are dropped explicitly first since they
-- still hold columns typed "TaskType" (they'd otherwise block DROP TYPE
-- until the session/transaction ends).
-- =============================================================================

DROP TABLE "_task_migration";
DROP TABLE "_orig_tasks";
DROP TABLE "_placeholder_cases";

ALTER TABLE "tasks" DROP COLUMN "type";
ALTER TABLE "tasks" DROP COLUMN "parentTaskId";
ALTER TABLE "tasks" DROP COLUMN "workflowStageId";
ALTER TABLE "tasks" DROP COLUMN "sprintId";
ALTER TABLE "tasks" DROP COLUMN "milestoneId";
ALTER TABLE "tasks" DROP COLUMN "isCsoLabeled";
ALTER TABLE "tasks" DROP COLUMN "category";
ALTER TABLE "tasks" DROP COLUMN "projectId";

DROP TABLE "task_category_assignments";
DROP TABLE "workflow_stages";
DROP TYPE "TaskType";

-- =============================================================================
-- STEP 17: Widen Comment/Attachment to optionally reference a Case (both
-- tables are confirmed empty in live data -- no backfill needed).
-- =============================================================================

ALTER TABLE "comments" ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE "comments" ADD COLUMN "caseId" TEXT;
ALTER TABLE "comments" ADD CONSTRAINT "comments_exactly_one_parent" CHECK ((("taskId" IS NOT NULL)::int + ("caseId" IS NOT NULL)::int) = 1);
ALTER TABLE "comments" ADD CONSTRAINT "comments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "comments_caseId_idx" ON "comments"("caseId");

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_exactly_one_parent";
ALTER TABLE "attachments" ADD COLUMN "caseId" TEXT;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_exactly_one_parent" CHECK ((("caseId" IS NOT NULL)::int + ("taskId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int) = 1);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "attachments_caseId_idx" ON "attachments"("caseId");
