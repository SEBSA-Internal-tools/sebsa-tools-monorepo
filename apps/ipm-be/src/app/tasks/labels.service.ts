import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, TaskLabel } from '@sebsa-pm-tool/shared-models';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLabelDto, user: AuthUser): Promise<TaskLabel> {
    await this.assertProjectExists(dto.projectId);
    await this.assertCanManageLabels(dto.projectId, user);

    const existing = await this.prisma.label.findUnique({
      where: { projectId_name: { projectId: dto.projectId, name: dto.name } },
    });
    if (existing) {
      throw new BadRequestException('A label with this name already exists in the project.');
    }

    return this.prisma.label.create({
      data: { projectId: dto.projectId, name: dto.name, color: dto.color },
    });
  }

  async findAllByProject(projectId: string, user: AuthUser): Promise<TaskLabel[]> {
    await this.assertVisible(projectId, user);
    return this.prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string, user: AuthUser): Promise<TaskLabel> {
    const label = await this.getLabelOrThrow(id);
    await this.assertVisible(label.projectId, user);
    return label;
  }

  async update(id: string, dto: UpdateLabelDto, user: AuthUser): Promise<TaskLabel> {
    const label = await this.getLabelOrThrow(id);
    await this.assertCanManageLabels(label.projectId, user);

    return this.prisma.label.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
    });
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const label = await this.getLabelOrThrow(id);
    await this.assertCanManageLabels(label.projectId, user);

    await this.prisma.label.delete({ where: { id } });
    return { message: 'Label deleted successfully.' };
  }

  private async getLabelOrThrow(id: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) {
      throw new NotFoundException('Label not found.');
    }
    return label;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
  }

  private async assertVisible(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE') return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  /** Labels are project configuration (like workflow stages), not an
   * individual-task action — gated on canManageWorkflow rather than
   * canCreateTask so rank-and-file members can't redefine the project's tag
   * vocabulary. The FSD doesn't specify who manages labels; this mirrors
   * how Owner/Manager (canManageWorkflow: true) vs. Member/Viewer (false)
   * already splits other project-configuration actions. */
  private async assertCanManageLabels(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
    if (!membership || !membership.role.privilegeGroup.canManageWorkflow) {
      throw new ForbiddenException('You do not have permission to manage labels for this project.');
    }
  }
}
