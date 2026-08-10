-- Hand-authored migration (not Prisma-generated): `prisma migrate dev` refuses
-- this diff non-interactively (a new UNIQUE constraint on an existing table
-- needs confirmation). Adds a human-readable, auto-incrementing display
-- number to Project and Task, separate from their UUID primary keys — the
-- UUIDs remain the only thing used for foreign keys / referential integrity.
-- Existing rows are backfilled in createdAt order so numbering reflects
-- actual creation order, not arbitrary physical row order.

-- =============================================================================
-- Project.projectNumber
-- =============================================================================

CREATE SEQUENCE "projects_projectNumber_seq" AS INTEGER START 1;

ALTER TABLE "projects" ADD COLUMN "projectNumber" INTEGER;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "projects"
)
UPDATE "projects" p
SET "projectNumber" = ordered.rn
FROM ordered
WHERE p."id" = ordered."id";

SELECT setval('"projects_projectNumber_seq"', COALESCE((SELECT MAX("projectNumber") FROM "projects"), 0) + 1, false);

ALTER TABLE "projects" ALTER COLUMN "projectNumber" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "projectNumber" SET DEFAULT nextval('"projects_projectNumber_seq"');
ALTER SEQUENCE "projects_projectNumber_seq" OWNED BY "projects"."projectNumber";

CREATE UNIQUE INDEX "projects_projectNumber_key" ON "projects"("projectNumber");

-- =============================================================================
-- Task.taskNumber
-- =============================================================================

CREATE SEQUENCE "tasks_taskNumber_seq" AS INTEGER START 1;

ALTER TABLE "tasks" ADD COLUMN "taskNumber" INTEGER;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "tasks"
)
UPDATE "tasks" t
SET "taskNumber" = ordered.rn
FROM ordered
WHERE t."id" = ordered."id";

SELECT setval('"tasks_taskNumber_seq"', COALESCE((SELECT MAX("taskNumber") FROM "tasks"), 0) + 1, false);

ALTER TABLE "tasks" ALTER COLUMN "taskNumber" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "taskNumber" SET DEFAULT nextval('"tasks_taskNumber_seq"');
ALTER SEQUENCE "tasks_taskNumber_seq" OWNED BY "tasks"."taskNumber";

CREATE UNIQUE INDEX "tasks_taskNumber_key" ON "tasks"("taskNumber");
