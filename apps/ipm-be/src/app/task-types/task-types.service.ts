import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { TaskComplexityLevel, TaskType } from '@sebsa-pm-tool/shared-models';
import {
  TaskComplexityLevel as PrismaComplexityLevel,
  TaskType as PrismaTaskType,
} from '@prisma/client';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';
import { CreateComplexityLevelDto } from './dto/create-complexity-level.dto';
import { UpdateComplexityLevelDto } from './dto/update-complexity-level.dto';

type TaskTypeWithLevels = PrismaTaskType & { complexityLevels: PrismaComplexityLevel[] };

@Injectable()
export class TaskTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<TaskType[]> {
    const types = await this.prisma.taskType.findMany({
      include: { complexityLevels: { orderBy: { order: 'asc' } } },
      orderBy: { order: 'asc' },
    });
    return types.map((type) => this.toTaskType(type));
  }

  async create(dto: CreateTaskTypeDto): Promise<TaskType> {
    const existing = await this.prisma.taskType.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A task type with this name already exists.');
    }

    const order = dto.order ?? (await this.nextOrder());

    const created = await this.prisma.taskType.create({
      data: {
        name: dto.name,
        description: dto.description,
        order,
        isActive: dto.isActive ?? true,
      },
      include: { complexityLevels: true },
    });
    return this.toTaskType(created);
  }

  async update(id: string, dto: UpdateTaskTypeDto): Promise<TaskType> {
    await this.getOrThrow(id);

    if (dto.name) {
      const nameTaken = await this.prisma.taskType.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (nameTaken) {
        throw new ConflictException('A task type with this name already exists.');
      }
    }

    const updated = await this.prisma.taskType.update({
      where: { id },
      data: dto,
      include: { complexityLevels: { orderBy: { order: 'asc' } } },
    });
    return this.toTaskType(updated);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);

    const tasksUsingType = await this.prisma.task.count({ where: { taskTypeId: id } });
    if (tasksUsingType > 0) {
      throw new ConflictException(`Cannot delete: ${tasksUsingType} task(s) still use this task type.`);
    }

    await this.prisma.taskType.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Complexity levels — nested under a TaskType
  // ---------------------------------------------------------------------------

  async createComplexityLevel(taskTypeId: string, dto: CreateComplexityLevelDto): Promise<TaskComplexityLevel> {
    await this.getOrThrow(taskTypeId);

    let order = dto.order;
    if (order === undefined || order === null) {
      const maxOrder = await this.prisma.taskComplexityLevel.aggregate({
        where: { taskTypeId },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? 0) + 1;
    }

    const nameTaken = await this.prisma.taskComplexityLevel.findFirst({
      where: { taskTypeId, name: dto.name },
    });
    if (nameTaken) {
      throw new ConflictException('A complexity level with this name already exists for this task type.');
    }

    const level = await this.prisma.taskComplexityLevel.create({
      data: { taskTypeId, name: dto.name, color: dto.color, order },
    });
    return this.toComplexityLevel(level);
  }

  async updateComplexityLevel(
    taskTypeId: string,
    levelId: string,
    dto: UpdateComplexityLevelDto,
  ): Promise<TaskComplexityLevel> {
    const existing = await this.getComplexityLevelOrThrow(taskTypeId, levelId);

    if (dto.name && dto.name !== existing.name) {
      const nameTaken = await this.prisma.taskComplexityLevel.findFirst({
        where: { taskTypeId, name: dto.name, id: { not: levelId } },
      });
      if (nameTaken) {
        throw new ConflictException('A complexity level with this name already exists for this task type.');
      }
    }

    const level = await this.prisma.taskComplexityLevel.update({
      where: { id: levelId },
      data: { name: dto.name, color: dto.color, order: dto.order },
    });
    return this.toComplexityLevel(level);
  }

  async removeComplexityLevel(taskTypeId: string, levelId: string): Promise<void> {
    await this.getComplexityLevelOrThrow(taskTypeId, levelId);

    const tasksUsingLevel = await this.prisma.task.count({ where: { complexityLevelId: levelId } });
    if (tasksUsingLevel > 0) {
      throw new ConflictException(`Cannot delete: ${tasksUsingLevel} task(s) still use this complexity level.`);
    }

    await this.prisma.taskComplexityLevel.delete({ where: { id: levelId } });
  }

  // ---------------------------------------------------------------------------
  // Lookups & mapping
  // ---------------------------------------------------------------------------

  private async nextOrder(): Promise<number> {
    const maxOrder = await this.prisma.taskType.aggregate({ _max: { order: true } });
    return (maxOrder._max.order ?? -1) + 1;
  }

  private async getOrThrow(id: string): Promise<PrismaTaskType> {
    const type = await this.prisma.taskType.findUnique({ where: { id } });
    if (!type) {
      throw new NotFoundException('Task type not found.');
    }
    return type;
  }

  private async getComplexityLevelOrThrow(
    taskTypeId: string,
    levelId: string,
  ): Promise<PrismaComplexityLevel> {
    const level = await this.prisma.taskComplexityLevel.findFirst({
      where: { id: levelId, taskTypeId },
    });
    if (!level) {
      throw new NotFoundException('Complexity level not found for this task type.');
    }
    return level;
  }

  private toTaskType(type: TaskTypeWithLevels): TaskType {
    return {
      id: type.id,
      name: type.name,
      description: type.description,
      order: type.order,
      isActive: type.isActive,
      complexityLevels: type.complexityLevels.map((level) => this.toComplexityLevel(level)),
      createdAt: type.createdAt.toISOString(),
      updatedAt: type.updatedAt.toISOString(),
    };
  }

  private toComplexityLevel(level: PrismaComplexityLevel): TaskComplexityLevel {
    return {
      id: level.id,
      taskTypeId: level.taskTypeId,
      name: level.name,
      color: level.color,
      order: level.order,
      createdAt: level.createdAt.toISOString(),
      updatedAt: level.updatedAt.toISOString(),
    };
  }
}
