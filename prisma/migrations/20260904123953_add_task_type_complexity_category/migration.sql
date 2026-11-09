-- AlterTable
ALTER TABLE "subtasks" ADD COLUMN     "subtaskTypeId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "category" "TaskCategory",
ADD COLUMN     "complexityLevelId" TEXT,
ADD COLUMN     "taskTypeId" TEXT;

-- CreateTable
CREATE TABLE "task_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_complexity_levels" (
    "id" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_complexity_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtask_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtask_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_types_name_key" ON "task_types"("name");

-- CreateIndex
CREATE INDEX "task_complexity_levels_taskTypeId_idx" ON "task_complexity_levels"("taskTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "task_complexity_levels_taskTypeId_name_key" ON "task_complexity_levels"("taskTypeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "task_complexity_levels_taskTypeId_order_key" ON "task_complexity_levels"("taskTypeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "subtask_types_name_key" ON "subtask_types"("name");

-- CreateIndex
CREATE INDEX "subtasks_subtaskTypeId_idx" ON "subtasks"("subtaskTypeId");

-- CreateIndex
CREATE INDEX "tasks_taskTypeId_idx" ON "tasks"("taskTypeId");

-- CreateIndex
CREATE INDEX "tasks_complexityLevelId_idx" ON "tasks"("complexityLevelId");

-- AddForeignKey
ALTER TABLE "task_complexity_levels" ADD CONSTRAINT "task_complexity_levels_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "task_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_complexityLevelId_fkey" FOREIGN KEY ("complexityLevelId") REFERENCES "task_complexity_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_subtaskTypeId_fkey" FOREIGN KEY ("subtaskTypeId") REFERENCES "subtask_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
