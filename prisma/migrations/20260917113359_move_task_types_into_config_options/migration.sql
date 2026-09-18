-- Task types, subtask types and complexity levels move into config_options so
-- they are scoped (GLOBAL vs CSO) and managed from the same screen as every
-- other list. All three tables were empty when this was written -- 0 task_types,
-- 0 subtask_types, 0 task_complexity_levels, and no task or subtask referenced
-- one -- so the drops below lose nothing.
--
-- Complexity levels become child rows via config_options.parentId rather than a
-- table of their own.

/*
  Warnings:

  - You are about to drop the `subtask_types` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_complexity_levels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_types` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_subtaskTypeId_fkey";

-- DropForeignKey
ALTER TABLE "task_complexity_levels" DROP CONSTRAINT "task_complexity_levels_taskTypeId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_complexityLevelId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_taskTypeId_fkey";

-- AlterTable
ALTER TABLE "config_options" ADD COLUMN     "parentId" TEXT;

-- DropTable
DROP TABLE "subtask_types";

-- DropTable
DROP TABLE "task_complexity_levels";

-- DropTable
DROP TABLE "task_types";

-- CreateIndex
CREATE INDEX "config_options_parentId_idx" ON "config_options"("parentId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_complexityLevelId_fkey" FOREIGN KEY ("complexityLevelId") REFERENCES "config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_subtaskTypeId_fkey" FOREIGN KEY ("subtaskTypeId") REFERENCES "config_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_options" ADD CONSTRAINT "config_options_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "config_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
