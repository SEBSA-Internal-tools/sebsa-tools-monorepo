import { SprintStatus } from './sprint-enums';

/** List-view shape — lighter than Sprint. */
export interface SprintSummary {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  /** Count of Cases in this sprint (sprint planning moved from Task to Case). */
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Detail-view shape — includes full sprint data. */
export interface Sprint extends SprintSummary {}

export interface CreateSprintRequest {
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
}

export interface UpdateSprintRequest {
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status?: SprintStatus;
}
