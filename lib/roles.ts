/**
 * Pure RBAC helpers with zero server-only imports — safe for both Client and Server Components.
 * lib/auth.ts (getCurrentUser, session resolution) re-exports these but also pulls in
 * next/headers, so Client Components must import from here directly, not from lib/auth.
 */
export type UserRole = 'super_admin' | 'admin' | 'cv_reviewer' | 'employee';

/** Super Admin has every Admin permission plus user/role management (docs/04-rbac-security.md). */
export function isAdminOrAbove(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Everyone who can review/manage CV templates and read profiles for review purposes. */
export function isReviewerOrAbove(role: UserRole): boolean {
  return isAdminOrAbove(role) || role === 'cv_reviewer';
}

/** Only Super Admin may grant/revoke Admin or Super Admin; Admin may grant/revoke CV Reviewer. */
export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') return targetRole === 'cv_reviewer' || targetRole === 'employee';
  return false;
}

/**
 * HR / assessment-admin privileges: manage the question bank and cycles, send and resend
 * invitations, and see every person's results. Exclusive to CV Reviewer and Super Admin -- Admin is
 * deliberately NOT included (docs/04-rbac-security.md §18). The database enforces the same rule
 * through is_assessment_manager() in the assessment_* RLS policies (migration 0031), so this is a
 * UI/route gate, not the only line of defence.
 */
export function canManageAssessments(role: UserRole): boolean {
  return role === 'cv_reviewer' || role === 'super_admin';
}
