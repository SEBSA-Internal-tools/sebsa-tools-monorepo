import type { Role } from '@sdp/contracts';
import { WORKSPACE_ACCESS, WORKSPACE_ORDER, type WorkspaceKey } from '@/config/routes.ts';

/**
 * Workspace access rules — spec FL 2.1-02.
 *
 * Lives in `lib/` rather than inside the auth feature because three separate
 * layers need it: the route guard (app), the workspace chooser (home feature)
 * and the header. Putting it in one feature would force the others to reach
 * across a boundary; putting it here keeps the dependency graph acyclic.
 *
 * Pure functions with no React import, so the same rules can be unit-tested
 * directly and ported to the NestJS `PolicyGuard` in Phase 2.
 *
 * Roles are ADDITIVE. A user holding Developer + Reviewer sees both workspaces;
 * an Admin sees all three. There is no "highest role wins" ranking.
 */

export function canAccessWorkspace(roles: readonly Role[], workspace: WorkspaceKey): boolean {
  const allowed: readonly Role[] = WORKSPACE_ACCESS[workspace];
  return roles.some((role) => allowed.includes(role));
}

/** Workspaces the user may enter, in the order the home page lists them. */
export function accessibleWorkspaces(roles: readonly Role[]): WorkspaceKey[] {
  return WORKSPACE_ORDER.filter((workspace) => canAccessWorkspace(roles, workspace));
}

/**
 * True when the user has no workspace at all.
 *
 * Spec FL 2.1-01 treats "authenticated but no role configured" as an error
 * state rather than an empty dashboard, because it means the account was never
 * finished being set up.
 */
export function hasNoWorkspaceAccess(roles: readonly Role[]): boolean {
  return accessibleWorkspaces(roles).length === 0;
}
