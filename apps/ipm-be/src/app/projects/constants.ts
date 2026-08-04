/** FSD 5.2 "Default Task Workflow Statuses" — seeded for every new project. */
export const DEFAULT_WORKFLOW_STAGES = [
  'New',
  'In Analysis',
  'Development in Progress',
  'Developer Testing',
  'Code Review',
  'Review in Progress',
  'PR Merged',
  'Regression Testing',
  'Finished/Closed',
  'Cancelled',
] as const;

interface DefaultRoleDefinition {
  name: string;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  canManageMembers: boolean;
  canConfigureIntegrations: boolean;
  canManageWorkflow: boolean;
  isReadOnly: boolean;
}

/** FSD 4.2 default project-level roles — seeded for every new project. */
export const DEFAULT_PROJECT_ROLES: DefaultRoleDefinition[] = [
  {
    name: 'Project Owner',
    canCreateTask: true,
    canDeleteTask: true,
    canManageMembers: true,
    canConfigureIntegrations: true,
    canManageWorkflow: true,
    isReadOnly: false,
  },
  {
    name: 'Project Manager',
    canCreateTask: true,
    canDeleteTask: true,
    canManageMembers: true,
    canConfigureIntegrations: false,
    canManageWorkflow: true,
    isReadOnly: false,
  },
  {
    name: 'Member',
    canCreateTask: false,
    canDeleteTask: false,
    canManageMembers: false,
    canConfigureIntegrations: false,
    canManageWorkflow: false,
    isReadOnly: false,
  },
  {
    name: 'Viewer',
    canCreateTask: false,
    canDeleteTask: false,
    canManageMembers: false,
    canConfigureIntegrations: false,
    canManageWorkflow: false,
    isReadOnly: true,
  },
];

export const PROJECT_OWNER_ROLE_NAME = 'Project Owner';
