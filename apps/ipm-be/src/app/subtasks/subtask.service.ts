import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, Subtask } from '@sebsa-pm-tool/shared-models';
import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const subtaskInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SubtaskInclude;

type SubtaskWithDetail = Prisma.SubtaskGetPayload<{ include: typeof subtaskInclude }>;

@Injectable()
export class SubtaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: ActivityLogsService,
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

    const created = await this.prisma.$transaction(async (tx) => {
      const subtask = await tx.subtask.create({
        data: {
          taskId,
          title: dto.title,
          description: dto.description,
          status: dto.status,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          jiraStatusLabel: dto.jiraStatusLabel,
          createdById: user.id,
          ...(dto.assigneeIds?.length && {
            assignees: { createMany: { data: dto.assigneeIds.map((userId) => ({ userId })) } },
          }),
        },
        include: subtaskInclude,
      });

      await this.activityLogs.record(
        {
          projectId: task.case.projectId,
          entityType: EntityType.SUBTASK,
          entityId: subtask.id,
          entityLabel: subtask.title,
          action: ActivityAction.CREATED,
          actorId: user.id,
          description: `Created subtask "${subtask.title}"`,
        },
        tx,
      );

      return subtask;
    });

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

    const { assigneeIds, ...restDto } = dto;
    const isStatusChange = !!dto.status && dto.status !== existing.status;
    const changes = this.activityLogs.buildFieldChanges(existing, restDto);

    const updated = await this.prisma.$transaction(async (tx) => {
      const subtask = await tx.subtask.update({
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

      // A status move is logged as STATUS_CHANGED rather than UPDATED so the
      // feed can single those out; any other edited fields ride along in
      // `changes` instead of producing a second entry for one request.
      if (changes.length > 0 || assigneeIds) {
        await this.activityLogs.record(
          {
            projectId: existing.task.case.projectId,
            entityType: EntityType.SUBTASK,
            entityId: id,
            entityLabel: subtask.title,
            action: isStatusChange ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
            actorId: user.id,
            description: isStatusChange
              ? `Moved subtask "${subtask.title}" from ${existing.status} to ${subtask.status}`
              : `Updated subtask "${subtask.title}"`,
            changes,
          },
          tx,
        );
      }

      return subtask;
    });

    return this.toSubtask(updated);
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.subtask.update({ where: { id }, data: { deletedAt: new Date() } });

      await this.activityLogs.record(
        {
          projectId: existing.task.case.projectId,
          entityType: EntityType.SUBTASK,
          entityId: id,
          entityLabel: existing.title,
          action: ActivityAction.DELETED,
          actorId: user.id,
          description: `Deleted subtask "${existing.title}"`,
        },
        tx,
      );
    });

    return { message: 'Subtask deleted successfully.' };
  }

  async assignUsers(id: string, assigneeIds: string[], user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);
    await this.assertAssigneesValid(assigneeIds, existing.task.case.projectId);

    const assignees = await this.prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { name: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.subtaskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ subtaskId: id, userId })),
        skipDuplicates: true,
      });

      await this.activityLogs.record(
        {
          projectId: existing.task.case.projectId,
          entityType: EntityType.SUBTASK,
          entityId: id,
          entityLabel: existing.title,
          action: ActivityAction.ASSIGNED,
          actorId: user.id,
          description: `Assigned ${assignees.map((a) => a.name).join(', ')} to subtask "${existing.title}"`,
        },
        tx,
      );
    });

    return this.findOne(id, user);
  }

  async unassignUser(id: string, userId: string, user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.assertCanEdit(existing.task.case.projectId, user);

    const removed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.subtaskAssignee.deleteMany({ where: { subtaskId: id, userId } });

      await this.activityLogs.record(
        {
          projectId: existing.task.case.projectId,
          entityType: EntityType.SUBTASK,
          entityId: id,
          entityLabel: existing.title,
          action: ActivityAction.UNASSIGNED,
          actorId: user.id,
          description: `Unassigned ${removed?.name ?? 'a user'} from subtask "${existing.title}"`,
        },
        tx,
      );
    });

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
      assignees: subtask.assignees.map((a) => a.user),
      createdBy: subtask.createdBy,
      createdAt: subtask.createdAt.toISOString(),
      updatedAt: subtask.updatedAt.toISOString(),
    };
  }
}
