CREATE INDEX "project_priorities_projectId_idx" ON "project_priorities"("projectId");

CREATE UNIQUE INDEX "project_priorities_projectId_name_key" ON "project_priorities"("projectId", "name");

CREATE UNIQUE INDEX "project_priorities_projectId_order_key" ON "project_priorities"("projectId", "order");

CREATE INDEX "tasks_priorityId_idx" ON "tasks"("priorityId");
