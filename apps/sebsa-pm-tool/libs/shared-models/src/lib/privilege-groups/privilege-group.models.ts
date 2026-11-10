/** The grants a privilege group can carry, excluding `isReadOnly` — that is a
 * master deny rather than a grant, and is handled on its own. Kept in step with
 * PROJECT_PERMISSIONS in the backend's ProjectAccessService. */
export interface PrivilegeGrants {
  canCreateCase: boolean;
  canEditCase: boolean;
  canDeleteCase: boolean;
  /** Tasks and subtasks share these — a subtask is a unit of its task. */
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  canComment: boolean;
  canManageMembers: boolean;
  canManageSprints: boolean;
  canManageLabels: boolean;
  canConfigureIntegrations: boolean;
}

export interface PrivilegeGroup extends PrivilegeGrants {
  id: string;
  name: string;
  description: string | null;
  /** When true, every write is refused regardless of the grants above. */
  isReadOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrivilegeGroupRequest extends PrivilegeGrants {
  name: string;
  description?: string;
  isReadOnly: boolean;
}

export type UpdatePrivilegeGroupRequest = Partial<PrivilegeGrants> & {
  name?: string;
  description?: string;
  isReadOnly?: boolean;
};
