-- Task types, subtask types and complexity levels move into config_options so
-- they are scoped (GLOBAL vs CSO) and managed from the same screen as every
-- other list.
--
-- Existing rows are carried across under their ORIGINAL ids. That is what makes
-- this safe on a populated database: tasks.taskTypeId, tasks.complexityLevelId
-- and subtasks.subtaskTypeId keep the values they already hold, so the new
-- foreign keys attach without any remapping and no work item loses its type.

-- CreateColumn: children (complexity levels) hang off their task type.
ALTER TABLE "config_options" ADD COLUMN "parentId" TEXT;

-- Carry task types across, preserving id.
INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isActive","isDefault","isSystem","parentId","updatedAt")
SELECT
  tt.id,
  'TASK_TYPE'::"ConfigKind",
  'GLOBAL'::"ConfigScope",
  upper(regexp_replace(tt.name, '[^a-zA-Z0-9]+', '_', 'g')),
  tt.name,
  NULL,
  tt."order",
  tt."isActive",
  false,
  false,
  NULL,
  NOW()
FROM "task_types" tt;

-- Carry subtask types across, preserving id.
INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isActive","isDefault","isSystem","parentId","updatedAt")
SELECT
  st.id,
  'SUBTASK_TYPE'::"ConfigKind",
  'GLOBAL'::"ConfigScope",
  upper(regexp_replace(st.name, '[^a-zA-Z0-9]+', '_', 'g')),
  st.name,
  NULL,
  st."order",
  st."isActive",
  false,
  false,
  NULL,
  NOW()
FROM "subtask_types" st;

-- Carry complexity levels across as children of their task type. The key is
-- prefixed with the parent's name because (kind, scope, key) is unique across
-- the whole list, and two task types may each have a level called "Basic".
INSERT INTO "config_options"
  ("id","kind","scope","key","label","color","order","isActive","isDefault","isSystem","parentId","updatedAt")
SELECT
  cl.id,
  'COMPLEXITY_LEVEL'::"ConfigKind",
  'GLOBAL'::"ConfigScope",
  upper(regexp_replace(tt.name || '_' || cl.name, '[^a-zA-Z0-9]+', '_', 'g')),
  cl.name,
  cl.color,
  cl."order",
  true,
  false,
  false,
  cl."taskTypeId",
  NOW()
FROM "task_complexity_levels" cl
JOIN "task_types" tt ON tt.id = cl."taskTypeId";

-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_subtaskTypeId_fkey";

-- DropForeignKey
ALTER TABLE "task_complexity_levels" DROP CONSTRAINT "task_complexity_levels_taskTypeId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_complexityLevelId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_taskTypeId_fkey";

-- DropTable
DROP TABLE "subtask_types";

-- DropTable
DROP TABLE "task_complexity_levels";

-- DropTable
DROP TABLE "task_types";

-- Any reference that somehow did not carry across is cleared rather than left
-- dangling, so the foreign keys below can be created.
UPDATE "tasks" SET "taskTypeId" = NULL
WHERE "taskTypeId" IS NOT NULL
  AND "taskTypeId" NOT IN (SELECT id FROM "config_options");

UPDATE "tasks" SET "complexityLevelId" = NULL
WHERE "complexityLevelId" IS NOT NULL
  AND "complexityLevelId" NOT IN (SELECT id FROM "config_options");

UPDATE "subtasks" SET "subtaskTypeId" = NULL
WHERE "subtaskTypeId" IS NOT NULL
  AND "subtaskTypeId" NOT IN (SELECT id FROM "config_options");

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
