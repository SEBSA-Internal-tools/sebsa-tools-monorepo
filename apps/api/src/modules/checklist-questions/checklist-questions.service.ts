import { Injectable, NotFoundException } from '@nestjs/common';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateChecklistQuestionDto } from './dto/create-checklist-question.dto.js';
import type { UpdateChecklistQuestionDto } from './dto/update-checklist-question.dto.js';

@Injectable()
export class ChecklistQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.checklistQuestion.findMany({
      include: {
        section: true,
        _count: { select: { answers: true } },
      },
      orderBy: [
        { section: { name: 'asc' } },
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.checklistQuestion.findUnique({
      where: { id },
      include: {
        section: { include: { taskTypes: { include: { taskType: true } } } },
        _count: { select: { answers: true } },
      },
    });
    if (!question)
      throw new NotFoundException(`Checklist question ${id} was not found`);
    return question;
  }

  async create(dto: CreateChecklistQuestionDto) {
    await this.ensureSectionExists(dto.sectionId);
    try {
      return await this.prisma.checklistQuestion.create({
        data: {
          sectionId: dto.sectionId,
          questionText: dto.questionText.trim(),
          ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        include: { section: true },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async update(id: string, dto: UpdateChecklistQuestionDto) {
    await this.findOne(id);
    if (dto.sectionId) await this.ensureSectionExists(dto.sectionId);
    try {
      return await this.prisma.checklistQuestion.update({
        where: { id },
        data: {
          ...(dto.sectionId === undefined ? {} : { sectionId: dto.sectionId }),
          ...(dto.questionText === undefined ? {} : { questionText: dto.questionText.trim() }),
          ...(dto.displayOrder === undefined ? {} : { displayOrder: dto.displayOrder }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        include: { section: true },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.checklistQuestion.delete({ where: { id } });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async ensureSectionExists(id: string): Promise<void> {
    const section = await this.prisma.checklistSection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!section)
      throw new NotFoundException(`Checklist section ${id} was not found`);
  }
}
