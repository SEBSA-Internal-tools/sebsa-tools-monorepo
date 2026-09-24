import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateChecklistSectionDto } from './dto/create-checklist-section.dto.js';
import type { UpdateChecklistSectionDto } from './dto/update-checklist-section.dto.js';

const sectionInclude = {
  taskTypes: {
    include: { taskType: true },
    orderBy: { displayOrder: 'asc' },
  },
  questions: { orderBy: { displayOrder: 'asc' } },
} satisfies Prisma.ChecklistSectionInclude;

@Injectable()
export class ChecklistSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.checklistSection.findMany({
      include: sectionInclude,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const section = await this.prisma.checklistSection.findUnique({
      where: { id },
      include: sectionInclude,
    });
    if (!section)
      throw new NotFoundException(`Checklist section ${id} was not found`);
    return section;
  }

  async create(dto: CreateChecklistSectionDto) {
    await this.ensureTaskTypesExist(
      dto.taskTypes?.map(({ taskTypeId }) => taskTypeId),
    );
    try {
      return await this.prisma.checklistSection.create({
        data: {
          name: dto.name.trim(),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.taskTypes
            ? { taskTypes: {
                create: dto.taskTypes.map((mapping) => ({
                  taskTypeId: mapping.taskTypeId,
                  displayOrder: mapping.displayOrder,
                })),
              } }
            : {}),
        },
        include: sectionInclude,
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateChecklistSectionDto) {
    await this.findOne(id);
    await this.ensureTaskTypesExist(
      dto.taskTypes?.map(({ taskTypeId }) => taskTypeId),
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.checklistSection.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
        });
        if (dto.taskTypes !== undefined) {
          await tx.taskTypeChecklistSection.deleteMany({
            where: { sectionId: id },
          });
          if (dto.taskTypes.length) {
            await tx.taskTypeChecklistSection.createMany({
              data: dto.taskTypes.map((mapping) => ({
                sectionId: id,
                taskTypeId: mapping.taskTypeId,
                displayOrder: mapping.displayOrder,
              })),
            });
          }
        }
      });
      return await this.findOne(id);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.taskTypeChecklistSection.deleteMany({
          where: { sectionId: id },
        });
        await tx.checklistSection.delete({ where: { id } });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async ensureTaskTypesExist(taskTypeIds?: number[]): Promise<void> {
    if (!taskTypeIds?.length) return;
    const taskTypes = await this.prisma.taskType.findMany({
      where: { id: { in: taskTypeIds } },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      const found = new Set(taskTypes.map(({ id }) => id));
      const missing = taskTypeIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Task type(s) not found: ${missing.join(', ')}`,
      );
    }
  }
}
