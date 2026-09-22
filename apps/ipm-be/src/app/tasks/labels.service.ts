import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, TaskLabel } from '@sebsa-pm-tool/shared-models';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { ProjectAccessService } from '../common/project-access.service';

/** deletedAt is internal bookkeeping — it must not reach the client. */
const labelSelect = {
  id: true,
  projectId: true,
  name: true,
  color: true,
  createdAt: true,
} as const;

@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async create(dto: CreateLabelDto, user: AuthUser): Promise<TaskLabel> {
    await this.assertProjectExists(dto.projectId);
    await this.access.assertCan(dto.projectId, user, 'canManageLabels');

    const existing = await this.prisma.label.findFirst({
      where: { projectId: dto.projectId, name: dto.name, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('A label with this name already exists in the project.');
    }

    return this.prisma.label.create({
      data: { projectId: dto.projectId, name: dto.name, color: dto.color },
      select: labelSelect,
    });
  }

  async findAllByProject(projectId: string, user: AuthUser): Promise<TaskLabel[]> {
    await this.access.assertVisible(projectId, user);
    return this.prisma.label.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: labelSelect,
    });
  }

  async findOne(id: string, user: AuthUser): Promise<TaskLabel> {
    const label = await this.getLabelOrThrow(id);
    await this.access.assertVisible(label.projectId, user);
    return label;
  }

  async update(id: string, dto: UpdateLabelDto, user: AuthUser): Promise<TaskLabel> {
    const label = await this.getLabelOrThrow(id);
    await this.access.assertCan(label.projectId, user, 'canManageLabels');

    return this.prisma.label.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
      select: labelSelect,
    });
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const label = await this.getLabelOrThrow(id);
    await this.access.assertCan(label.projectId, user, 'canManageLabels');

    // The label stays attached to its tasks and cases; filtering it out of
    // reads is what makes it disappear, so nothing loses its history.
    await this.prisma.label.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Label deleted successfully.' };
  }

  private async getLabelOrThrow(id: string) {
    const label = await this.prisma.label.findFirst({
      where: { id, deletedAt: null },
      select: labelSelect,
    });
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


}
