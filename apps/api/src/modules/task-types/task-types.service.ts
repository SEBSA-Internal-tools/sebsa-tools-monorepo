import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
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
      const name = dto.name.trim();
      await this.ensureNameAvailable(name);
      const created = await this.prisma.$transaction(async (tx) => {
        const code = dto.code?.trim().toUpperCase() ?? (await this.nextCode(tx, name));
        return tx.taskType.create({
          data: {
            code,
            name,
            description: dto.description?.trim() ?? null,
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
        });
      });
      return await this.findRecord(created.id);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: number, dto: UpdateTaskTypeDto) {
    await this.findOne(id);
    try {
      if (dto.name !== undefined) await this.ensureNameAvailable(dto.name.trim(), id);
      const updated = await this.prisma.taskType.update({
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
      return await this.findRecord(updated.id);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findOne(id);
    if (existing._count.tasks > 0) {
      throw new ConflictException(
        'This task type is used by existing tasks. Deactivate it instead.',
      );
    }
    if (existing.checklistSections.length > 0) {
      throw new ConflictException(
        'Checklist categories still target this task type. Remove it from them first.',
      );
    }
    try {
      await this.prisma.taskType.delete({ where: { id } });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async findRecord(id: number) {
    const record = (await this.findAll(true)).find((taskType) => taskType.id === String(id));
    if (!record) throw new NotFoundException(`Task type ${id} was not found`);
    return record;
  }

  private async ensureNameAvailable(name: string, excludingId?: number): Promise<void> {
    const duplicate = await this.prisma.taskType.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludingId === undefined ? {} : { id: { not: excludingId } }),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A task type with that name already exists.');
  }

  private async nextCode(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = (name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'TASK_TYPE')
      .slice(0, 50)
      .toUpperCase();
    const existing = await tx.taskType.findMany({
      where: { code: { startsWith: base } },
      select: { code: true },
    });
    const used = new Set(existing.map(({ code }) => code));
    if (!used.has(base)) return base;

    let suffix = 2;
    let candidate = `${base.slice(0, 50 - String(suffix).length)}${String(suffix)}`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${base.slice(0, 50 - String(suffix).length)}${String(suffix)}`;
    }
    return candidate;
  }
}
