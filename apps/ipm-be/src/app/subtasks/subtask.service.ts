import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { AuthUser, Subtask } from '@sebsa-pm-tool/shared-models';
import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationService } from '../notifications/notification.service';
import { ProjectAccessService } from '../common/project-access.service';

const subtaskInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  createdBy: { select: { id: true, name: true } },
  subtaskType: { select: { id: true, label: true } },
} satisfies Prisma.SubtaskInclude;

type SubtaskWithDetail = Prisma.SubtaskGetPayload<{ include: typeof subtaskInclude }>;

@Injectable()
export class SubtaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: ActivityLogsService,
    private readonly access: ProjectAccessService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAllByTask(taskId: string, user: AuthUser): Promise<Subtask[]> {
    const task = await this.getTaskOrThrow(taskId);
    await this.access.assertVisible(task.case.projectId, user);

    const subtasks = await this.prisma.subtask.findMany({
      where: { taskId, deletedAt: null },
      include: subtaskInclude,
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map((s) => this.toSubtask(s));
  }

  async create(taskId: string, dto: CreateSubtaskDto, user: AuthUser): Promise<Subtask> {
    const task = await this.getTaskOrThrow(taskId);
    await this.access.assertCan(task.case.projectId, user, 'canCreateTask');
    await this.access.assertCanSetAssignees(task.case.projectId, user, dto.assigneeIds ?? []);
    await this.assertAssigneesValid(dto.assigneeIds, task.case.projectId);
    await this.assertSubtaskTypeValid(dto.subtaskTypeId);

    const created = await this.prisma.$transaction(async (tx) => {
      const subtask = await tx.subtask.create({
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
    await this.access.assertVisible(subtask.task.case.projectId, user);
    return this.toSubtask(subtask);
  }

  async update(id: string, dto: UpdateSubtaskDto, user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.access.assertCan(existing.task.case.projectId, user, 'canEditTask');

    if (dto.assigneeIds) {
      await this.access.assertCanSetAssignees(
        existing.task.case.projectId,
        user,
        dto.assigneeIds,
        existing.assignees.map((a) => a.user.id),
      );
      await this.assertAssigneesValid(dto.assigneeIds, existing.task.case.projectId);
    }
    if (dto.subtaskTypeId !== undefined) {
      await this.assertSubtaskTypeValid(dto.subtaskTypeId);
    }

    const { assigneeIds, ...restDto } = dto;
    const isStatusChange = !!dto.status && dto.status !== existing.status;
    const previousAssignees = existing.assignees.map((a) => a.user.name);
    const previousAssigneeIds = existing.assignees.map((a) => a.user.id);

    const isDueDateChange =
      dto.dueDate !== undefined &&
      (dto.dueDate === null
        ? existing.dueDate !== null
        : !existing.dueDate || new Date(dto.dueDate).getTime() !== existing.dueDate.getTime());

    const changes = [
      ...this.activityLogs.buildFieldChanges(existing, restDto),
      ...(assigneeIds
        ? this.activityLogs.buildAssigneeChange(
            previousAssignees,
            await this.getUserNames(assigneeIds),
          )
        : []),
    ];

    const updated = await this.prisma.$transaction(async (tx) => {
      const subtask = await tx.subtask.update({
        where: { id },
        data: {
          ...restDto,
          ...(dto.dueDate !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),
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

    // Only notify newly assigned users to avoid duplicate notifications on edits
    if (assigneeIds) {
      const newlyAddedAssignees = assigneeIds.filter((uid) => !previousAssigneeIds.includes(uid));
      if (newlyAddedAssignees.length > 0) {
        this.notificationService.notifyAssignees({
          assigneeUserIds: newlyAddedAssignees,
          actorId: user.id,
          actorName: user.name,
          entityType: 'SUBTASK',
          entityId: id,
          entityTitle: dto.title ?? existing.title,
        }).catch((err) => {
          console.error('Failed to notify newly added assignees on subtask update:', err);
        });
      }
    }

    // Notify assigned users about due date changes with the exact dates
    const currentAssignees = assigneeIds ?? previousAssigneeIds;
    if (isDueDateChange && currentAssignees.length > 0) {
      this.notificationService.notifyDateChange({
        recipientUserIds: currentAssignees,
        actorId: user.id,
        actorName: user.name,
        entityType: 'SUBTASK',
        entityId: id,
        entityTitle: dto.title ?? existing.title,
        dateField: 'due date',
        oldDate: existing.dueDate,
        newDate: dto.dueDate ? new Date(dto.dueDate) : null,
      }).catch((err) => {
        console.error('Failed to notify due date change on subtask:', err);
      });
    }

    return this.toSubtask(updated);
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.access.assertCan(existing.task.case.projectId, user, 'canDeleteTask');

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
    await this.access.assertCanAssign(existing.task.case.projectId, user, assigneeIds, 'canEditTask');
    await this.assertAssigneesValid(assigneeIds, existing.task.case.projectId);

    const existingAssigneeIds = existing.assignees.map((a) => a.user.id);
    const newlyAddedIds = assigneeIds.filter((uid) => !existingAssigneeIds.includes(uid));

    const addedNames = await this.getUserNames(assigneeIds);
    const previousAssignees = existing.assignees.map((a) => a.user.name);

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
          description: `Assigned ${addedNames.join(', ')} to subtask "${existing.title}"`,
          changes: this.activityLogs.buildAssigneeChange(
            previousAssignees,
            // createMany skips duplicates, so the resulting set is the union.
            Array.from(new Set([...previousAssignees, ...addedNames])),
          ),
        },
        tx,
      );
    });

    if (newlyAddedIds.length > 0) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: newlyAddedIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'SUBTASK',
        entityId: id,
        entityTitle: existing.title,
      }).catch(() => {});
    }

    return this.findOne(id, user);
  }

  async unassignUser(id: string, userId: string, user: AuthUser): Promise<Subtask> {
    const existing = await this.getSubtaskDetailOrThrow(id);
    await this.access.assertCanAssign(existing.task.case.projectId, user, [userId], 'canEditTask');

    const removedName = existing.assignees.find((a) => a.user.id === userId)?.user.name;
    const previousAssignees = existing.assignees.map((a) => a.user.name);

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
          description: `Unassigned ${removedName ?? 'a user'} from subtask "${existing.title}"`,
          changes: this.activityLogs.buildAssigneeChange(
            previousAssignees,
            existing.assignees.filter((a) => a.user.id !== userId).map((a) => a.user.name),
          ),
        },
        tx,
      );
    });

    return this.findOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Authorization / lookups
  // ---------------------------------------------------------------------------



  /** Names for a set of user ids, for rendering an assignee change. */
  private async getUserNames(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { name: true },
    });
    return users.map((u) => u.name);
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
    const type = await this.prisma.configOption.findFirst({
      where: { id: subtaskTypeId, kind: 'SUBTASK_TYPE', isActive: true },
    });
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
      subtaskType: subtask.subtaskType && {
        id: subtask.subtaskType.id,
        name: subtask.subtaskType.label,
      },
      assignees: subtask.assignees.map((a) => a.user),
      createdBy: subtask.createdBy,
      createdAt: subtask.createdAt.toISOString(),
      updatedAt: subtask.updatedAt.toISOString(),
    };
  }
}
