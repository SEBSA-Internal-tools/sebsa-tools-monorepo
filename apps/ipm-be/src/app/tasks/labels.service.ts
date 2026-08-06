import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLabelDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const existing = await this.prisma.label.findUnique({
      where: {
        projectId_name: {
          projectId: dto.projectId,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('A label with this name already exists in the project.');
    }

    return this.prisma.label.create({
      data: {
        projectId: dto.projectId,
        name: dto.name,
        color: dto.color,
      },
    });
  }

  async findAllByProject(projectId: string) {
    return this.prisma.label.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const label = await this.prisma.label.findUnique({
      where: { id },
    });
    if (!label) {
      throw new NotFoundException('Label not found.');
    }
    return label;
  }

  async update(id: string, dto: UpdateLabelDto) {
    await this.findOne(id);
    return this.prisma.label.update({
      where: { id },
      data: {
        name: dto.name,
        color: dto.color,
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.label.delete({
      where: { id },
    });
    return { message: 'Label deleted successfully.' };
  }
}
