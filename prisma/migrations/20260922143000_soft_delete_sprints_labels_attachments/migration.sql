-- Soft delete for sprints, labels and attachments.
--
-- These three carried history that a hard delete destroyed: a sprint's
-- planning record, a label's application across every task, and the record
-- that a file was ever uploaded. Join rows (assignees, task/case labels,
-- mentions) deliberately keep hard deletes — they are set membership, and the
-- code replaces the set wholesale.

ALTER TABLE "sprints" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "labels" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "attachments" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "sprints_projectId_deletedAt_idx" ON "sprints"("projectId", "deletedAt");
CREATE INDEX "labels_projectId_deletedAt_idx" ON "labels"("projectId", "deletedAt");

-- A deleted label must not keep its name reserved, so uniqueness becomes
-- partial. Prisma cannot express this, so the generated @@unique is dropped
-- and the index maintained here by hand.
DROP INDEX "labels_projectId_name_key";
CREATE UNIQUE INDEX "labels_projectId_name_key" ON "labels"("projectId", "name")
  WHERE "deletedAt" IS NULL;

-- Likewise the one-ACTIVE-sprint-per-project slot: a deleted active sprint
-- would otherwise block the project from ever starting another.
DROP INDEX "sprints_one_active_per_project";
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints"("projectId")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
