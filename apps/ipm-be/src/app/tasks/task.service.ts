import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskRepository } from './repositories/task.repository';
import { TaskValidationService } from './validations/task-validation.service';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { FilterTaskDto } from './dto/filter-task.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly validation: TaskValidationService,
  ) {}

  async create(
    dto: CreateTaskDto,
    user: AuthUser,
  ) {
    await this.validation.validateProject(dto.projectId);

    await this.validation.validateWorkflowStage(
      dto.workflowStageId,
      dto.projectId,
    );

    await this.validation.validateSprint(
      dto.sprintId,
      dto.projectId,
    );

    await this.validation.validateMilestone(
      dto.milestoneId,
      dto.projectId,
    );

    await this.validation.validateParentTask(
      dto.parentTaskId,
      dto.projectId,
    );

    this.validation.validateDates(
      dto.startDate,
      dto.dueDate,
    );

    const data: Prisma.TaskCreateInput = {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority,

      startDate: dto.startDate
        ? new Date(dto.startDate)
        : undefined,

      dueDate: dto.dueDate
        ? new Date(dto.dueDate)
        : undefined,

      storyPoints: dto.storyPoints,
      reminderLeadMinutes: dto.reminderLeadMinutes,

      project: {
        connect: {
          id: dto.projectId,
        },
      },

      workflowStage: {
        connect: {
          id: dto.workflowStageId,
        },
      },

      createdBy: {
        connect: {
          id: user.id,
        },
      },

      ...(dto.parentTaskId && {
        parentTask: {
          connect: {
            id: dto.parentTaskId,
          },
        },
      }),

      ...(dto.sprintId && {
        sprint: {
          connect: {
            id: dto.sprintId,
          },
        },
      }),

      ...(dto.milestoneId && {
        milestone: {
          connect: {
            id: dto.milestoneId,
          },
        },
      }),
    };

    return this.repository.create(data);
  }

  async findAll(filter: FilterTaskDto) {
    return this.repository.findMany(filter);
  }

  async findOne(id: string) {
    const task = await this.repository.findById(id);

    if (!task) {
      throw new NotFoundException(
        'Task not found.',
      );
    }

    return task;
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    user: AuthUser,
  ) {
    const task = await this.findOne(id);

    if (dto.parentTaskId && dto.parentTaskId === id) {
      throw new BadRequestException(
        'A task cannot be its own parent task.',
      );
    }

    if (dto.workflowStageId) {
      await this.validation.validateWorkflowStage(
        dto.workflowStageId,
        task.projectId,
      );
    }

    if (dto.sprintId) {
      await this.validation.validateSprint(
        dto.sprintId,
        task.projectId,
      );
    }

    if (dto.milestoneId) {
      await this.validation.validateMilestone(
        dto.milestoneId,
        task.projectId,
      );
    }

    if (dto.parentTaskId) {
      await this.validation.validateParentTask(
        dto.parentTaskId,
        task.projectId,
      );
    }

    if (dto.startDate || dto.dueDate) {
      this.validation.validateDates(
        dto.startDate ?? task.startDate?.toISOString(),
        dto.dueDate ?? task.dueDate?.toISOString(),
      );
    }

    const data: Prisma.TaskUpdateInput = {
      ...dto,

      ...(dto.startDate && {
        startDate: new Date(dto.startDate),
      }),

      ...(dto.dueDate && {
        dueDate: new Date(dto.dueDate),
      }),
    };

    return this.repository.update(id, data);
  }

  async delete(
    id: string,
    user: AuthUser,
  ) {
    await this.findOne(id);

    await this.repository.softDelete(id);

    return {
      message: 'Task deleted successfully.',
    };
  }
}