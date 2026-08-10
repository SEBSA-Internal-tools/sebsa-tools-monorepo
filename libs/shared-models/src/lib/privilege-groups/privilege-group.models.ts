export interface PrivilegeGroup {
  id: string;
  name: string;
  description: string | null;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  canManageMembers: boolean;
  canConfigureIntegrations: boolean;
  canManageWorkflow: boolean;
  isReadOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrivilegeGroupRequest {
  name: string;
  description?: string;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  canManageMembers: boolean;
  canConfigureIntegrations: boolean;
  canManageWorkflow: boolean;
  isReadOnly: boolean;
}

export interface UpdatePrivilegeGroupRequest {
  name?: string;
  description?: string;
  canCreateTask?: boolean;
  canDeleteTask?: boolean;
  canManageMembers?: boolean;
  canConfigureIntegrations?: boolean;
  canManageWorkflow?: boolean;
  isReadOnly?: boolean;
}
