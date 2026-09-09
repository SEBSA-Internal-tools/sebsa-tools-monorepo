import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { SubtaskType } from '@sebsa-pm-tool/shared-models';
import { SubtaskType as PrismaSubtaskType } from '@prisma/client';
import { CreateSubtaskTypeDto } from './dto/create-subtask-type.dto';
import { UpdateSubtaskTypeDto } from './dto/update-subtask-type.dto';

@Injectable()
export class SubtaskTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SubtaskType[]> {
    const types = await this.prisma.subtaskType.findMany({ orderBy: { order: 'asc' } });
    return types.map((type) => this.toSubtaskType(type));
  }

  async create(dto: CreateSubtaskTypeDto): Promise<SubtaskType> {
    const existing = await this.prisma.subtaskType.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A subtask type with this name already exists.');
    }

    const order = dto.order ?? (await this.nextOrder());

    const created = await this.prisma.subtaskType.create({
      data: {
        name: dto.name,
        description: dto.description,
        order,
        isActive: dto.isActive ?? true,
      },
    });
    return this.toSubtaskType(created);
  }

  async update(id: string, dto: UpdateSubtaskTypeDto): Promise<SubtaskType> {
    await this.getOrThrow(id);

    if (dto.name) {
      const nameTaken = await this.prisma.subtaskType.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (nameTaken) {
        throw new ConflictException('A subtask type with this name already exists.');
      }
    }

    const updated = await this.prisma.subtaskType.update({ where: { id }, data: dto });
    return this.toSubtaskType(updated);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);

    const subtasksUsingType = await this.prisma.subtask.count({ where: { subtaskTypeId: id } });
    if (subtasksUsingType > 0) {
      throw new ConflictException(`Cannot delete: ${subtasksUsingType} subtask(s) still use this subtask type.`);
    }

    await this.prisma.subtaskType.delete({ where: { id } });
  }

  private async nextOrder(): Promise<number> {
    const maxOrder = await this.prisma.subtaskType.aggregate({ _max: { order: true } });
    return (maxOrder._max.order ?? -1) + 1;
  }

  private async getOrThrow(id: string): Promise<PrismaSubtaskType> {
    const type = await this.prisma.subtaskType.findUnique({ where: { id } });
    if (!type) {
      throw new NotFoundException('Subtask type not found.');
    }
    return type;
  }

  private toSubtaskType(type: PrismaSubtaskType): SubtaskType {
    return {
      id: type.id,
      name: type.name,
      description: type.description,
      order: type.order,
      isActive: type.isActive,
      createdAt: type.createdAt.toISOString(),
      updatedAt: type.updatedAt.toISOString(),
    };
  }
}
