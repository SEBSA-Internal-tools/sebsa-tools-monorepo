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
  TaskSummary,
  TaskListSummary,
  UpdateTaskResponse,
} from '@sebsa-pm-tool/shared-models';
import { Prisma, TaskType } from '@prisma/client';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { FilterTaskDto } from './dto/filter-task.dto';
import { CreateTaskDependencyDto } from './dto/create-task-dependency.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const taskDetailInclude = {
  createdBy: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  subtasks: {
    where: { deletedAt: null },
    select: { id: true, title: true, workflowStageId: true },
  },
} satisfies Prisma.TaskInclude;

type TaskWithDetail = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto, user: AuthUser): Promise<Task> {
    await this.assertCanCreate(dto.projectId, user);

    // Resolve the workflow stage: if the caller omits it, fall back to the
    // project's default Backlog stage (isDefault: true / order: 0).
    const workflowStageId =
      dto.workflowStageId ?? (await this.resolveBacklogStageId(dto.projectId));

    await this.assertWorkflowStageBelongsToProject(workflowStageId, dto.projectId);
    await this.assertSprintBelongsToProject(dto.sprintId, dto.projectId);
    await this.assertMilestoneBelongsToProject(dto.milestoneId, dto.projectId);
    await this.assertParentTaskBelongsToProject(dto.parentTaskId, dto.projectId);
    await this.assertAssigneesValid(dto.assigneeIds);
    await this.assertLabelsValid(dto.labelIds, dto.projectId);
    this.assertDatesValid(dto.startDate, dto.dueDate);

    const created = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          priority: dto.priority,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          storyPoints: dto.storyPoints,
          reminderLeadMinutes: dto.reminderLeadMinutes,
          project: { connect: { id: dto.projectId } },
          workflowStage: { connect: { id: workflowStageId } },
          createdBy: { connect: { id: user.id } },
          ...(dto.parentTaskId && { parentTask: { connect: { id: dto.parentTaskId } } }),
          ...(dto.sprintId && { sprint: { connect: { id: dto.sprintId } } }),
          ...(dto.milestoneId && { milestone: { connect: { id: dto.milestoneId } } }),
          ...(dto.assigneeIds?.length && {
            assignees: { createMany: { data: dto.assigneeIds.map((userId) => ({ userId })) } },
          }),
          ...(dto.labelIds?.length && {
            labels: { createMany: { data: dto.labelIds.map((labelId) => ({ labelId })) } },
          }),
        },
      });

      // "Task Status Workflow: transitions logged with actor and timestamp"
      // (FSD §5.4) — the very first row has fromStageId: null, matching the
      // schema's documented shape for a task's initial stage placement.
      await tx.taskStatusHistory.create({
        data: {
          taskId: task.id,
          fromStageId: null,
          toStageId: task.workflowStageId,
          changedById: user.id,
        },
      });

      return task;
    });

    return this.findOne(created.id, user);
  }

  async findAll(filter: FilterTaskDto, user: AuthUser): Promise<TaskSummary[]> {
    const where = await this.buildScopedWhere(filter, user);

    const tasks = await this.prisma.task.findMany({
      where,
      include: taskDetailInclude,
      orderBy: { [filter.sortBy]: filter.sortOrder },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
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
        type: true,
        workflowStageId: true,
        priority: true,
        dueDate: true,
        assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { [filter.sortBy]: filter.sortOrder },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    });

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      workflowStageId: task.workflowStageId,
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
      include: taskDetailInclude,
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return tasks.map((task) => this.toTaskSummary(task));
  }

  async findOne(id: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskDetailOrThrow(id);
    await this.assertVisible(task.projectId, user);
    return this.toTask(task);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser): Promise<UpdateTaskResponse> {
    const existing = await this.getTaskOrThrow(id);
    await this.assertCanEdit(existing.projectId, user);

    if (dto.parentTaskId && dto.parentTaskId === id) {
      throw new BadRequestException('A task cannot be its own parent task.');
    }
    if (dto.workflowStageId) {
      await this.assertWorkflowStageBelongsToProject(dto.workflowStageId, existing.projectId);
    }
    if (dto.sprintId) {
      await this.assertSprintBelongsToProject(dto.sprintId, existing.projectId);
    }
    if (dto.milestoneId) {
      await this.assertMilestoneBelongsToProject(dto.milestoneId, existing.projectId);
    }
    if (dto.parentTaskId) {
      await this.assertParentTaskBelongsToProject(dto.parentTaskId, existing.projectId);
    }
    if (dto.assigneeIds) {
      await this.assertAssigneesValid(dto.assigneeIds);
    }
    if (dto.labelIds) {
      await this.assertLabelsValid(dto.labelIds, existing.projectId);
    }
    if (dto.startDate || dto.dueDate) {
      this.assertDatesValid(
        dto.startDate ?? existing.startDate?.toISOString(),
        dto.dueDate ?? existing.dueDate?.toISOString(),
      );
    }

    const { assigneeIds, labelIds, ...restDto } = dto;
    const isStageChange = !!dto.workflowStageId && dto.workflowStageId !== existing.workflowStageId;

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

      if (isStageChange) {
        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            fromStageId: existing.workflowStageId,
            toStageId: dto.workflowStageId as string,
            changedById: user.id,
          },
        });
      }
    });

    const warnings = isStageChange
      ? await this.checkDependencyWarnings(id, existing.projectId, dto.workflowStageId as string)
      : [];

    return { task: await this.findOne(id, user), warnings };
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const task = await this.getTaskOrThrow(id);
    await this.assertCanDelete(task.projectId, user);

    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Task deleted successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Assignees
  // ---------------------------------------------------------------------------

  async assignUsers(taskId: string, assigneeIds: string[], user: AuthUser): Promise<Task> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.projectId, user);
    await this.assertAssigneesValid(assigneeIds);

    await this.prisma.taskAssignee.createMany({
      data: assigneeIds.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
    return this.findOne(taskId, user);
  }

  async unassignUser(taskId: string, userId: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.projectId, user);

    await this.prisma.taskAssignee.deleteMany({ where: { taskId, userId } });
    return this.findOne(taskId, user);
  }

  async getAssignees(taskId: string, user: AuthUser) {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertVisible(task.projectId, user);

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
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.projectId, user);
    await this.assertLabelsValid(labelIds, task.projectId);

    await this.prisma.taskLabel.createMany({
      data: labelIds.map((labelId) => ({ taskId, labelId })),
      skipDuplicates: true,
    });
    return this.findOne(taskId, user);
  }

  async detachLabel(taskId: string, labelId: string, user: AuthUser): Promise<Task> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.projectId, user);

    await this.prisma.taskLabel.deleteMany({ where: { taskId, labelId } });
    return this.findOne(taskId, user);
  }

  // ---------------------------------------------------------------------------
  // Subtasks
  // ---------------------------------------------------------------------------

  async getSubtasks(parentTaskId: string, user: AuthUser): Promise<TaskSummary[]> {
    const parent = await this.getTaskOrThrow(parentTaskId);
    await this.assertVisible(parent.projectId, user);

    const subtasks = await this.prisma.task.findMany({
      where: { parentTaskId, deletedAt: null },
      include: taskDetailInclude,
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map((task) => this.toTaskSummary(task));
  }

  async createSubtask(
    parentTaskId: string,
    dto: Omit<CreateTaskDto, 'projectId' | 'parentTaskId'>,
    user: AuthUser,
  ): Promise<Task> {
    const parent = await this.getTaskOrThrow(parentTaskId);
    const fullDto: CreateTaskDto = {
      ...dto,
      projectId: parent.projectId,
      parentTaskId: parent.id,
      type: dto.type ?? TaskType.SUBTASK,
    };
    return this.create(fullDto, user);
  }

  // ---------------------------------------------------------------------------
  // Dependencies (FSD §5.5)
  // ---------------------------------------------------------------------------

  async createDependency(
    taskId: string,
    dto: CreateTaskDependencyDto,
    user: AuthUser,
  ): Promise<void> {
    const sourceTask = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(sourceTask.projectId, user);
    const targetTask = await this.getTaskOrThrow(dto.targetTaskId);

    if (targetTask.id === sourceTask.id) {
      throw new BadRequestException('A task cannot depend on itself.');
    }
    if (targetTask.projectId !== sourceTask.projectId) {
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
    const task = await this.getTaskOrThrow(taskId);
    await this.assertCanEdit(task.projectId, user);

    const dependency = await this.prisma.taskDependency.findFirst({
      where: { id: dependencyId, sourceTaskId: taskId },
    });
    if (!dependency) {
      throw new NotFoundException('Dependency not found.');
    }
    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
  }

  async getDependencies(taskId: string, user: AuthUser): Promise<TaskDependenciesView> {
    const task = await this.getTaskOrThrow(taskId);
    await this.assertVisible(task.projectId, user);

    const taskRefSelect = { id: true, title: true, workflowStageId: true } as const;

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
      outgoing.filter((d) => d.type === type).map((d) => d.targetTask);

    return {
      blocks: byType('BLOCKS'),
      relatesTo: byType('RELATES_TO'),
      duplicateOf: byType('DUPLICATE_OF'),
      blockedBy: incomingBlocks.map((d) => d.sourceTask),
    };
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

  /** No workflow stage is marked "done" in the schema (stages are fully
   * custom per project), so this uses order as a heuristic: leaving the
   * project's first (order: 0) stage is treated as "starting work," and
   * warns if any BLOCKS-type incoming dependency isn't sitting in the
   * project's last-order stage yet. A heuristic, not a precise rule — worth
   * revisiting if a real "done" concept gets added to WorkflowStage. */
  private async checkDependencyWarnings(
    taskId: string,
    projectId: string,
    newStageId: string,
  ): Promise<string[]> {
    const initialStage = await this.prisma.workflowStage.findFirst({
      where: { projectId, order: 0 },
    });
    if (initialStage && newStageId === initialStage.id) {
      return [];
    }

    const finalStage = await this.prisma.workflowStage.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
    });

    const blockers = await this.prisma.taskDependency.findMany({
      where: { targetTaskId: taskId, type: 'BLOCKS' },
      include: { sourceTask: { select: { title: true, workflowStageId: true } } },
    });

    return blockers
      .filter((b) => !finalStage || b.sourceTask.workflowStageId !== finalStage.id)
      .map((b) => `Task is blocked by "${b.sourceTask.title}" which is not yet done.`);
  }

  // ---------------------------------------------------------------------------
  // Authorization
  // ---------------------------------------------------------------------------

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
   * can see: an explicit projectId is visibility-checked, otherwise results
   * are limited to the caller's own project memberships (system-privileged
   * roles see everything, matching ProjectsService's bypass pattern). */
  private async buildScopedWhere(
    filter: FilterTaskDto,
    user: AuthUser,
  ): Promise<Prisma.TaskWhereInput> {
    const isPrivileged =
      ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';

    if (filter.projectId) {
      await this.assertVisible(filter.projectId, user);
    } else if (!isPrivileged) {
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { projectId: true },
      });
      const projectIds = memberships.map((m) => m.projectId);
      return { ...this.buildFilterWhere(filter), projectId: { in: projectIds } };
    }

    return this.buildFilterWhere(filter);
  }

  private buildFilterWhere(filter: FilterTaskDto): Prisma.TaskWhereInput {
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
      where.assignees = { some: { userId: filter.assigneeId } };
    }
    if (filter.labelId) {
      where.labels = { some: { labelId: filter.labelId } };
    }
    if (filter.priority) {
      where.priority = filter.priority;
    }
    if (filter.type) {
      where.type = filter.type;
    }
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
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

  private async assertWorkflowStageBelongsToProject(
    workflowStageId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!workflowStageId) return; // already resolved upstream — nothing to validate
    const stage = await this.prisma.workflowStage.findFirst({
      where: { id: workflowStageId, projectId },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException('Workflow stage does not belong to the selected project.');
    }
  }

  /**
   * Finds the project's default Backlog stage — the one seeded automatically on
   * project creation (isDefault: true, order: 0).  Throws a clear 400 if the
   * project somehow has no default stage (data integrity issue).
   */
  private async resolveBacklogStageId(projectId: string): Promise<string> {
    const stage = await this.prisma.workflowStage.findFirst({
      where: { projectId, OR: [{ isDefault: true }, { order: 0 }] },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    if (!stage) {
      throw new BadRequestException(
        'This project has no default workflow stage. ' +
          'Please add a workflow stage before creating tasks.',
      );
    }
    return stage.id;
  }

  private async assertSprintBelongsToProject(
    sprintId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!sprintId) return;
    const sprint = await this.prisma.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true },
    });
    if (!sprint) {
      throw new BadRequestException('Sprint does not belong to the selected project.');
    }
  }

  private async assertMilestoneBelongsToProject(
    milestoneId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!milestoneId) return;
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!milestone) {
      throw new BadRequestException('Milestone does not belong to the selected project.');
    }
  }

  private async assertParentTaskBelongsToProject(
    parentTaskId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!parentTaskId) return;
    const task = await this.prisma.task.findFirst({
      where: { id: parentTaskId, projectId, deletedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new BadRequestException('Parent task does not belong to the selected project.');
    }
  }

  private async assertAssigneesValid(assigneeIds: string[] | undefined): Promise<void> {
    if (!assigneeIds || assigneeIds.length === 0) return;

    const uniqueIds = Array.from(new Set(assigneeIds));
    const count = await this.prisma.user.count({
      where: { id: { in: uniqueIds }, isActive: true, deletedAt: null },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException('One or more assigned users do not exist or are inactive.');
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

  // ---------------------------------------------------------------------------
  // Lookups & mapping
  // ---------------------------------------------------------------------------

  private async getTaskOrThrow(id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
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

  private toTaskSummary(task: TaskWithDetail): TaskSummary {
    return {
      id: task.id,
      projectId: task.projectId,
      parentTaskId: task.parentTaskId,
      title: task.title,
      type: task.type,
      priority: task.priority,
      workflowStageId: task.workflowStageId,
      sprintId: task.sprintId,
      milestoneId: task.milestoneId,
      startDate: task.startDate ? task.startDate.toISOString() : null,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      storyPoints: task.storyPoints,
      createdBy: task.createdBy,
      assignees: task.assignees.map((a) => a.user),
      labels: task.labels.map((l) => l.label),
      subtaskCount: task.subtasks.length,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      description: task.description,
    };
  }

  private toTask(task: TaskWithDetail): Task {
    return {
      ...this.toTaskSummary(task),
      subtasks: task.subtasks,
    };
  }
}
