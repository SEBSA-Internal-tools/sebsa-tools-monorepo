import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';

@Injectable()
export class TaskValidationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async validateProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      throw new NotFoundException(
        'Project not found.',
      );
    }
  }

  async validateWorkflowStage(
    workflowStageId: string,
    projectId: string,
  ): Promise<void> {
    const stage = await this.prisma.workflowStage.findFirst({
      where: {
        id: workflowStageId,
        projectId,
      },
      select: {
        id: true,
      },
    });

    if (!stage) {
      throw new BadRequestException(
        'Workflow stage does not belong to the selected project.',
      );
    }
  }

  async validateSprint(
    sprintId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!sprintId) {
      return;
    }

    const sprint = await this.prisma.sprint.findFirst({
      where: {
        id: sprintId,
        projectId,
      },
      select: {
        id: true,
      },
    });

    if (!sprint) {
      throw new BadRequestException(
        'Sprint does not belong to the selected project.',
      );
    }
  }

  async validateMilestone(
    milestoneId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!milestoneId) {
      return;
    }

    const milestone = await this.prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!milestone) {
      throw new BadRequestException(
        'Milestone does not belong to the selected project.',
      );
    }
  }

  async validateParentTask(
    parentTaskId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!parentTaskId) {
      return;
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: parentTaskId,
        projectId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new BadRequestException(
        'Parent task does not belong to the selected project.',
      );
    }
  }

  async validateAssignees(
    assigneeIds: string[] | undefined,
    projectId: string,
  ): Promise<void> {
    if (!assigneeIds || assigneeIds.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(assigneeIds));
    const usersCount = await this.prisma.user.count({
      where: {
        id: { in: uniqueIds },
        isActive: true,
        deletedAt: null,
      },
    });

    if (usersCount !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more assigned users do not exist or are inactive.',
      );
    }
  }

  async validateLabels(
    labelIds: string[] | undefined,
    projectId: string,
  ): Promise<void> {
    if (!labelIds || labelIds.length === 0) {
      return;
    }

    const uniqueIds = Array.from(new Set(labelIds));
    const labelsCount = await this.prisma.label.count({
      where: {
        id: { in: uniqueIds },
        projectId,
      },
    });

    if (labelsCount !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more labels do not belong to the selected project.',
      );
    }
  }

  validateDates(
    startDate?: string,
    dueDate?: string,
  ): void {
    if (!startDate || !dueDate) {
      return;
    }

    const start = new Date(startDate);
    const due = new Date(dueDate);

    if (due < start) {
      throw new BadRequestException(
        'Due date must be after start date.',
      );
    }
  }
}