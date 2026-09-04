/** Global, Super-Admin-managed Subtask Type — separate list from TaskType,
 * a different level of the Case -> Task -> Subtask hierarchy. */
export interface SubtaskType {
  id: string;
  name: string;
  description: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubtaskTypeRequest {
  name: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateSubtaskTypeRequest {
  name?: string;
  description?: string;
  order?: number;
  isActive?: boolean;
}
