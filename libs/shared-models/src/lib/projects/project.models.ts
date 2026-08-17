import { ProjectStatus, ProjectType } from './project-enums';
import { UserSummary } from '../users/user-summary.model';
import { PrivilegeGroup } from '../privilege-groups/privilege-group.models';

export interface ProjectRole {
  id: string;
  projectId: string;
  name: string;
  isSystemDefault: boolean;
  privilegeGroup: PrivilegeGroup;
}

export interface ProjectMemberSummary {
  id: string;
  projectId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
  user: Pick<UserSummary, 'id' | 'name' | 'email'>;
  role: Pick<ProjectRole, 'id' | 'name'> & { privilegeGroup: Pick<PrivilegeGroup, 'isReadOnly'> };
}

/** List-view shape — lighter than Project, no nested roles/stages. */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  type: ProjectType;
  customType: string | null;
  status: ProjectStatus;
  startDate: string | null;
  targetEndDate: string | null;
  color: string | null;
  createdBy: Pick<UserSummary, 'id' | 'name'>;
  memberCount: number;
  taskCount: number;
  isCsoProject: boolean;
  customerId: string;
  customer: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

/** Detail-view shape — includes the project's workflow stages. */
export interface Project extends ProjectSummary {
  workflowStages: { id: string; name: string; order: number }[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  type: ProjectType;
  customType?: string;
  startDate?: string;
  targetEndDate?: string;
  color?: string;
  isCsoProject?: boolean;
  customerId: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  type?: ProjectType;
  customType?: string;
  status?: ProjectStatus;
  startDate?: string;
  targetEndDate?: string;
  color?: string;
  isCsoProject?: boolean;
  customerId?: string;
}

export interface AddProjectMemberRequest {
  userId: string;
  roleId: string;
}

export interface UpdateProjectMemberRoleRequest {
  roleId: string;
}

export interface CreateRoleRequest {
  name: string;
  privilegeGroupId: string;
}

export interface UpdateRoleRequest {
  name?: string;
  privilegeGroupId?: string;
}
