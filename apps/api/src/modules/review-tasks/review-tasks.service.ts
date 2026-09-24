import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChecklistStatus, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type {
  ChecklistAnswerDto,
  CreateReviewTaskDto,
} from './dto/create-review-task.dto.js';
import type { UpdateReviewTaskDto } from './dto/update-review-task.dto.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { formatTaskCode } from './task-code.js';
import type { ReviewTaskScope } from './dto/review-task-query.dto.js';

const taskInclude = {
  customer: true,
  developer: true,
  currentReviewer: true,
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
  codeReviewForms: { select: { reviewerId: true, decision: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function hasAdminAccess(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');
}

@Injectable()
export class ReviewTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, scope: ReviewTaskScope = 'mine') {
    const tasks = await this.prisma.task.findMany({
      where: this.listWhere(user, scope),
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: tasks.map((task) => this.toResponse(task)),
      pagination: { page: 1, pageSize: Math.max(tasks.length, 1), total: tasks.length },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    const mayRead =
      hasAdminAccess(user) ||
      (user.roles.includes('DEVELOPER') && task.developerId === user.id) ||
      (user.roles.includes('REVIEWER') &&
        task.status !== TaskStatus.DRAFT &&
        task.developerId !== user.id &&
        (task.currentReviewerId === user.id ||
          task.status === TaskStatus.SUBMITTED ||
          task.status === TaskStatus.RESUBMITTED ||
          task.codeReviewForms.some(({ reviewerId }) => reviewerId === user.id)));
    if (!mayRead) throw new ForbiddenException('You cannot access this review task');
    return this.toResponse(task);
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
              tx.user.findFirst({ where: { id: developerId, deletedAt: null } }),
            ]);
            if (!customer) throw new NotFoundException(`Customer ${dto.customerId} was not found`);
            if (!developer) throw new NotFoundException(`Developer ${developerId} was not found`);

            const hasChecklist = this.hasChecklistPayload(dto);
            const checklistCompleted = hasChecklist
              ? await this.validateChecklist(tx, dto.taskTypeIds!, dto.checklistAnswers!)
              : false;
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            const sequence = (aggregate._max.customerSequenceNo ?? 0) + 1;
            const created = await tx.task.create({
              data: {
                taskCode: formatTaskCode(customer.name, sequence),
                customerSequenceNo: sequence,
                title: this.taskTitle(customer.name, dto.crimId, dto.version),
                crimId: dto.crimId.trim(),
                version: dto.version?.trim() ?? null,
                priority: dto.priority,
                status: TaskStatus.DRAFT,
                checklistCompleted,
                customerId: dto.customerId,
                developerId,
                ...(hasChecklist
                  ? {
                      ...(dto.taskTypeIds!.length > 0
                        ? {
                            taskTypes: {
                              create: dto.taskTypeIds!.map((taskTypeId) => ({ taskTypeId })),
                            },
                          }
                        : {}),
                      developerChecklist: {
                        create: {
                          developerId,
                          additionalRemarks: dto.additionalRemarks?.trim() ?? null,
                          status: checklistCompleted
                            ? ChecklistStatus.COMPLETED
                            : ChecklistStatus.DRAFT,
                          checkedDate: checklistCompleted ? new Date() : null,
                          completedAt: checklistCompleted ? new Date() : null,
                          ...(dto.checklistAnswers!.length > 0
                            ? { answers: { create: dto.checklistAnswers! } }
                            : {}),
                        },
                      },
                    }
                  : {}),
                statusHistory: {
                  create: {
                    newStatus: TaskStatus.DRAFT,
                    changedBy: developerId,
                    remarks: 'Draft task created',
                  },
                },
              },
              include: taskInclude,
            });
            return this.toResponse(created);
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
    throw new ConflictException('Could not allocate a task number; please retry');
  }

  async update(id: string, dto: UpdateReviewTaskDto, user: AuthenticatedUser) {
    const authorisedTask = await this.getTask(id);
    if (!hasAdminAccess(user) && authorisedTask.developerId !== user.id) {
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
          if (!existing) throw new NotFoundException(`Review task ${id} was not found`);

          const hasChecklist = this.hasChecklistPayload(dto);
          const checklistCompleted = hasChecklist
            ? await this.validateChecklist(tx, dto.taskTypeIds!, dto.checklistAnswers!)
            : existing.checklistCompleted;

          const developerId = existing.developerId;

          let customerId = existing.customerId;
          let customerName = existing.customer.name;
          let customerSequenceNo = existing.customerSequenceNo;
          let taskCode = existing.taskCode;
          if (dto.customerId && dto.customerId !== existing.customerId) {
            const customer = await tx.customer.findUnique({
              where: { id: dto.customerId },
            });
            if (!customer) throw new NotFoundException(`Customer ${dto.customerId} was not found`);
            const aggregate = await tx.task.aggregate({
              where: { customerId: dto.customerId },
              _max: { customerSequenceNo: true },
            });
            customerId = customer.id;
            customerName = customer.name;
            customerSequenceNo = (aggregate._max.customerSequenceNo ?? 0) + 1;
            taskCode = formatTaskCode(customer.name, customerSequenceNo);
          }

          if (hasChecklist) await tx.taskTaskType.deleteMany({ where: { taskId: id } });
          if (hasChecklist && dto.taskTypeIds!.length > 0)
            await tx.taskTaskType.createMany({
              data: dto.taskTypeIds!.map((taskTypeId) => ({
                taskId: id,
                taskTypeId,
              })),
            });
          if (hasChecklist && existing.developerChecklist) {
            await tx.checklistAnswer.deleteMany({
              where: { checklistId: existing.developerChecklist.id },
            });
            if (dto.checklistAnswers!.length > 0) {
              await tx.checklistAnswer.createMany({
                data: dto.checklistAnswers!.map((answer) => ({
                  ...answer,
                  checklistId: existing.developerChecklist!.id,
                })),
              });
            }
          }

          const crimId = dto.crimId?.trim() ?? existing.crimId;
          if (hasChecklist) {
            const checklistData = {
              developerId,
              additionalRemarks: dto.additionalRemarks?.trim() ?? null,
              status: checklistCompleted ? ChecklistStatus.COMPLETED : ChecklistStatus.DRAFT,
              checkedDate: checklistCompleted ? new Date() : null,
              completedAt: checklistCompleted ? new Date() : null,
            } as const;
            if (existing.developerChecklist) {
              await tx.developerChecklist.update({
                where: { id: existing.developerChecklist.id },
                data: checklistData,
              });
            } else {
              await tx.developerChecklist.create({
                data: {
                  ...checklistData,
                  taskId: id,
                  ...(dto.checklistAnswers!.length > 0
                    ? { answers: { create: dto.checklistAnswers! } }
                    : {}),
                },
              });
            }
          }
          const updated = await tx.task.update({
            where: { id },
            data: {
              customerId,
              customerSequenceNo,
              taskCode,
              title: this.taskTitle(
                customerName,
                crimId,
                dto.version === undefined ? existing.version : dto.version,
              ),
              crimId,
              ...(dto.version === undefined ? {} : { version: dto.version?.trim() ?? null }),
              ...(dto.priority === undefined ? {} : { priority: dto.priority }),
              developerId,
              ...(hasChecklist ? { checklistCompleted } : {}),
            },
            include: taskInclude,
          });
          return this.toResponse(updated);
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
        if (!task) throw new NotFoundException(`Review task ${id} was not found`);
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

  async submit(id: string, user: AuthenticatedUser) {
    const task = await this.getTask(id);
    if (!hasAdminAccess(user) && task.developerId !== user.id) {
      throw new ForbiddenException('You cannot submit this review task');
    }
    if (task.status !== TaskStatus.DRAFT) {
      throw new ConflictException('Only a draft task can be submitted');
    }
    if (!task.checklistCompleted) {
      throw new BadRequestException('Complete the quality checklist before submitting');
    }

    const submitted = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.SUBMITTED,
          submittedAt: now,
          currentReviewCycle: Math.max(task.currentReviewCycle, 1),
          statusHistory: {
            create: {
              oldStatus: TaskStatus.DRAFT,
              newStatus: TaskStatus.SUBMITTED,
              changedBy: user.id,
              remarks: 'Task submitted for review',
            },
          },
        },
        include: taskInclude,
      });
      return updated;
    });
    return this.toResponse(submitted);
  }

  private listWhere(user: AuthenticatedUser, scope: ReviewTaskScope): Prisma.TaskWhereInput {
    if (scope === 'all') {
      if (!hasAdminAccess(user)) {
        throw new ForbiddenException('Only administrators may view all review tasks');
      }
      return {};
    }

    if (scope === 'mine') {
      if (!user.roles.includes('DEVELOPER')) {
        throw new ForbiddenException('Only developers may view their task list');
      }
      return { developerId: user.id };
    }

    if (!user.roles.includes('REVIEWER')) {
      throw new ForbiddenException('Only reviewers may view reviewer task lists');
    }

    if (scope === 'available') {
      return {
        developerId: { not: user.id },
        currentReviewerId: null,
        status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
      };
    }
    if (scope === 'assigned') {
      return {
        developerId: { not: user.id },
        currentReviewerId: user.id,
        status: TaskStatus.IN_REVIEW,
      };
    }
    return {
      developerId: { not: user.id },
      status: { not: TaskStatus.DRAFT },
      codeReviewForms: { some: { reviewerId: user.id, decision: { not: null } } },
      NOT: { currentReviewerId: user.id, status: TaskStatus.IN_REVIEW },
    };
  }

  private hasChecklistPayload(dto: UpdateReviewTaskDto): boolean {
    const hasTaskTypes = dto.taskTypeIds !== undefined;
    const hasAnswers = dto.checklistAnswers !== undefined;
    if (hasTaskTypes !== hasAnswers) {
      throw new BadRequestException('taskTypeIds and checklistAnswers must be provided together');
    }
    return hasTaskTypes;
  }

  private taskTitle(
    customerName: string,
    crimId: string,
    version: string | null | undefined,
  ): string {
    const suffix = version?.trim();
    return `${customerName} - ${crimId.trim()}${suffix ? ` ${suffix}` : ''}`;
  }

  private toResponse(task: TaskWithRelations) {
    const status = {
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      IN_REVIEW: 'InReview',
      CHANGES_REQUESTED: 'ChangesRequested',
      RESUBMITTED: 'ReSubmitted',
      APPROVED: 'Approved',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
    }[task.status];
    const priority = {
      LOW: 'Low',
      MEDIUM: 'Medium',
      HIGH: 'High',
    }[task.priority];
    return {
      id: task.id,
      taskCode: task.taskCode,
      title: task.title,
      crimId: task.crimId,
      version: task.version,
      customerId: task.customerId,
      priority,
      status,
      reviewCycle: Math.max(task.currentReviewCycle, 1),
      developerId: task.developerId,
      reviewerId: task.currentReviewerId,
      taskTypeIds: task.taskTypes.map(({ taskTypeId }) => String(taskTypeId)),
      isChecklistComplete: task.checklistCompleted,
      isHandedOver: false,
      noteToReviewer: null,
      createdAt: task.createdAt.toISOString(),
      submittedAt: task.submittedAt?.toISOString() ?? null,
      updatedAt: task.updatedAt.toISOString(),
      customerName: task.customer.name,
      customerCode: task.customer.code,
      customerColor: task.customer.color ?? '#64748b',
      developerName: task.developer.fullName,
      reviewerName: task.currentReviewer?.fullName ?? null,
    };
  }

  private async validateChecklist(
    tx: Prisma.TransactionClient,
    taskTypeIds: number[],
    answers: ChecklistAnswerDto[],
  ): Promise<boolean> {
    const taskTypes = await tx.taskType.findMany({
      where: { id: { in: taskTypeIds }, isActive: true },
      select: { id: true },
    });
    if (taskTypes.length !== taskTypeIds.length)
      throw new BadRequestException('All taskTypeIds must identify active task types');

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
    if (invalid.length) {
      throw new BadRequestException({
        message: 'Checklist answers must match applicable active questions',
        invalidQuestionIds: invalid,
      });
    }
    return taskTypeIds.length > 0 && missing.length === 0;
  }
}
