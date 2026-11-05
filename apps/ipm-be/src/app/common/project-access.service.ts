import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser } from '@sebsa-pm-tool/shared-models';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

/** The grants a project role can carry. Mirrors the boolean columns on
 * PrivilegeGroup, minus `isReadOnly`, which is a master deny rather than a
 * grant and is handled separately. */
export type ProjectPermission =
  | 'canCreateCase'
  | 'canEditCase'
  | 'canDeleteCase'
  | 'canCreateTask'
  | 'canEditTask'
  | 'canDeleteTask'
  | 'canComment'
  | 'canManageMembers'
  | 'canManageSprints'
  | 'canManageLabels'
  | 'canConfigureIntegrations';

/** Every grant, in one place. Anything iterating permissions (the escalation
 * guard, the API mappers) reads this so a new flag cannot be forgotten. */
export const PROJECT_PERMISSIONS: ProjectPermission[] = [
  'canCreateCase',
  'canEditCase',
  'canDeleteCase',
  'canCreateTask',
  'canEditTask',
  'canDeleteTask',
  'canComment',
  'canManageMembers',
  'canManageSprints',
  'canManageLabels',
  'canConfigureIntegrations',
];

/** Wording that reads as a sentence when refused, e.g. "You do not have
 * permission to delete cases in this project." */
const PERMISSION_PHRASES: Record<ProjectPermission, string> = {
  canCreateCase: 'create cases',
  canEditCase: 'edit cases',
  canDeleteCase: 'delete cases',
  canCreateTask: 'create tasks',
  canEditTask: 'edit tasks',
  canDeleteTask: 'delete tasks',
  canComment: 'comment',
  canManageMembers: 'manage members',
  canManageSprints: 'manage sprints',
  canManageLabels: 'manage labels',
  canConfigureIntegrations: 'configure integrations',
};

/**
 * The single place project permissions are decided.
 *
 * Every domain service used to carry its own copy of these checks, which is how
 * the two drifted apart: subtasks and comments ended up gated only by
 * `isReadOnly` while cases and tasks had granular flags. One implementation
 * means a new permission is enforced everywhere the moment it is used.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Can the user see this project at all. Executives read everything without
   * being members; system admins bypass membership entirely. */
  async assertVisible(projectId: string, user: AuthUser): Promise<void> {
    if (this.bypassesMembership(user)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  /** Can the user perform this action. System ADMIN/SUPER_ADMIN always can;
   * everyone else needs membership, a group that is not read-only, and the
   * specific grant. */
  async assertCan(
    projectId: string,
    user: AuthUser,
    permission: ProjectPermission,
  ): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });

    const group = membership?.role.privilegeGroup;
    if (!membership || !group || group.isReadOnly || !group[permission]) {
      throw new ForbiddenException(
        `You do not have permission to ${PERMISSION_PHRASES[permission]} in this project.`,
      );
    }
  }

  /** Assigning people to work. The edit grant is still required; on top of
   * that, only users who can manage members (project owners/managers, and
   * system admins) may assign or unassign OTHER people. Everyone else may
   * only add or remove themselves. */
  async assertCanAssign(
    projectId: string,
    user: AuthUser,
    targetUserIds: string[],
    editPermission: ProjectPermission,
  ): Promise<void> {
    await this.assertCan(projectId, user, editPermission);
    if (await this.can(projectId, user, 'canManageMembers')) return;
    if (targetUserIds.some((id) => id !== user.id)) {
      throw new ForbiddenException(
        'You can only assign or unassign yourself. Ask a project manager to assign others.',
      );
    }
  }

  /** Create/update form of the rule above, where the whole assignee list is
   * supplied. A user without member-management rights may only change their
   * own presence in it: the set of OTHER people must stay exactly as it is
   * (empty, for a create). */
  async assertCanSetAssignees(
    projectId: string,
    user: AuthUser,
    nextUserIds: string[],
    currentUserIds: string[] = [],
  ): Promise<void> {
    if (await this.can(projectId, user, 'canManageMembers')) return;
    const others = (ids: string[]) => new Set(ids.filter((id) => id !== user.id));
    const next = others(nextUserIds);
    const current = others(currentUserIds);
    const unchanged = next.size === current.size && [...next].every((id) => current.has(id));
    if (!unchanged) {
      throw new ForbiddenException(
        'You can only assign or unassign yourself. Ask a project manager to assign others.',
      );
    }
  }

  /** Non-throwing form, for shaping a response rather than rejecting it. */
  async can(
    projectId: string,
    user: AuthUser,
    permission: ProjectPermission,
  ): Promise<boolean> {
    try {
      await this.assertCan(projectId, user, permission);
      return true;
    } catch {
      return false;
    }
  }

  /** EXECUTIVE is a read-everything role, so it clears visibility but not any
   * write grant — those still go through assertCan. */
  private bypassesMembership(user: AuthUser): boolean {
    return ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';
  }
}
