/** One rung on a TaskType's own 1-5 complexity scale (Basic..Very High by
 * default, but Super-Admin editable — name/color/order can all change). */
export interface TaskComplexityLevel {
  id: string;
  taskTypeId: string;
  name: string;
  color: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Global, Super-Admin-managed Task Type (e.g. "Support Task", "Development
 * Task", "Bug"). Each type owns its own complexity scale. */
export interface TaskType {
  id: string;
  name: string;
  description: string | null;
  order: number;
  isActive: boolean;
  complexityLevels: TaskComplexityLevel[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskTypeRequest {
  name: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateTaskTypeRequest {
  name?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export interface CreateTaskComplexityLevelRequest {
  name: string;
  color?: string;
  order?: number;
}

export interface UpdateTaskComplexityLevelRequest {
  name?: string;
  color?: string;
  order?: number;
}
