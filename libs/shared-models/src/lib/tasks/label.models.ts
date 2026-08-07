export interface TaskLabel {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
}

export interface CreateLabelRequest {
  projectId: string;
  name: string;
  color?: string;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: string;
}
