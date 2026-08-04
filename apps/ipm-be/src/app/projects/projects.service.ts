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
import {
  DEFAULT_PROJECT_ROLES,
  DEFAULT_WORKFLOW_STAGES,
  PROJECT_OWNER_ROLE_NAME,
} from './constants';

const memberInclude = {
  user: { select: { id: true, name: true, email: true } },
  role: { select: { id: true, name: true, isReadOnly: true } },
} satisfies Prisma.ProjectMemberInclude;

type MemberWithRelations = Prisma.ProjectMemberGetPayload<{ include: typeof memberInclude }>;

const membershipWithRoleInclude = {
  members: {
    include: { role: true },
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
        },
      });

      await tx.workflowStage.createMany({
        data: DEFAULT_WORKFLOW_STAGES.map((name, index) => ({
          projectId: project.id,
          name,
          order: index,
          isDefault: true,
        })),
      });

      const roles = await Promise.all(
        DEFAULT_PROJECT_ROLES.map((role) =>
          tx.role.create({
            data: { projectId: project.id, isSystemDefault: true, ...role },
          }),
        ),
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
    const isPrivileged = user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'EXECUTIVE';

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

    return this.prisma.role.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
    });
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

  private assertVisible(hasActiveMembership: boolean, user: AuthUser): void {
    const isPrivileged = user.systemRole === 'SYSTEM_ADMIN' || user.systemRole === 'EXECUTIVE';
    if (!isPrivileged && !hasActiveMembership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  private assertCanEdit(project: ProjectWithMembership, user: AuthUser): void {
    if (user.systemRole === 'SYSTEM_ADMIN') return;
    const membership = this.findMembership(project, user.id);
    if (!membership || membership.role.isReadOnly) {
      throw new ForbiddenException('You do not have permission to edit this project.');
    }
  }

  private assertCanManageMembers(project: ProjectWithMembership, user: AuthUser): void {
    if (user.systemRole === 'SYSTEM_ADMIN') return;
    const membership = this.findMembership(project, user.id);
    if (!membership || !membership.role.canManageMembers) {
      throw new ForbiddenException(
        'You do not have permission to manage members for this project.',
      );
    }
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
