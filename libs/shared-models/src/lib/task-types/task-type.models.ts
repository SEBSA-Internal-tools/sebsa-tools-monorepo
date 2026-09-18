/** One rung on a task type's complexity scale. Stored as a child entry of its
 * task type in the shared configuration table. */
export interface TaskComplexityLevel {
  id: string;
  taskTypeId: string;
  name: string;
  color: string | null;
  order: number;
}

/** A task type as the task screens consume it — a view over the `TASK_TYPE`
 * entries in the shared configuration table. Managed from System ->
 * Configuration (or the CSO tab), not through its own endpoints. */
export interface TaskType {
  id: string;
  name: string;
  description: string | null;
  order: number;
  isActive: boolean;
}
