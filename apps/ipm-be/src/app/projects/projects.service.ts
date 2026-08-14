import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import {
  AuthUser,
  Project,
  ProjectMemberSummary,
  ProjectRole,
  ProjectSummary,
} from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreateWorkflowStageDto } from './dto/create-workflow-stage.dto';
import {
  DEFAULT_PROJECT_ROLES,
  PROJECT_OWNER_ROLE_NAME,
} from './constants';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const memberInclude = {
  user: { select: { id: true, name: true, email: true } },
  role: { select: { id: true, name: true, privilegeGroup: { select: { isReadOnly: true } } } },
} satisfies Prisma.ProjectMemberInclude;

type MemberWithRelations = Prisma.ProjectMemberGetPayload<{ include: typeof memberInclude }>;

const membershipWithRoleInclude = {
  members: {
    include: { role: { include: { privilegeGroup: true } } },
  },
} satisfies Prisma.ProjectInclude;

type ProjectWithMembership = Prisma.ProjectGetPayload<{
  include: typeof membershipWithRoleInclude;
}>;

const projectDetailInclude = {
  createdBy: { select: { id: true, name: true } },
  workflowStages: {
    select: { id: true, name: true, order: true },
    orderBy: { order: 'asc' as const },
  },
  _count: { select: { tasks: true, members: { where: { deletedAt: null } } } },
} satisfies Prisma.ProjectInclude;

type ProjectWithDetail = Prisma.ProjectGetPayload<{ include: typeof projectDetailInclude }>;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto, creator: AuthUser): Promise<Project> {
    this.assertCanCreateProject(creator);

    const created = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          type: dto.type,
          customType: dto.customType,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : undefined,
          color: dto.color,
          createdById: creator.id,
          isCsoProject: dto.isCsoProject ?? false,
          customerName: dto.isCsoProject ? dto.customerName : undefined,
        },
      });

      // Every project is guaranteed to have at least one workflow stage so the
      // Kanban board is never in an empty state. The "Backlog" stage (order: 0,
      // isDefault: true) serves as the automatic landing column for all new tasks
      // that are created without an explicit workflowStageId.
      await tx.workflowStage.create({
        data: {
          projectId: project.id,
          name: 'Backlog',
          order: 0,
          isDefault: true,
        },
      });

      const defaultGroups = await tx.privilegeGroup.findMany({
        where: { name: { in: DEFAULT_PROJECT_ROLES.map((role) => role.privilegeGroupName) } },
      });
      const groupIdByName = new Map(defaultGroups.map((group) => [group.name, group.id]));

      const roles = await Promise.all(
        DEFAULT_PROJECT_ROLES.map((role) => {
          const privilegeGroupId = groupIdByName.get(role.privilegeGroupName);
          if (!privilegeGroupId) {
            throw new Error(`Default privilege group "${role.privilegeGroupName}" not found.`);
          }
          return tx.role.create({
            data: {
              projectId: project.id,
              name: role.name,
              isSystemDefault: true,
              privilegeGroupId,
            },
          });
        }),
      );

      const ownerRole = roles.find((role) => role.name === PROJECT_OWNER_ROLE_NAME);
      if (!ownerRole) {
        throw new Error('Default "Project Owner" role was not created.');
      }

      await tx.projectMember.create({
        data: { projectId: project.id, userId: creator.id, roleId: ownerRole.id },
      });

      return project;
    });

    return this.findOne(created.id, creator);
  }

  async findAll(user: AuthUser): Promise<ProjectSummary[]> {
    const isPrivileged = ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';

    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(isPrivileged ? {} : { members: { some: { userId: user.id, deletedAt: null } } }),
      },
      include: projectDetailInclude,
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((project) => this.toProjectSummary(project));
  }

  async findOne(id: string, user: AuthUser): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: projectDetailInclude,
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const membership = await this.getActiveMembership(id, user.id);
    this.assertVisible(!!membership, user);

    return this.toProject(project);
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthUser): Promise<Project> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanEdit(project, user);

    const mergedIsCsoProject = dto.isCsoProject ?? project.isCsoProject;
    const mergedCustomerName =
      dto.customerName !== undefined ? dto.customerName : project.customerName;
    if (mergedIsCsoProject && !mergedCustomerName) {
      throw new BadRequestException('A CSO project must have a customer name.');
    }

    await this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        customType: dto.customType,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetEndDate: dto.targetEndDate ? new Date(dto.targetEndDate) : undefined,
        color: dto.color,
        isCsoProject: dto.isCsoProject,
        customerName: dto.customerName,
      },
    });

    return this.findOne(id, user);
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);

    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getRoles(id: string, user: AuthUser): Promise<ProjectRole[]> {
    const project = await this.loadProjectWithMembership(id);
    const membership = this.findMembership(project, user.id);
    this.assertVisible(!!membership, user);

    const roles = await this.prisma.role.findMany({
      where: { projectId: id },
      include: { privilegeGroup: true },
      orderBy: { createdAt: 'asc' },
    });
    return roles.map((role) => this.toProjectRole(role));
  }

  async createRole(id: string, dto: CreateRoleDto, user: AuthUser): Promise<ProjectRole> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);
    const candidateGroup = await this.getPrivilegeGroupOrThrow(dto.privilegeGroupId);
    this.assertNoPrivilegeEscalation(project, user, candidateGroup);

    const role = await this.prisma.role.create({
      data: {
        projectId: id,
        name: dto.name,
        isSystemDefault: false,
        privilegeGroupId: dto.privilegeGroupId,
      },
      include: { privilegeGroup: true },
    });
    return this.toProjectRole(role);
  }

  async updateRole(
    id: string,
    roleId: string,
    dto: UpdateRoleDto,
    user: AuthUser,
  ): Promise<ProjectRole> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);
    await this.assertRoleBelongsToProject(id, roleId);

    if (dto.privilegeGroupId) {
      const candidateGroup = await this.getPrivilegeGroupOrThrow(dto.privilegeGroupId);
      this.assertNoPrivilegeEscalation(project, user, candidateGroup);
    }

    const role = await this.prisma.role.update({
      where: { id: roleId },
      data: { name: dto.name, privilegeGroupId: dto.privilegeGroupId },
      include: { privilegeGroup: true },
    });
    return this.toProjectRole(role);
  }

  async getMembers(id: string, user: AuthUser): Promise<ProjectMemberSummary[]> {
    const project = await this.loadProjectWithMembership(id);
    const membership = this.findMembership(project, user.id);
    this.assertVisible(!!membership, user);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId: id, deletedAt: null },
      include: memberInclude,
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((member) => this.toProjectMemberSummary(member));
  }

  async addMember(
    id: string,
    dto: AddMemberDto,
    user: AuthUser,
  ): Promise<ProjectMemberSummary> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);
    await this.assertRoleBelongsToProject(id, dto.roleId);
    await this.assertUserExists(dto.userId);

    const existing = await this.prisma.projectMember.findFirst({
      where: { projectId: id, userId: dto.userId },
    });

    if (existing) {
      const reactivated = await this.prisma.projectMember.update({
        where: { id: existing.id },
        data: { roleId: dto.roleId, deletedAt: null, joinedAt: new Date() },
        include: memberInclude,
      });
      return this.toProjectMemberSummary(reactivated);
    }

    try {
      const created = await this.prisma.projectMember.create({
        data: { projectId: id, userId: dto.userId, roleId: dto.roleId },
        include: memberInclude,
      });
      return this.toProjectMemberSummary(created);
    } catch (error) {
      // Race: another request inserted the same (projectId, userId) pair between our
      // findFirst and this create. The DB's hand-written partial unique index (see
      // prisma/schema.prisma comment on ProjectMember) catches it as a Postgres 23505,
      // which Prisma surfaces as P2002 even though the index isn't in the Prisma DMMF.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raceRow = await this.prisma.projectMember.findFirstOrThrow({
          where: { projectId: id, userId: dto.userId },
        });
        const reactivated = await this.prisma.projectMember.update({
          where: { id: raceRow.id },
          data: { roleId: dto.roleId, deletedAt: null, joinedAt: new Date() },
          include: memberInclude,
        });
        return this.toProjectMemberSummary(reactivated);
      }
      throw error;
    }
  }

  async updateMemberRole(
    id: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
    user: AuthUser,
  ): Promise<ProjectMemberSummary> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);
    await this.assertRoleBelongsToProject(id, dto.roleId);
    await this.getActiveMemberOrThrow(id, memberId);

    const updated = await this.prisma.projectMember.update({
      where: { id: memberId },
      data: { roleId: dto.roleId },
      include: memberInclude,
    });
    return this.toProjectMemberSummary(updated);
  }

  async removeMember(id: string, memberId: string, user: AuthUser): Promise<void> {
    const project = await this.loadProjectWithMembership(id);
    this.assertCanManageMembers(project, user);
    await this.getActiveMemberOrThrow(id, memberId);

    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: { deletedAt: new Date() },
    });
  }

  async getWorkflowStages(
    projectId: string,
    user: AuthUser,
  ): Promise<{ id: string; name: string; order: number }[]> {
    const project = await this.loadProjectWithMembership(projectId);
    const membership = this.findMembership(project, user.id);
    this.assertVisible(!!membership, user);

    const stages = await this.prisma.workflowStage.findMany({
      where: { projectId },
      select: { id: true, name: true, order: true },
      orderBy: { order: 'asc' },
    });
    return stages;
  }

  async createWorkflowStage(
    projectId: string,
    dto: CreateWorkflowStageDto,
    user: AuthUser,
  ): Promise<{ id: string; name: string; order: number }> {
    const project = await this.loadProjectWithMembership(projectId);
    this.assertCanManageMembers(project, user);

    // Auto-calculate order if not provided
    let order = dto.order;
    if (order === undefined || order === null) {
      const maxOrder = await this.prisma.workflowStage.aggregate({
        where: { projectId },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

    // Validate unique stage name per project
    const existing = await this.prisma.workflowStage.findFirst({
      where: { projectId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(
        `A workflow stage with the name "${dto.name}" already exists in this project.`,
      );
    }

    const stage = await this.prisma.workflowStage.create({
      data: {
        projectId,
        name: dto.name,
        order,
        isDefault: false,
      },
      select: { id: true, name: true, order: true },
    });

    return stage;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async loadProjectWithMembership(id: string): Promise<ProjectWithMembership> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: membershipWithRoleInclude,
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  private findMembership(project: ProjectWithMembership, userId: string) {
    return project.members.find((member) => member.userId === userId && !member.deletedAt) ?? null;
  }

  private async getActiveMembership(projectId: string, userId: string) {
    return this.prisma.projectMember.findFirst({
      where: { projectId, userId, deletedAt: null },
      include: { role: true },
    });
  }

  private async getActiveMemberOrThrow(projectId: string, memberId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, deletedAt: null },
    });
    if (!member) {
      throw new NotFoundException('Membership not found.');
    }
    return member;
  }

  private async assertRoleBelongsToProject(projectId: string, roleId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, projectId } });
    if (!role) {
      throw new BadRequestException('Role does not belong to this project.');
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
    });
    if (!user) {
      throw new BadRequestException('User not found or inactive.');
    }
  }

  /** Project creation happens before any project membership exists, so
   * there's no Role/PrivilegeGroup to check yet — this is a SystemRole-level
   * gate, not a PrivilegeGroup one. Restricted to the same tiers that
   * already bypass every other project-level check (ADMIN_SYSTEM_ROLES),
   * rather than inventing a separate concept. EXECUTIVE is deliberately
   * excluded — that tier is read-only visibility across projects, not a
   * management capability. */
  private assertCanCreateProject(user: AuthUser): void {
    if (!ADMIN_SYSTEM_ROLES.includes(user.systemRole)) {
      throw new ForbiddenException('You do not have permission to create projects.');
    }
  }

  private assertVisible(hasActiveMembership: boolean, user: AuthUser): void {
    const isPrivileged = ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';
    if (!isPrivileged && !hasActiveMembership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  private assertCanEdit(project: ProjectWithMembership, user: AuthUser): void {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;
    const membership = this.findMembership(project, user.id);
    if (!membership || membership.role.privilegeGroup.isReadOnly) {
      throw new ForbiddenException('You do not have permission to edit this project.');
    }
  }

  private assertCanManageMembers(project: ProjectWithMembership, user: AuthUser): void {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;
    const membership = this.findMembership(project, user.id);
    if (!membership || !membership.role.privilegeGroup.canManageMembers) {
      throw new ForbiddenException(
        'You do not have permission to manage members for this project.',
      );
    }
  }

  /** Called only when a non-system-admin is trying to grant a role a
   * privilege group. Prevents them handing out more power than their own
   * current group on this project has — e.g. a Project Manager repointing
   * their own role to a stronger group. System admins bypass entirely
   * (same pattern as assertCanEdit/assertCanManageMembers). */
  private assertNoPrivilegeEscalation(
    project: ProjectWithMembership,
    user: AuthUser,
    candidateGroup: Prisma.PrivilegeGroupGetPayload<object>,
  ): void {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = this.findMembership(project, user.id);
    const myGroup = membership?.role.privilegeGroup;
    if (!myGroup) {
      throw new ForbiddenException('You do not have permission to assign privilege groups.');
    }

    const grantsMoreThanIHave =
      (candidateGroup.canCreateTask && !myGroup.canCreateTask) ||
      (candidateGroup.canDeleteTask && !myGroup.canDeleteTask) ||
      (candidateGroup.canManageMembers && !myGroup.canManageMembers) ||
      (candidateGroup.canConfigureIntegrations && !myGroup.canConfigureIntegrations) ||
      (candidateGroup.canManageWorkflow && !myGroup.canManageWorkflow) ||
      (myGroup.isReadOnly && !candidateGroup.isReadOnly);

    if (grantsMoreThanIHave) {
      throw new ForbiddenException(
        'You cannot assign a privilege group with more power than your own.',
      );
    }
  }

  private async getPrivilegeGroupOrThrow(id: string) {
    const group = await this.prisma.privilegeGroup.findUnique({ where: { id } });
    if (!group) {
      throw new BadRequestException('Privilege group not found.');
    }
    return group;
  }

  private toProjectRole(
    role: Prisma.RoleGetPayload<{ include: { privilegeGroup: true } }>,
  ): ProjectRole {
    return {
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      isSystemDefault: role.isSystemDefault,
      privilegeGroup: {
        id: role.privilegeGroup.id,
        name: role.privilegeGroup.name,
        description: role.privilegeGroup.description,
        canCreateTask: role.privilegeGroup.canCreateTask,
        canDeleteTask: role.privilegeGroup.canDeleteTask,
        canManageMembers: role.privilegeGroup.canManageMembers,
        canConfigureIntegrations: role.privilegeGroup.canConfigureIntegrations,
        canManageWorkflow: role.privilegeGroup.canManageWorkflow,
        isReadOnly: role.privilegeGroup.isReadOnly,
        createdAt: role.privilegeGroup.createdAt.toISOString(),
        updatedAt: role.privilegeGroup.updatedAt.toISOString(),
      },
    };
  }

  private toProjectSummary(project: ProjectWithDetail): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      customType: project.customType,
      status: project.status,
      startDate: project.startDate ? project.startDate.toISOString() : null,
      targetEndDate: project.targetEndDate ? project.targetEndDate.toISOString() : null,
      color: project.color,
      createdBy: project.createdBy,
      memberCount: project._count.members,
      taskCount: project._count.tasks,
      isCsoProject: project.isCsoProject,
      customerName: project.customerName,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private toProject(project: ProjectWithDetail): Project {
    return {
      ...this.toProjectSummary(project),
      workflowStages: project.workflowStages,
    };
  }

  private toProjectMemberSummary(member: MemberWithRelations): ProjectMemberSummary {
    return {
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      roleId: member.roleId,
      joinedAt: member.joinedAt.toISOString(),
      user: member.user,
      role: member.role,
    };
  }
}
