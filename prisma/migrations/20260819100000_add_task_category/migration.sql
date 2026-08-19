-- Hand-authored migration (not `prisma migrate dev`-generated) so the data
-- backfill below can run in the same migration as the schema change — see
-- docs/database-architecture.md "Constraints added by hand" for the
-- established pattern (e.g. the Customer entity migration).
--
-- Adds a nullable Functional/Technical tag to Task, plus an append-only
-- TaskCategoryAssignment history table so the UI can show "Functional
-- Assigned - Alice" followed by "Technical Assigned - Bob" once a task is
-- investigated and converted, instead of losing the earlier assignment.

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('FUNCTIONAL', 'TECHNICAL');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "category" "TaskCategory";

-- CreateTable
CREATE TABLE "task_category_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "assigneeId" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_category_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_category_assignments_taskId_idx" ON "task_category_assignments"("taskId");

-- AddForeignKey
ALTER TABLE "task_category_assignments" ADD CONSTRAINT "task_category_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_category_assignments" ADD CONSTRAINT "task_category_assignments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_category_assignments" ADD CONSTRAINT "task_category_assignments_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data backfill, part 1: CSO-labeled tasks require a category going forward
-- (enforced at the application layer — see TaskService). Existing
-- CSO-labeled tasks predate this rule, so default them to FUNCTIONAL; the
-- team can retag individual tasks Technical afterward from the UI.
UPDATE "tasks" SET "category" = 'FUNCTIONAL' WHERE "isCsoLabeled" = true AND "category" IS NULL;

-- Data backfill, part 2: seed one initial history row per backfilled task,
-- using its current first assignee (if any) and its creator as the
-- "changed by" actor, so the Assignment History panel isn't empty for tasks
-- that predate this feature.
INSERT INTO "task_category_assignments" ("id", "taskId", "category", "assigneeId", "changedById", "changedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  t."category",
  (SELECT ta."userId" FROM "task_assignees" ta WHERE ta."taskId" = t."id" ORDER BY ta."assignedAt" ASC LIMIT 1),
  t."createdById",
  t."createdAt"
FROM "tasks" t
WHERE t."isCsoLabeled" = true AND t."category" IS NOT NULL;
