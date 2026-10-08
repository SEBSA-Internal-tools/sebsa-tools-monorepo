import { ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ChecklistQuestionsService } from './checklist-questions.service.js';
import { CreateChecklistQuestionDto } from './dto/create-checklist-question.dto.js';
import { UpdateChecklistQuestionDto } from './dto/update-checklist-question.dto.js';

const categoryId = '00000000-0000-4000-8000-000000000001';
const otherCategoryId = '00000000-0000-4000-8000-000000000002';
const questionId = '00000000-0000-4000-8000-000000000003';

function question(overrides: Record<string, unknown> = {}) {
  return {
    id: questionId,
    sectionId: categoryId,
    questionText: 'Is the implementation complete?',
    displayOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    section: { id: categoryId, taskTypes: [] },
    _count: { answers: 0 },
    ...overrides,
  };
}

describe('ChecklistQuestionsService question management', () => {
  it('accepts the existing Add Question and Edit Question payloads', async () => {
    const createDto = Object.assign(new CreateChecklistQuestionDto(), {
      categoryId,
      text: 'Is the implementation complete?',
    });
    const updateDto = Object.assign(new UpdateChecklistQuestionDto(), {
      categoryId,
      text: 'Is the implementation tested?',
      isActive: true,
    });

    await expect(
      validate(createDto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    await expect(
      validate(updateDto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it('adds a question at the end of only the selected category', async () => {
    const created = question({ displayOrder: 2 });
    const tx = { checklistQuestion: { create: vi.fn().mockResolvedValue(created) } };
    const prisma = {
      checklistSection: { findUnique: vi.fn().mockResolvedValue({ id: categoryId }) },
      checklistQuestion: {
        aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 1 } }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new ChecklistQuestionsService(prisma as never);

    await expect(
      service.create({ categoryId, text: ' Is the implementation complete? ' }),
    ).resolves.toEqual({
      id: questionId,
      categoryId,
      text: 'Is the implementation complete?',
      order: 2,
      isActive: true,
    });
    expect(prisma.checklistQuestion.aggregate).toHaveBeenCalledWith({
      where: { sectionId: categoryId },
      _max: { displayOrder: true },
    });
    expect(tx.checklistQuestion.create).toHaveBeenCalledWith({
      data: {
        sectionId: categoryId,
        questionText: 'Is the implementation complete?',
        displayOrder: 2,
      },
    });
  });

  it('edits a question and can move it to the selected category without changing other questions', async () => {
    const existing = question();
    const updated = question({
      sectionId: otherCategoryId,
      questionText: 'Is the implementation tested?',
      displayOrder: 3,
    });
    const tx = {
      checklistQuestion: {
        update: vi.fn().mockResolvedValue(updated),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const prisma = {
      checklistQuestion: {
        findUnique: vi.fn().mockResolvedValue(existing),
        aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 2 } }),
      },
      checklistSection: { findUnique: vi.fn().mockResolvedValue({ id: otherCategoryId }) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new ChecklistQuestionsService(prisma as never);

    await expect(
      service.update(questionId, {
        categoryId: otherCategoryId,
        text: ' Is the implementation tested? ',
      }),
    ).resolves.toMatchObject({
      id: questionId,
      categoryId: otherCategoryId,
      text: 'Is the implementation tested?',
      order: 3,
    });
    expect(tx.checklistQuestion.update).toHaveBeenCalledWith({
      where: { id: questionId },
      data: {
        sectionId: otherCategoryId,
        questionText: 'Is the implementation tested?',
        displayOrder: 3,
      },
    });
    expect(tx.checklistQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sectionId: categoryId, id: { not: questionId } } }),
    );
  });

  it('permanently deletes an unused question and resequences only its category', async () => {
    const tx = {
      checklistQuestion: {
        delete: vi.fn().mockResolvedValue(question()),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    };
    const prisma = {
      checklistQuestion: { findUnique: vi.fn().mockResolvedValue(question()) },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new ChecklistQuestionsService(prisma as never);

    await expect(service.remove(questionId)).resolves.toBeUndefined();
    expect(tx.checklistQuestion.delete).toHaveBeenCalledWith({ where: { id: questionId } });
    expect(tx.checklistQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sectionId: categoryId } }),
    );
  });

  it('protects checklist history by refusing to delete an answered question', async () => {
    const prisma = {
      checklistQuestion: {
        findUnique: vi.fn().mockResolvedValue(question({ _count: { answers: 1 } })),
      },
      $transaction: vi.fn(),
    };
    const service = new ChecklistQuestionsService(prisma as never);

    await expect(service.remove(questionId)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
