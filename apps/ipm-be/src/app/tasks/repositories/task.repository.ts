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
        labels: {
          include: {
            label: true,
          },
        },
        subtasks: true,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.TaskUpdateInput,
  ): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data,
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
        labels: {
          include: {
            label: true,
          },
        },
        subtasks: true,
      },
    });
  }

  async findById(
    id: string,
  ): Promise<Task> {
    return this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
        workflowStage: true,
        sprint: true,
        milestone: true,
        createdBy: true,
        parentTask: true,
        assignees: {
          include: {
            user: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
        subtasks: {
          where: {
            deletedAt: null,
          },
          include: {
            workflowStage: true,
            assignees: {
              include: {
                user: true,
              },
            },
          },
        },
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
        labels: {
          include: {
            label: true,
          },
        },
        _count: {
          select: {
            subtasks: true,
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

  async addAssignees(taskId: string, userIds: string[]) {
    const createData = userIds.map((userId) => ({
      taskId,
      userId,
    }));

    await this.prisma.taskAssignee.createMany({
      data: createData,
      skipDuplicates: true,
    });

    return this.findById(taskId);
  }

  async removeAssignee(taskId: string, userId: string) {
    await this.prisma.taskAssignee.deleteMany({
      where: {
        taskId,
        userId,
      },
    });

    return this.findById(taskId);
  }

  async getAssignees(taskId: string) {
    return this.prisma.taskAssignee.findMany({
      where: { taskId },
      include: {
        user: true,
      },
    });
  }

  async attachLabels(taskId: string, labelIds: string[]) {
    const createData = labelIds.map((labelId) => ({
      taskId,
      labelId,
    }));

    await this.prisma.taskLabel.createMany({
      data: createData,
      skipDuplicates: true,
    });

    return this.findById(taskId);
  }

  async detachLabel(taskId: string, labelId: string) {
    await this.prisma.taskLabel.deleteMany({
      where: {
        taskId,
        labelId,
      },
    });

    return this.findById(taskId);
  }

  async findSubtasks(parentTaskId: string) {
    return this.prisma.task.findMany({
      where: {
        parentTaskId,
        deletedAt: null,
      },
      include: {
        workflowStage: true,
        assignees: {
          include: {
            user: true,
          },
        },
        labels: {
          include: {
            label: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
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

    if (filter.assigneeId) {
      where.assignees = {
        some: {
          userId: filter.assigneeId,
        },
      };
    }

    if (filter.labelId) {
      where.labels = {
        some: {
          labelId: filter.labelId,
        },
      };
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