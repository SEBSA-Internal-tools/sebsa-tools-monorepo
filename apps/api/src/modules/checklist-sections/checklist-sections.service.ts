import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateChecklistSectionDto } from './dto/create-checklist-section.dto.js';
import type { UpdateChecklistSectionDto } from './dto/update-checklist-section.dto.js';
import type { CreateChecklistCategoryDto } from './dto/create-checklist-category.dto.js';
import type { UpdateChecklistCategoryDto } from './dto/update-checklist-category.dto.js';

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
    if (!section) throw new NotFoundException(`Checklist section ${id} was not found`);
    return section;
  }

  async create(dto: CreateChecklistSectionDto) {
    await this.ensureTaskTypesExist(dto.taskTypes?.map(({ taskTypeId }) => taskTypeId));
    try {
      return await this.prisma.checklistSection.create({
        data: {
          name: dto.name.trim(),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.taskTypes
            ? {
                taskTypes: {
                  create: dto.taskTypes.map((mapping) => ({
                    taskTypeId: mapping.taskTypeId,
                    displayOrder: mapping.displayOrder,
                  })),
                },
              }
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
    await this.ensureTaskTypesExist(dto.taskTypes?.map(({ taskTypeId }) => taskTypeId));
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
    const existing = await this.findOne(id);
    if (existing.questions.length > 0) {
      throw new ConflictException(
        'Categories containing questions cannot be safely deleted. Deactivate the category instead.',
      );
    }
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

  async findCategories() {
    return (await this.findAll()).map((section) => this.toCategory(section));
  }

  async findCategory(id: string) {
    return this.toCategory(await this.findOne(id));
  }

  async createCategory(dto: CreateChecklistCategoryDto) {
    const name = dto.name.trim();
    await this.ensureNameAvailable(name);
    const taskTypeIds = dto.applicableTaskTypeIds.map(Number);
    await this.ensureSelectableTaskTypes(taskTypeIds);
    const order = dto.order ?? (await this.nextCategoryOrder());
    const created = await this.create({
      name,
      taskTypes: taskTypeIds.map((taskTypeId) => ({ taskTypeId, displayOrder: order })),
    });
    return this.toCategory(created);
  }

  async updateCategory(id: string, dto: UpdateChecklistCategoryDto) {
    const existing = await this.findOne(id);
    if (dto.name !== undefined) await this.ensureNameAvailable(dto.name.trim(), id);

    const taskTypeIds = dto.applicableTaskTypeIds?.map(Number);
    if (taskTypeIds !== undefined) {
      await this.ensureSelectableTaskTypes(
        taskTypeIds,
        existing.taskTypes.map(({ taskTypeId }) => taskTypeId),
      );
    }
    const order =
      dto.order ?? Math.min(...existing.taskTypes.map(({ displayOrder }) => displayOrder));
    const updated = await this.update(id, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      ...(taskTypeIds === undefined
        ? {}
        : {
            taskTypes: taskTypeIds.map((taskTypeId) => ({ taskTypeId, displayOrder: order })),
          }),
    });
    return this.toCategory(updated);
  }

  removeCategory(id: string): Promise<void> {
    return this.remove(id);
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
      throw new NotFoundException(`Task type(s) not found: ${missing.join(', ')}`);
    }
  }

  private async ensureSelectableTaskTypes(
    taskTypeIds: number[],
    permittedInactiveIds: number[] = [],
  ): Promise<void> {
    const taskTypes = await this.prisma.taskType.findMany({
      where: {
        id: { in: taskTypeIds },
        OR: [{ isActive: true }, { id: { in: permittedInactiveIds } }],
      },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      throw new ConflictException('Choose one or more active task types.');
    }
  }

  private async ensureNameAvailable(name: string, excludingId?: string): Promise<void> {
    const duplicate = await this.prisma.checklistSection.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludingId === undefined ? {} : { id: { not: excludingId } }),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('A category with that name already exists.');
  }

  private async nextCategoryOrder(): Promise<number> {
    const aggregate = await this.prisma.taskTypeChecklistSection.aggregate({
      _max: { displayOrder: true },
    });
    return (aggregate._max.displayOrder ?? -1) + 1;
  }

  private toCategory(
    section: Prisma.ChecklistSectionGetPayload<{ include: typeof sectionInclude }>,
  ) {
    return {
      id: section.id,
      name: section.name,
      order: Math.min(...section.taskTypes.map(({ displayOrder }) => displayOrder)),
      isActive: section.isActive,
      applicableTaskTypeIds: section.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
      questions: section.questions.map((question) => ({
        id: question.id,
        categoryId: section.id,
        text: question.questionText,
        order: question.displayOrder,
        isActive: question.isActive,
      })),
    };
  }
}
