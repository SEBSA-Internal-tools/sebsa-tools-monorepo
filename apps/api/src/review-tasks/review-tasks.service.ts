import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChecklistStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../common/prisma-errors.js';
import type {
  ChecklistAnswerDto,
  CreateReviewTaskDto,
} from './dto/create-review-task.dto.js';
import type { UpdateReviewTaskDto } from './dto/update-review-task.dto.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

const taskInclude = {
  customer: true,
  developer: true,
  taskTypes: { include: { taskType: true } },
  developerChecklist: {
    include: {
      developer: true,
      answers: {
        include: { question: { include: { section: true } } },
        orderBy: { question: { displayOrder: 'asc' } },
      },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class ReviewTasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: AuthenticatedUser) {
    const isAdmin = user.roles.includes('ADMIN');
    const canDevelop = user.roles.includes('DEVELOPER');
    const canReview = user.roles.includes('REVIEWER');
    return this.prisma.task.findMany({
      ...(isAdmin
        ? {}
        : { where: {
            OR: [
              ...(canDevelop ? [{ developerId: user.id }] : []),
              ...(canReview
                ? [
                    { currentReviewerId: user.id },
                    { status: TaskStatus.SUBMITTED, developerId: { not: user.id } },
                  ]
                : []),
            ],
          } }),
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    const mayRead =
      user.roles.includes('ADMIN') ||
      (user.roles.includes('DEVELOPER') && task.developerId === user.id) ||
      (user.roles.includes('REVIEWER') &&
        (task.currentReviewerId === user.id ||
          (task.status === TaskStatus.SUBMITTED && task.developerId !== user.id)));
    if (!mayRead) throw new ForbiddenException('You cannot access this review task');
    return task;
  }

  private async getTask(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException(`Review task ${id} was not found`);
    return task;
  }

  async create(dto: CreateReviewTaskDto, developerId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const [customer, developer] = await Promise.all([
              tx.customer.findUnique({ where: { id: dto.customerId } }),
              tx.user.findUnique({ where: { id: developerId } }),
            ]);
            if (!customer)
              throw new NotFoundException(
                `Customer ${dto.customerId} was not found`,
              );
            if (!developer)
              throw new NotFoundException(
                `Developer ${developerId} was not found`,
              );

            await this.validateChecklist(
              tx,
              dto.taskTypeIds,
              dto.checklistAnswers,
            );
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            const sequence = (aggregate._max.customerSequenceNo ?? 0) + 1;
            const now = new Date();
            return tx.task.create({
              data: {
                taskCode: `${customer.code}-${String(sequence).padStart(4, '0')}`,
                customerSequenceNo: sequence,
                title: `${customer.code} - ${dto.crimId.trim()}`,
                crimId: dto.crimId.trim(),
                version: dto.version?.trim() ?? null,
                priority: dto.priority,
                status: TaskStatus.SUBMITTED,
                checklistCompleted: true,
                submittedAt: now,
                customerId: dto.customerId,
                developerId,
                taskTypes: {
                  create: dto.taskTypeIds.map((taskTypeId) => ({ taskTypeId })),
                },
                developerChecklist: {
                  create: {
                    developerId,
                    additionalRemarks: dto.additionalRemarks?.trim() ?? null,
                    status: ChecklistStatus.COMPLETED,
                    checkedDate: now,
                    completedAt: now,
                    answers: { create: dto.checklistAnswers },
                  },
                },
                statusHistory: {
                  create: {
                    newStatus: TaskStatus.SUBMITTED,
                    changedBy: developerId,
                    remarks: 'Task and developer checklist submitted',
                  },
                },
              },
              include: taskInclude,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue;
        rethrowPrismaConflict(error);
      }
    }
    throw new ConflictException(
      'Could not allocate a task number; please retry',
    );
  }

  async update(id: string, dto: UpdateReviewTaskDto, user: AuthenticatedUser) {
    const authorisedTask = await this.getTask(id);
    if (!user.roles.includes('ADMIN') && authorisedTask.developerId !== user.id) {
      throw new ForbiddenException('You cannot update this review task');
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.task.findUnique({
            where: { id },
            include: {
              taskTypes: true,
              developerChecklist: { include: { answers: true } },
              customer: true,
            },
          });
          if (!existing?.developerChecklist)
            throw new NotFoundException(`Review task ${id} was not found`);

          const taskTypeIds =
            dto.taskTypeIds ??
            existing.taskTypes.map(({ taskTypeId }) => taskTypeId);
          const checklistAnswers =
            dto.checklistAnswers ??
            existing.developerChecklist.answers.map(
              ({ questionId, answer }) => ({ questionId, answer }),
            );
          await this.validateChecklist(tx, taskTypeIds, checklistAnswers);

          const developerId = existing.developerId;

          let customerId = existing.customerId;
          let customerCode = existing.customer.code;
          let customerSequenceNo = existing.customerSequenceNo;
          let taskCode = existing.taskCode;
          if (dto.customerId && dto.customerId !== existing.customerId) {
            const customer = await tx.customer.findUnique({
              where: { id: dto.customerId },
            });
            if (!customer)
              throw new NotFoundException(
                `Customer ${dto.customerId} was not found`,
              );
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            customerId = customer.id;
            customerCode = customer.code;
            customerSequenceNo = (aggregate._max.customerSequenceNo ?? 0) + 1;
            taskCode = `${customer.code}-${String(customerSequenceNo).padStart(4, '0')}`;
          }

          if (dto.taskTypeIds)
            await tx.taskTaskType.deleteMany({ where: { taskId: id } });
          if (dto.taskTypeIds)
            await tx.taskTaskType.createMany({
              data: taskTypeIds.map((taskTypeId) => ({
                taskId: id,
                taskTypeId,
              })),
            });
          if (dto.checklistAnswers || dto.taskTypeIds) {
            await tx.checklistAnswer.deleteMany({
              where: { checklistId: existing.developerChecklist.id },
            });
            await tx.checklistAnswer.createMany({
              data: checklistAnswers.map((answer) => ({
                ...answer,
                checklistId: existing.developerChecklist!.id,
              })),
            });
          }

          const crimId = dto.crimId?.trim() ?? existing.crimId;
          await tx.developerChecklist.update({
            where: { id: existing.developerChecklist.id },
            data: {
              developerId,
              ...(dto.additionalRemarks === undefined
                ? {}
                : { additionalRemarks: dto.additionalRemarks?.trim() ?? null }),
              status: ChecklistStatus.COMPLETED,
              checkedDate: new Date(),
              completedAt: new Date(),
            },
          });
          return tx.task.update({
            where: { id },
            data: {
              customerId,
              customerSequenceNo,
              taskCode,
              title: `${customerCode} - ${crimId}`,
              crimId,
              ...(dto.version === undefined
                ? {}
                : { version: dto.version?.trim() ?? null }),
              ...(dto.priority === undefined ? {} : { priority: dto.priority }),
              developerId,
              checklistCompleted: true,
            },
            include: taskInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({
          where: { id },
          include: { developerChecklist: true },
        });
        if (!task)
          throw new NotFoundException(`Review task ${id} was not found`);
        if (task.developerChecklist) {
          await tx.checklistAnswer.deleteMany({
            where: { checklistId: task.developerChecklist.id },
          });
          await tx.developerChecklist.delete({
            where: { id: task.developerChecklist.id },
          });
        }
        await tx.taskStatusHistory.deleteMany({ where: { taskId: id } });
        await tx.taskTaskType.deleteMany({ where: { taskId: id } });
        await tx.task.delete({ where: { id } });
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private async validateChecklist(
    tx: Prisma.TransactionClient,
    taskTypeIds: number[],
    answers: ChecklistAnswerDto[],
  ): Promise<void> {
    const taskTypes = await tx.taskType.findMany({
      where: { id: { in: taskTypeIds }, isActive: true },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length)
      throw new BadRequestException(
        'All taskTypeIds must identify active task types',
      );

    const duplicateIds = answers
      .map(({ questionId }) => questionId)
      .filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length)
      throw new BadRequestException(
        `Duplicate checklist answer(s): ${[...new Set(duplicateIds)].join(', ')}`,
      );

    const questions = await tx.checklistQuestion.findMany({
      where: {
        isActive: true,
        section: {
          isActive: true,
          taskTypes: { some: { taskTypeId: { in: taskTypeIds } } },
        },
      },
      select: { id: true },
    });
    const requiredIds = new Set(questions.map(({ id }) => id));
    const answeredIds = new Set(answers.map(({ questionId }) => questionId));
    const missing = [...requiredIds].filter((id) => !answeredIds.has(id));
    const invalid = [...answeredIds].filter((id) => !requiredIds.has(id));
    if (missing.length || invalid.length) {
      throw new BadRequestException({
        message:
          'Checklist answers must exactly match all applicable active questions',
        missingQuestionIds: missing,
        invalidQuestionIds: invalid,
      });
    }
  }
}
