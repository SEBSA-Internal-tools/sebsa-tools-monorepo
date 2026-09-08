import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, Subtask } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { NotificationService } from '../notifications/notification.service';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const subtaskInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  createdBy: { select: { id: true, name: true } },
  subtaskType: { select: { id: true, name: true } },
} satisfies Prisma.SubtaskInclude;

type SubtaskWithDetail = Prisma.SubtaskGetPayload<{ include: typeof subtaskInclude }>;

@Injectable()
export class SubtaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAllByTask(taskId: string, user: AuthUser): Promise<Subtask[]> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertVisible(task.case.projectId, user);

    const subtasks = await this.prisma.subtask.findMany({
      where: { taskId, deletedAt: null },
      include: subtaskInclude,
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map((s) => this.toSubtask(s));
  }

  async create(taskId: string, dto: CreateSubtaskDto, user: AuthUser): Promise<Subtask> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);
    await this.assertAssigneesValid(dto.assigneeIds, task.case.projectId);
    await this.assertSubtaskTypeValid(dto.subtaskTypeId);

    const created = await this.prisma.subtask.create({
      data: {
        taskId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        jiraStatusLabel: dto.jiraStatusLabel,
        subtaskTypeId: dto.subtaskTypeId,
        createdById: user.id,
        ...(dto.assigneeIds?.length && {
          assignees: { createMany: { data: dto.assigneeIds.map((userId) => ({ userId })) } },
        }),
      },
      include: subtaskInclude,
    });

    if (dto.assigneeIds?.length) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: dto.assigneeIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'SUBTASK',
        entityId: created.id,
        entityTitle: dto.title,
      }).catch(() => {});
    }

    return this.toSubtask(created);
  }

  async findOne(id: string, user: AuthUser): Promise<Subtask> {
    const subtask = await this.getSubtaskDetailOrThrow(id);
    await this.assertVisible(subtask.task.case.projectId, user);
    return this.toSubtask(subtask);
  }

  async update(id: string, dto: UpdateSubtaskDto, user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);

    if (dto.assigneeIds) {
      await this.assertAssigneesValid(dto.assigneeIds, existing.task.case.projectId);
    }
    if (dto.subtaskTypeId !== undefined) {
      await this.assertSubtaskTypeValid(dto.subtaskTypeId);
    }

    const { assigneeIds, ...restDto } = dto;

    const updated = await this.prisma.subtask.update({
      where: { id },
      data: {
        ...restDto,
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(assigneeIds && {
          assignees: { deleteMany: {}, createMany: { data: assigneeIds.map((userId) => ({ userId })) } },
        }),
      },
      include: subtaskInclude,
    });

    if (assigneeIds?.length) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: assigneeIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'SUBTASK',
        entityId: id,
        entityTitle: existing.title,
      }).catch(() => {});
    }

    return this.toSubtask(updated);
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);

    await this.prisma.subtask.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Subtask deleted successfully.' };
  }

  async assignUsers(id: string, assigneeIds: string[], user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);
    await this.assertAssigneesValid(assigneeIds, existing.task.case.projectId);

    await this.prisma.subtaskAssignee.createMany({
      data: assigneeIds.map((userId) => ({ subtaskId: id, userId })),
      skipDuplicates: true,
    });

    this.notificationService.notifyAssignees({
      assigneeUserIds: assigneeIds,
      actorId: user.id,
      actorName: user.name,
      entityType: 'SUBTASK',
      entityId: id,
      entityTitle: existing.title,
    }).catch(() => {});

    return this.findOne(id, user);
  }

  async unassignUser(id: string, userId: string, user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);

    await this.prisma.subtaskAssignee.deleteMany({ where: { subtaskId: id, userId } });
    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Authorization / lookups
  // ---------------------------------------------------------------------------

  private async assertVisible(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE') return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  private async assertCanEdit(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
    if (!membership || membership.role.privilegeGroup.isReadOnly) {
      throw new ForbiddenException('You do not have permission to edit subtasks in this project.');
    }
  }

  private async assertAssigneesValid(
    assigneeIds: string[] | undefined,
    projectId: string,
  ): Promise<void> {
    if (!assigneeIds || assigneeIds.length === 0) return;

    const uniqueIds = Array.from(new Set(assigneeIds));
    const activeCount = await this.prisma.user.count({
      where: { id: { in: uniqueIds }, isActive: true, deletedAt: null },
    });
    if (activeCount !== uniqueIds.length) {
      throw new ForbiddenException('One or more assigned users do not exist or are inactive.');
    }

    const memberCount = await this.prisma.projectMember.count({
      where: { userId: { in: uniqueIds }, projectId, deletedAt: null },
    });
    if (memberCount !== uniqueIds.length) {
      throw new ForbiddenException('Assignees must be members of the project.');
    }
  }

  private async assertSubtaskTypeValid(subtaskTypeId: string | undefined): Promise<void> {
    if (!subtaskTypeId) return;
    const type = await this.prisma.subtaskType.findFirst({ where: { id: subtaskTypeId, isActive: true } });
    if (!type) {
      throw new NotFoundException('Subtask type does not exist or is inactive.');
    }
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, case: { select: { projectId: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  private async getSubtaskDetailOrThrow(id: string): Promise<SubtaskWithDetail & { task: { case: { projectId: string } } }> {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id, deletedAt: null },
      include: { ...subtaskInclude, task: { select: { case: { select: { projectId: true } } } } },
    });
    if (!subtask) {
      throw new NotFoundException('Subtask not found.');
    }
    return subtask;
  }

  private toSubtask(subtask: SubtaskWithDetail): Subtask {
    return {
      id: subtask.id,
      taskId: subtask.taskId,
      title: subtask.title,
      description: subtask.description,
      status: subtask.status,
      dueDate: subtask.dueDate ? subtask.dueDate.toISOString() : null,
      jiraStatusLabel: subtask.jiraStatusLabel,
      subtaskTypeId: subtask.subtaskTypeId,
      subtaskType: subtask.subtaskType,
      assignees: subtask.assignees.map((a) => a.user),
      createdBy: subtask.createdBy,
      createdAt: subtask.createdAt.toISOString(),
      updatedAt: subtask.updatedAt.toISOString(),
    };
  }
}
