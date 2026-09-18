import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplate(includeInactive = false) {
    const sections = await this.prisma.checklistSection.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        taskTypes: {
          some: includeInactive ? {} : { taskType: { isActive: true } },
        },
      },
      include: {
        taskTypes: {
          where: includeInactive ? {} : { taskType: { isActive: true } },
          orderBy: { displayOrder: 'asc' },
        },
        questions: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return sections
      .map((section) => ({
        id: section.id,
        name: section.name,
        order: Math.min(...section.taskTypes.map(({ displayOrder }) => displayOrder)),
        isActive: section.isActive,
        questions: section.questions.map((question) => ({
          id: question.id,
          categoryId: section.id,
          text: question.questionText,
          order: question.displayOrder,
          appliesTo: section.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
          isActive: question.isActive,
        })),
      }))
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }

  async findForTaskTypes(taskTypeIds: number[]) {
    const taskTypes = await this.prisma.taskType.findMany({
      where: { id: { in: taskTypeIds }, isActive: true },
    });
    if (taskTypes.length !== taskTypeIds.length) {
      const found = new Set(taskTypes.map(({ id }) => id));
      const missing = taskTypeIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Active task type(s) not found: ${missing.join(', ')}`,
      );
    }

    const sectionMappings =
      await this.prisma.taskTypeChecklistSection.findMany({
        where: {
          taskTypeId: { in: taskTypeIds },
          section: { isActive: true, questions: { some: { isActive: true } } },
        },
        orderBy: [{ displayOrder: 'asc' }, { section: { name: 'asc' } }],
        include: {
          taskType: true,
          section: {
            include: {
              questions: {
                where: { isActive: true },
                orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });

    const sectionsById = new Map<
      string,
      (typeof sectionMappings)[number]['section'] & {
        displayOrder: number;
        taskTypes: (typeof sectionMappings)[number]['taskType'][];
      }
    >();
    for (const mapping of sectionMappings) {
      const existing = sectionsById.get(mapping.sectionId);
      if (existing) {
        existing.displayOrder = Math.min(
          existing.displayOrder,
          mapping.displayOrder,
        );
        existing.taskTypes.push(mapping.taskType);
      } else {
        sectionsById.set(mapping.sectionId, {
          ...mapping.section,
          displayOrder: mapping.displayOrder,
          taskTypes: [mapping.taskType],
        });
      }
    }
    const sections = [...sectionsById.values()].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.name.localeCompare(right.name),
    );
    return { taskTypes, sections };
  }
}
