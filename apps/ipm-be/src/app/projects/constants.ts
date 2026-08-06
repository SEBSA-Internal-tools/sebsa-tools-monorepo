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
  /** Looked up by name against the system-wide PrivilegeGroup library at
   * project-creation time (see PrivilegeGroupsService's default-group seed
   * in the super_admin_and_privilege_groups migration) — not embedded flags,
   * since permissions now live on the shared PrivilegeGroup, not the Role. */
  privilegeGroupName: string;
}

/** FSD 4.2 default project-level roles — seeded for every new project. */
export const DEFAULT_PROJECT_ROLES: DefaultRoleDefinition[] = [
  { name: 'Project Owner', privilegeGroupName: 'Owner Access' },
  { name: 'Project Manager', privilegeGroupName: 'Manager Access' },
  { name: 'Member', privilegeGroupName: 'Member Access' },
  { name: 'Viewer', privilegeGroupName: 'Read-Only Access' },
];

export const PROJECT_OWNER_ROLE_NAME = 'Project Owner';
