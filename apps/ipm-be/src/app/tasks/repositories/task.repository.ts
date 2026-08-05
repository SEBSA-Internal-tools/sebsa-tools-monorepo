import { Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { PrismaService } from '@sebsa-pm-tool/core'; 
import { FilterTaskDto } from '../dto/filter-task.dto';

@Injectable()
export class TaskRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return this.prisma.task.create({
      data,
    });
  }

  async update(
    id: string,
    data: Prisma.TaskUpdateInput,
  ): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data,
    });
  }

  async findById(
    id: string,
  ): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async findByIdIncludingDeleted(
    id: string,
  ): Promise<Task | null> {
    return this.prisma.task.findUnique({
      where: {
        id,
      },
    });
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.task.count({
      where: {
        id,
        deletedAt: null,
      },
    });

    return count > 0;
  }

  async softDelete(id: string): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async restore(id: string): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: null,
      },
    });
  }

  async count(where: Prisma.TaskWhereInput): Promise<number> {
    return this.prisma.task.count({
      where,
    });
  }

  async findMany(
    filter: FilterTaskDto,
  ) {
    const where = this.buildWhere(filter);

    return this.prisma.task.findMany({
      where,

      include: {
        project: true,
        workflowStage: true,
        sprint: true,
        milestone: true,
        createdBy: true,
        assignees: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        [filter.sortBy]: filter.sortOrder,
      },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    });
  }

  private buildWhere(
    filter: FilterTaskDto,
  ): Prisma.TaskWhereInput {

    const where: Prisma.TaskWhereInput = {};

    if (!filter.includeDeleted) {
      where.deletedAt = null;
    }

    if (filter.projectId) {
      where.projectId = filter.projectId;
    }

    if (filter.workflowStageId) {
      where.workflowStageId = filter.workflowStageId;
    }

    if (filter.parentTaskId) {
      where.parentTaskId = filter.parentTaskId;
    }

    if (filter.sprintId) {
      where.sprintId = filter.sprintId;
    }

    if (filter.milestoneId) {
      where.milestoneId = filter.milestoneId;
    }

    if (filter.createdById) {
      where.createdById = filter.createdById;
    }

    if (filter.priority) {
      where.priority = filter.priority;
    }

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.search) {
      where.OR = [
        {
          title: {
            contains: filter.search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: filter.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (filter.dueBefore || filter.dueAfter) {

      where.dueDate = {};

      if (filter.dueBefore) {
        where.dueDate.lte = new Date(filter.dueBefore);
      }

      if (filter.dueAfter) {
        where.dueDate.gte = new Date(filter.dueAfter);
      }
    }
    return where;
  }
}