import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../common/prisma-errors.js';
import type { CreateTaskTypeDto } from './dto/create-task-type.dto.js';
import type { UpdateTaskTypeDto } from './dto/update-task-type.dto.js';

@Injectable()
export class TaskTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const taskTypes = await this.prisma.taskType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
    return taskTypes.map((taskType, index) => ({
      id: String(taskType.id),
      name: taskType.name,
      order: index + 1,
      isActive: taskType.isActive,
    }));
  }

  async findOne(id: number) {
    const taskType = await this.prisma.taskType.findUnique({
      where: { id },
      include: {
        checklistSections: {
          include: { section: true },
          orderBy: { displayOrder: 'asc' },
        },
        _count: { select: { tasks: true } },
      },
    });
    if (!taskType) throw new NotFoundException(`Task type ${id} was not found`);
    return taskType;
  }

  async create(dto: CreateTaskTypeDto) {
    try {
      return await this.prisma.taskType.create({
        data: {
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: number, dto: UpdateTaskTypeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.taskType.update({
        where: { id },
        data: {
          ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() ?? null }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.taskType.delete({ where: { id } });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
}
