import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import {
  AuthUser,
  Task,
  TaskDependenciesView,
  TaskDependencyTaskRef,
  TaskStatusHistoryEntry,
  TaskSummary,
  TaskListSummary,
  UpdateTaskResponse,
} from '@sebsa-pm-tool/shared-models';
import { ActivityAction, EntityType, Prisma, TaskCategory } from '@prisma/client';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { FilterTaskDto } from './dto/filter-task.dto';
import { CreateTaskDependencyDto } from './dto/create-task-dependency.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationService } from '../notifications/notification.service';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const taskSummarySelect = {
  id: true,
  caseId: true,
  title: true,
  description: true,
  status: true,
  priorityId: true,
  dueDate: true,
  jiraStatusLabel: true,
  category: true,
  taskTypeId: true,
  complexityLevelId: true,
  case: { select: { id: true, title: true, type: true, projectId: true, isCsoLabeled: true } },
  priority: { select: { id: true, name: true, color: true } },
  taskType: { select: { id: true, name: true } },
  complexityLevel: { select: { id: true, name: true, color: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.TaskSelect;

type TaskWithSummary = Prisma.TaskGetPayload<{ select: typeof taskSummarySelect }>;

const taskDetailInclude = {
  createdBy: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  subtasks: {
    where: { deletedAt: null },
    select: { id: true, title: true, status: true },
  },
  case: { select: { id: true, title: true, type: true, projectId: true, isCsoLabeled: true } },
  priority: { select: { id: true, name: true, color: true } },
  taskType: { select: { id: true, name: true } },
  complexityLevel: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TaskInclude;

type TaskWithDetail = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: ActivityLogsService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateTaskDto, user: AuthUser): Promise<Task> {
    const kase = await this.getCaseOrThrow(dto.caseId);
    await this.assertCanCreate(kase.projectId, user);

    const priorityId = dto.priorityId ?? (await this.resolveDefaultPriorityId(kase.projectId));

    await this.assertAssigneesValid(dto.assigneeIds, kase.projectId);
    await this.assertLabelsValid(dto.labelIds, kase.projectId);
    this.assertDatesValid(dto.startDate, dto.dueDate);
    await this.assertComplexityLevelValid(dto.taskTypeId, dto.complexityLevelId);
    this.assertCsoCategoryRequirement(kase.isCsoLabeled, dto.category);

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          storyPoints: dto.storyPoints,
          reminderLeadMinutes: dto.reminderLeadMinutes,
          jiraStatusLabel: dto.jiraStatusLabel,
          category: dto.category,
          case: { connect: { id: dto.caseId } },
          priority: { connect: { id: priorityId } },
          createdBy: { connect: { id: user.id } },
          ...(dto.taskTypeId && { taskType: { connect: { id: dto.taskTypeId } } }),
          ...(dto.complexityLevelId && { complexityLevel: { connect: { id: dto.complexityLevelId } } }),
          ...(dto.assigneeIds?.length && {
            assignees: { createMany: { data: dto.assigneeIds.map((userId) => ({ userId })) } },
          }),
          ...(dto.labelIds?.length && {
            labels: { createMany: { data: dto.labelIds.map((labelId) => ({ labelId })) } },
          }),
        },
      });

      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: null,
          toStatus: task.status,
          changedById: user.id,
        },
      });

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.TASK,
          entityId: task.id,
          entityLabel: task.title,
          action: ActivityAction.CREATED,
          actorId: user.id,
          description: `Created task "${task.title}"`,
        },
        tx,
      );

      return task;
    });

    if (dto.assigneeIds?.length) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: dto.assigneeIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'TASK',
        entityId: created.id,
        entityTitle: dto.title,
      }).catch(() => { /* error swallowed by notification service */ });
    }

    return this.findOne(created.id, user);
  }

  async findAll(filter: FilterTaskDto, user: AuthUser): Promise<TaskSummary[]> {
    const where = await this.buildScopedWhere(filter, user);

    const tasks = await this.prisma.task.findMany({
      where,
      select: taskSummarySelect,
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((task) => this.toTaskSummary(task));
  }

  async getTaskList(filter: FilterTaskDto, user: AuthUser): Promise<TaskListSummary[]> {
    const where = await this.buildScopedWhere(filter, user);

    const tasks = await this.prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priorityId: true,
        priority: { select: { id: true, name: true, color: true } },
        dueDate: true,
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priorityId: task.priorityId,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      assignee: task.assignees[0]?.user || null,
    }));
  }

  async getMyAssignedTasks(user: AuthUser): Promise<TaskSummary[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        assignees: {
          some: {
            userId: user.id,
          },
        },
      },
      select: taskSummarySelect,
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return tasks.map((task) => this.toTaskSummary(task));
  }

  async findOne(id: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskDetailOrThrow(id);
    await this.assertVisible(task.case.projectId, user);
    return this.toTask(task);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser): Promise<UpdateTaskResponse> {
    const existing = await this.getTaskWithProjectOrThrow(id);
    await this.assertCanEdit(existing.case.projectId, user);

    if (dto.assigneeIds) {
      await this.assertAssigneesValid(dto.assigneeIds, existing.case.projectId);
    }
    if (dto.labelIds) {
      await this.assertLabelsValid(dto.labelIds, existing.case.projectId);
    }
    if (dto.startDate || dto.dueDate) {
      this.assertDatesValid(
        dto.startDate ?? existing.startDate?.toISOString(),
        dto.dueDate ?? existing.dueDate?.toISOString(),
      );
    }

    const mergedTaskTypeId = dto.taskTypeId !== undefined ? dto.taskTypeId : existing.taskTypeId ?? undefined;
    const mergedComplexityLevelId =
      dto.complexityLevelId !== undefined ? dto.complexityLevelId : existing.complexityLevelId ?? undefined;
    await this.assertComplexityLevelValid(mergedTaskTypeId, mergedComplexityLevelId);

    const mergedCategory = dto.category !== undefined ? dto.category : existing.category;
    this.assertCsoCategoryRequirement(existing.case.isCsoLabeled, mergedCategory);

    const { assigneeIds, labelIds, ...restDto } = dto;
    const isStatusChange = !!dto.status && dto.status !== existing.status;
    const changes = [
      ...this.activityLogs.buildFieldChanges(existing, restDto),
      ...(assigneeIds
        ? this.activityLogs.buildAssigneeChange(
            await this.getAssigneeNames(id),
            await this.getUserNames(assigneeIds),
          )
        : []),
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          ...restDto,
          ...(dto.startDate && { startDate: new Date(dto.startDate) }),
          ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
          ...(assigneeIds && {
            assignees: { deleteMany: {}, createMany: { data: assigneeIds.map((userId) => ({ userId })) } },
          }),
          ...(labelIds && {
            labels: { deleteMany: {}, createMany: { data: labelIds.map((labelId) => ({ labelId })) } },
          }),
        },
      });

      if (isStatusChange) {
        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            fromStatus: existing.status,
            toStatus: dto.status,
            changedById: user.id,
          },
        });
      }

      // TaskStatusHistory stays the authoritative status timeline; this adds
      // the same move to the cross-entity feed, plus any non-status edits in
      // the request, as a single entry.
      if (changes.length > 0 || assigneeIds || labelIds) {
        await this.activityLogs.record(
          {
            projectId: existing.case.projectId,
            entityType: EntityType.TASK,
            entityId: id,
            entityLabel: dto.title ?? existing.title,
            action: isStatusChange ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
            actorId: user.id,
            description: isStatusChange
              ? `Moved task "${existing.title}" from ${existing.status} to ${dto.status}`
              : `Updated task "${existing.title}"`,
            changes,
          },
          tx,
        );
      }
    });

    const warnings = isStatusChange
      ? await this.checkDependencyWarnings(id, dto.status as string)
      : [];

    if (dto.assigneeIds?.length) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: dto.assigneeIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'TASK',
        entityId: id,
        entityTitle: existing.title,
      }).catch(() => {});
    }

    if (isStatusChange && dto.status) {
      this.prisma.taskAssignee
        .findMany({
          where: { taskId: id },
          select: { userId: true },
        })
        .then((taskAssignees) => {
          const recipientIds = [
            ...taskAssignees.map((a) => a.userId),
            existing.createdById,
          ].filter(Boolean);

          return this.notificationService.notifyStatusChange({
            recipientUserIds: Array.from(new Set(recipientIds)),
            actorId: user.id,
            actorName: user.name,
            entityType: 'TASK',
            entityId: id,
            entityTitle: existing.title,
            newStatus: dto.status as string,
          });
        })
        .catch(() => {});
    }

    return { task: await this.findOne(id, user), warnings };
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const task = await this.getTaskWithProjectOrThrow(id);
    await this.assertCanDelete(task.case.projectId, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });

      await this.activityLogs.record(
        {
          projectId: task.case.projectId,
          entityType: EntityType.TASK,
          entityId: id,
          entityLabel: task.title,
          action: ActivityAction.DELETED,
          actorId: user.id,
          description: `Deleted task "${task.title}"`,
        },
        tx,
      );
    });

    return { message: 'Task deleted successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Assignees
  // ---------------------------------------------------------------------------

  async assignUsers(taskId: string, assigneeIds: string[], user: AuthUser): Promise<Task> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);
    await this.assertAssigneesValid(assigneeIds, task.case.projectId);

    const addedNames = await this.getUserNames(assigneeIds);
    const previousAssignees = await this.getAssigneeNames(taskId);

    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId, userId })),
        skipDuplicates: true,
      });

      await this.activityLogs.record(
        {
          projectId: task.case.projectId,
          entityType: EntityType.TASK,
          entityId: taskId,
          entityLabel: task.title,
          action: ActivityAction.ASSIGNED,
          actorId: user.id,
          description: `Assigned ${addedNames.join(', ')} to task "${task.title}"`,
          changes: this.activityLogs.buildAssigneeChange(
            previousAssignees,
            // createMany skips duplicates, so the resulting set is the union.
            Array.from(new Set([...previousAssignees, ...addedNames])),
          ),
        },
        tx,
      );
    });

    this.notificationService.notifyAssignees({
      assigneeUserIds: assigneeIds,
      actorId: user.id,
      actorName: user.name,
      entityType: 'TASK',
      entityId: taskId,
      entityTitle: task.title,
    }).catch(() => {});

    return this.findOne(taskId, user);
  }

  async unassignUser(taskId: string, userId: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);

    const removed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const previousAssignees = await this.getAssigneeNames(taskId);

    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId, userId } });

      await this.activityLogs.record(
        {
          projectId: task.case.projectId,
          entityType: EntityType.TASK,
          entityId: taskId,
          entityLabel: task.title,
          action: ActivityAction.UNASSIGNED,
          actorId: user.id,
          description: `Unassigned ${removed?.name ?? 'a user'} from task "${task.title}"`,
          changes: this.activityLogs.buildAssigneeChange(
            previousAssignees,
            previousAssignees.filter((name) => name !== removed?.name),
          ),
        },
        tx,
      );
    });

    return this.findOne(taskId, user);
  }

  async getAssignees(taskId: string, user: AuthUser) {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertVisible(task.case.projectId, user);

    const assignees = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return assignees.map((a) => a.user);
  }

  // ---------------------------------------------------------------------------
  // Labels on a task (attaching/detaching an existing label — creating new
  // label definitions lives in LabelsService, gated separately)
  // ---------------------------------------------------------------------------

  async attachLabels(taskId: string, labelIds: string[], user: AuthUser): Promise<Task> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);
    await this.assertLabelsValid(labelIds, task.case.projectId);

    await this.prisma.taskLabel.createMany({
      data: labelIds.map((labelId) => ({ taskId, labelId })),
      skipDuplicates: true,
    });
    return this.findOne(taskId, user);
  }

  async detachLabel(taskId: string, labelId: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);

    await this.prisma.taskLabel.deleteMany({ where: { taskId, labelId } });
    return this.findOne(taskId, user);
  }

  // ---------------------------------------------------------------------------
  // Dependencies (FSD §5.5) — Task-level only, unchanged in shape.
  // ---------------------------------------------------------------------------

  async createDependency(
    taskId: string,
    dto: CreateTaskDependencyDto,
    user: AuthUser,
  ): Promise<void> {
    const sourceTask = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(sourceTask.case.projectId, user);
    const targetTask = await this.getTaskWithProjectOrThrow(dto.targetTaskId);

    if (targetTask.id === sourceTask.id) {
      throw new BadRequestException('A task cannot depend on itself.');
    }
    if (targetTask.case.projectId !== sourceTask.case.projectId) {
      throw new BadRequestException('Dependencies must be within the same project.');
    }

    if (dto.type === 'BLOCKS' && (await this.wouldCreateCycle(sourceTask.id, targetTask.id))) {
      throw new BadRequestException('This dependency would create a circular chain.');
    }

    try {
      await this.prisma.taskDependency.create({
        data: { sourceTaskId: sourceTask.id, targetTaskId: targetTask.id, type: dto.type },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('This dependency already exists.');
      }
      throw error;
    }
  }

  async removeDependency(taskId: string, dependencyId: string, user: AuthUser): Promise<void> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertCanEdit(task.case.projectId, user);

    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, sourceTaskId: taskId },
    });
    if (!dependency) {
      throw new NotFoundException('Dependency not found.');
    }
    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
  }

  async getDependencies(taskId: string, user: AuthUser): Promise<TaskDependenciesView> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertVisible(task.case.projectId, user);

    const taskRefSelect = { id: true, title: true, status: true } as const;

    const [outgoing, incomingBlocks] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { sourceTaskId: taskId },
        include: { targetTask: { select: taskRefSelect } },
      }),
      this.prisma.taskDependency.findMany({
        where: { targetTaskId: taskId, type: 'BLOCKS' },
        include: { sourceTask: { select: taskRefSelect } },
      }),
    ]);

    const byType = (type: Prisma.TaskDependencyWhereInput['type']): TaskDependencyTaskRef[] =>
      outgoing
        .filter((d) => d.type === type)
        .map((d) => ({ ...d.targetTask, dependencyId: d.id }));

    return {
      blocks: byType('BLOCKS'),
      relatesTo: byType('RELATES_TO'),
      duplicateOf: byType('DUPLICATE_OF'),
      blockedBy: incomingBlocks.map((d) => ({ ...d.sourceTask, dependencyId: d.id })),
    };
  }

  /** Ordered status-transition log for the Status/Flow Stepper — the initial
   *  placement (fromStatus: null) plus every subsequent change, oldest first. */
  async getStatusHistory(taskId: string, user: AuthUser): Promise<TaskStatusHistoryEntry[]> {
    const task = await this.getTaskWithProjectOrThrow(taskId);
    await this.assertVisible(task.case.projectId, user);

    const history = await this.prisma.taskStatusHistory.findMany({
      where: { taskId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'asc' },
    });

    return history.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedAt: entry.changedAt.toISOString(),
      changedBy: entry.changedBy,
    }));
  }

  /** Warns (doesn't block — Should Have, not Must Have, per the FSD) when a
   * task moves out of TO_DO while something that blocks it isn't DONE/
   * CANCELLED yet. Replaces the old "leaving the project's first workflow
   * stage" heuristic now that status is a fixed enum instead of a
   * per-project-ordered WorkflowStage list. */
  private async checkDependencyWarnings(taskId: string, newStatus: string): Promise<string[]> {
    if (newStatus === 'TO_DO') return [];

    const blockers = await this.prisma.taskDependency.findMany({
      where: { targetTaskId: taskId, type: 'BLOCKS' },
      include: { sourceTask: { select: { title: true, status: true } } },
    });

    return blockers
      .filter((b) => !['DONE', 'CANCELLED'].includes(b.sourceTask.status))
      .map((b) => `Task is blocked by "${b.sourceTask.title}" which is not yet done.`);
  }

  /** Adding sourceTaskId -> targetTaskId would cycle if targetTaskId can
   * already reach sourceTaskId by following existing BLOCKS edges. */
  private async wouldCreateCycle(sourceTaskId: string, targetTaskId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [targetTaskId];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current === sourceTaskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const outgoing = await this.prisma.taskDependency.findMany({
        where: { sourceTaskId: current, type: 'BLOCKS' },
        select: { targetTaskId: true },
      });
      queue.push(...outgoing.map((d) => d.targetTaskId));
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------------------

  /** Current assignee names on a task, for rendering an assignee change. */
  private async getAssigneeNames(taskId: string): Promise<string[]> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId },
      select: { user: { select: { name: true } } },
    });
    return rows.map((row) => row.user.name);
  }

  /** Names for a set of user ids, for rendering an assignee change. */
  private async getUserNames(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { name: true },
    });
    return users.map((u) => u.name);
  }

  private async getMembershipWithGroup(projectId: string, userId: string) {
    return this.prisma.projectMember.findFirst({
      where: { projectId, userId, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
  }

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

  private async assertCanCreate(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.getMembershipWithGroup(projectId, user.id);
    if (!membership || !membership.role.privilegeGroup.canCreateTask) {
      throw new ForbiddenException('You do not have permission to create tasks in this project.');
    }
  }

  private async assertCanEdit(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.getMembershipWithGroup(projectId, user.id);
    if (!membership || membership.role.privilegeGroup.isReadOnly) {
      throw new ForbiddenException('You do not have permission to edit tasks in this project.');
    }
  }

  private async assertCanDelete(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.getMembershipWithGroup(projectId, user.id);
    if (!membership || !membership.role.privilegeGroup.canDeleteTask) {
      throw new ForbiddenException('You do not have permission to delete tasks in this project.');
    }
  }

  /** Scopes findAll so it can never return tasks outside what the caller
   * can see: an explicit caseId/projectId is visibility-checked, otherwise
   * results are limited to the caller's own project memberships. */
  private async buildScopedWhere(
    filter: FilterTaskDto,
    user: AuthUser,
  ): Promise<Prisma.TaskWhereInput> {
    const isPrivileged =
      ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';

    if (filter.projectId) {
      await this.assertVisible(filter.projectId, user);
    } else if (filter.caseId) {
      const kase = await this.getCaseOrThrow(filter.caseId);
      await this.assertVisible(kase.projectId, user);
    } else if (!isPrivileged) {
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { projectId: true },
      });
      const projectIds = memberships.map((m) => m.projectId);
      return { ...this.buildFilterWhere(filter), case: { projectId: { in: projectIds } } };
    }

    return this.buildFilterWhere(filter);
  }

  private buildFilterWhere(filter: FilterTaskDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    where.deletedAt = null;

    if (filter.caseId) {
      where.caseId = filter.caseId;
    }
    if (filter.projectId) {
      where.case = { ...(where.case as object), projectId: filter.projectId };
    }
    if (filter.customerId) {
      where.case = { ...(where.case as object), project: { customerId: filter.customerId } };
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.createdById) {
      where.createdById = filter.createdById;
    }
    if (filter.assigneeId) {
      where.assignees = { some: { userId: filter.assigneeId } };
    }
    if (filter.unassigned) {
      where.assignees = { none: {} };
    }
    if (filter.labelId) {
      where.labels = { some: { labelId: filter.labelId } };
    }
    if (filter.category) {
      where.category = filter.category;
    }

    const andConditions: Prisma.TaskWhereInput[] = [];

    if (filter.isCsoLabeled !== undefined) {
      andConditions.push({ case: { isCsoLabeled: filter.isCsoLabeled } });
    }

    if (filter.search) {
      andConditions.push({
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' } },
          { description: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    if (filter.priorityId) {
      where.priorityId = filter.priorityId;
    }
    if (filter.dueBefore || filter.dueAfter) {
      where.dueDate = {};
      if (filter.dueBefore) where.dueDate.lte = new Date(filter.dueBefore);
      if (filter.dueAfter) where.dueDate.gte = new Date(filter.dueAfter);
    }

    return where;
  }

  // ---------------------------------------------------------------------------
  // Field-level validation
  // ---------------------------------------------------------------------------

  /** Fall back to the project's default priority (isDefault: true, or lowest order). */
  private async resolveDefaultPriorityId(projectId: string): Promise<string> {
    const priority = await this.prisma.projectPriority.findFirst({
      where: { projectId, OR: [{ isDefault: true }] },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (priority) return priority.id;

    const anyPriority = await this.prisma.projectPriority.findFirst({
      where: { projectId },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (!anyPriority) {
      throw new BadRequestException(
        'This project has no priorities configured. ' +
          'Please add a priority before creating tasks.',
      );
    }
    return anyPriority.id;
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
      throw new BadRequestException('One or more assigned users do not exist or are inactive.');
    }

    const memberCount = await this.prisma.projectMember.count({
      where: { userId: { in: uniqueIds }, projectId, deletedAt: null },
    });
    if (memberCount !== uniqueIds.length) {
      throw new BadRequestException('Assignees must be members of the project.');
    }
  }

  private async assertLabelsValid(
    labelIds: string[] | undefined,
    projectId: string,
  ): Promise<void> {
    if (!labelIds || labelIds.length === 0) return;

    const uniqueIds = Array.from(new Set(labelIds));
    const count = await this.prisma.label.count({
      where: { id: { in: uniqueIds }, projectId },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException('One or more labels do not belong to the selected project.');
    }
  }

  private assertDatesValid(startDate?: string, dueDate?: string): void {
    if (!startDate || !dueDate) return;
    if (new Date(dueDate) < new Date(startDate)) {
      throw new BadRequestException('Due date must be after start date.');
    }
  }

  /** A Task's category is independent of its Case's, but the same rule
   * applies: required whenever the parent Case is CSO, since that's what
   * routes it into a Functional/Technical queue. */
  private assertCsoCategoryRequirement(
    caseIsCsoLabeled: boolean,
    category: TaskCategory | null | undefined,
  ): void {
    if (caseIsCsoLabeled && !category) {
      throw new BadRequestException('A task on a CSO case must be tagged Functional or Technical.');
    }
  }

  private async assertComplexityLevelValid(
    taskTypeId: string | undefined,
    complexityLevelId: string | undefined,
  ): Promise<void> {
    if (taskTypeId) {
      const taskType = await this.prisma.taskType.findFirst({ where: { id: taskTypeId, isActive: true } });
      if (!taskType) {
        throw new BadRequestException('Task type does not exist or is inactive.');
      }
    }
    if (!complexityLevelId) return;

    const level = await this.prisma.taskComplexityLevel.findUnique({ where: { id: complexityLevelId } });
    if (!level) {
      throw new BadRequestException('Complexity level does not exist.');
    }
    if (!taskTypeId || level.taskTypeId !== taskTypeId) {
      throw new BadRequestException('Complexity level does not belong to the selected task type.');
    }
  }

  // ---------------------------------------------------------------------------
  // Lookups & mapping
  // ---------------------------------------------------------------------------

  private async getCaseOrThrow(id: string) {
    const kase = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, projectId: true, isCsoLabeled: true },
    });
    if (!kase) {
      throw new NotFoundException('Case not found.');
    }
    return kase;
  }

  private async getTaskWithProjectOrThrow(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: { case: { select: { projectId: true, isCsoLabeled: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  private async getTaskDetailOrThrow(id: string): Promise<TaskWithDetail> {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: taskDetailInclude,
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  private toTaskSummary(task: TaskWithSummary): TaskSummary {
    return {
      id: task.id,
      caseId: task.caseId,
      title: task.title,
      description: task.description,
      status: task.status,
      priorityId: task.priorityId,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      jiraStatusLabel: task.jiraStatusLabel,
      category: task.category,
      taskTypeId: task.taskTypeId,
      taskType: task.taskType,
      complexityLevelId: task.complexityLevelId,
      complexityLevel: task.complexityLevel,
      case: task.case,
      priority: task.priority,
      assignees: task.assignees.map((a) => a.user),
    };
  }

  private toTask(task: TaskWithDetail): Task {
    return {
      id: task.id,
      caseId: task.caseId,
      title: task.title,
      description: task.description,
      status: task.status,
      priorityId: task.priorityId,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      jiraStatusLabel: task.jiraStatusLabel,
      category: task.category,
      taskTypeId: task.taskTypeId,
      taskType: task.taskType,
      complexityLevelId: task.complexityLevelId,
      complexityLevel: task.complexityLevel,
      case: task.case,
      priority: task.priority,
      startDate: task.startDate ? task.startDate.toISOString() : null,
      storyPoints: task.storyPoints,
      reminderLeadMinutes: task.reminderLeadMinutes,
      createdBy: task.createdBy,
      assignees: task.assignees.map((a) => a.user),
      labels: task.labels.map((l) => l.label),
      subtaskCount: task.subtasks.length,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      subtasks: task.subtasks,
    };
  }
}
