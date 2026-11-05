import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import {
  AuthUser,
  Case,
  CaseCategoryAssignmentEntry,
  CaseStatusHistoryEntry,
  CaseSummary,
} from '@sebsa-pm-tool/shared-models';
import { ActivityAction, EntityType, Prisma, SprintStatus, TaskCategory } from '@prisma/client';
import { CreateCaseDto } from './dto/create-case.dto';
import { CloneCaseDto } from './dto/clone-case.dto';
import { mapForTargetProject } from '../common/clone-mapping';
import { UpdateCaseDto } from './dto/update-case.dto';
import { FilterCaseDto } from './dto/filter-case.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationService } from '../notifications/notification.service';
import { ProjectAccessService } from '../common/project-access.service';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const caseSummarySelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  type: true,
  status: true,
  priorityId: true,
  sprintId: true,
  milestoneId: true,
  dueDate: true,
  startDate: true,
  createdAt: true,
  updatedAt: true,
  isCsoLabeled: true,
  category: true,
  jiraStatusLabel: true,
  project: { select: { id: true, name: true, isCsoProject: true } },
  priority: { select: { id: true, name: true, color: true } },
  assignees: { select: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.CaseSelect;

type CaseWithSummary = Prisma.CaseGetPayload<{ select: typeof caseSummarySelect }>;

const caseDetailInclude = {
  createdBy: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  labels: {
    where: { label: { deletedAt: null } },
    include: { label: { select: { id: true, name: true, color: true } } },
  },
  tasks: {
    where: { deletedAt: null },
    select: { id: true, title: true, status: true },
  },
  project: { select: { id: true, name: true, isCsoProject: true } },
  priority: { select: { id: true, name: true, color: true } },
  sprint: { select: { id: true, name: true } },
  milestone: { select: { id: true, name: true } },
} satisfies Prisma.CaseInclude;

type CaseWithDetail = Prisma.CaseGetPayload<{ include: typeof caseDetailInclude }>;

@Injectable()
export class CaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: ActivityLogsService,
    private readonly access: ProjectAccessService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateCaseDto, user: AuthUser): Promise<Case> {
    await this.access.assertCan(dto.projectId, user, 'canCreateCase');

    const priorityId = dto.priorityId ?? (await this.resolveDefaultPriorityId(dto.projectId));

    await this.assertSprintBelongsToProject(dto.sprintId, dto.projectId);
    await this.assertMilestoneBelongsToProject(dto.milestoneId, dto.projectId);
    await this.access.assertCanSetAssignees(dto.projectId, user, dto.assigneeIds ?? []);
    await this.assertAssigneesValid(dto.assigneeIds, dto.projectId);
    await this.assertLabelsValid(dto.labelIds, dto.projectId);
    this.assertDatesValid(dto.startDate, dto.dueDate);

    // A case is CSO-labeled if and only if its project is — never
    // independently settable by the client, so a normal-project case can
    // never carry the CSO tag and a CSO-project case can never drop it.
    const isCsoLabeled = await this.getProjectIsCso(dto.projectId);
    this.assertCsoCategoryRequirement(isCsoLabeled, dto.category);

    const created = await this.prisma.$transaction(async (tx) => {
      const kase = await tx.case.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          storyPoints: dto.storyPoints,
          isCsoLabeled,
          category: dto.category,
          jiraStatusLabel: dto.jiraStatusLabel,
          project: { connect: { id: dto.projectId } },
          priority: { connect: { id: priorityId } },
          createdBy: { connect: { id: user.id } },
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

      await tx.caseStatusHistory.create({
        data: {
          caseId: kase.id,
          fromStatus: null,
          toStatus: kase.status,
          changedById: user.id,
        },
      });

      if (kase.category) {
        await tx.caseCategoryAssignment.create({
          data: {
            caseId: kase.id,
            category: kase.category,
            assigneeId: dto.assigneeIds?.[0],
            changedById: user.id,
          },
        });
      }

      if (kase.sprintId) {
        await this.syncSprintStatus(tx, kase.sprintId, kase.projectId);
      }

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.CASE,
          entityId: kase.id,
          entityLabel: kase.title,
          action: ActivityAction.CREATED,
          actorId: user.id,
          description: `Created case "${kase.title}"`,
        },
        tx,
      );

      return kase;
    });

    if (dto.assigneeIds?.length) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: dto.assigneeIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'CASE',
        entityId: created.id,
        entityTitle: dto.title,
      }).catch(() => undefined);
    }

    return this.findOne(created.id, user);
  }

  /**
   * Copy a case (typically a closed one) as a fresh case: new id, status reset
   * to To Do, title as given (defaults to the original's). It can go to the
   * same project or another one the user can create cases in. Sprint is never
   * carried over, and the milestone only within the same project. Goes through
   * `create()` so permissions, validation, status history and the activity log
   * behave as for a hand-made case. With `includeTasks`, the case's tasks are
   * copied too, reset to To Do. `notes` lists anything that could not be
   * carried over.
   */
  async clone(
    id: string,
    dto: CloneCaseDto,
    user: AuthUser,
  ): Promise<{ item: Case; notes: string[] }> {
    const source = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignees: { select: { userId: true } },
        labels: { select: { labelId: true } },
        tasks: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            assignees: { select: { userId: true } },
            labels: { select: { labelId: true } },
          },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('Case not found.');
    }
    await this.access.assertVisible(source.projectId, user);

    const targetProjectId = dto.projectId ?? source.projectId;
    const sameProject = targetProjectId === source.projectId;
    const category = dto.category ?? source.category ?? undefined;

    const mapped = await mapForTargetProject(this.prisma, source.projectId, targetProjectId, {
      priorityId: source.priorityId,
      assigneeIds: source.assignees.map((a) => a.userId),
      labelIds: source.labels.map((l) => l.labelId),
    });
    const notes = [...mapped.notes];
    if (source.sprintId) notes.push('Sprint was not copied.');
    if (source.milestoneId && !sameProject) notes.push('Milestone was not copied (different project).');

    const copy = await this.create(
      {
        projectId: targetProjectId,
        title: dto.title ?? source.title,
        description: source.description ?? undefined,
        type: source.type,
        status: 'TO_DO',
        priorityId: mapped.priorityId,
        milestoneId: sameProject ? (source.milestoneId ?? undefined) : undefined,
        startDate: source.startDate?.toISOString(),
        dueDate: source.dueDate?.toISOString(),
        storyPoints: source.storyPoints ?? undefined,
        category,
        assigneeIds: mapped.assigneeIds,
        labelIds: mapped.labelIds,
      },
      user,
    );

    if (dto.includeTasks && source.tasks.length > 0) {
      await this.access.assertCan(targetProjectId, user, 'canCreateTask');
      const targetIsCso = await this.getProjectIsCso(targetProjectId);
      const defaultPriorityId = await this.resolveDefaultPriorityId(targetProjectId);

      const taskRows = [];
      for (const t of source.tasks) {
        const taskMapped = await mapForTargetProject(this.prisma, source.projectId, targetProjectId, {
          priorityId: t.priorityId,
          assigneeIds: t.assignees.map((a) => a.userId),
          labelIds: t.labels.map((l) => l.labelId),
        });
        taskRows.push({ task: t, mapped: taskMapped });
      }
      const droppedTaskRefs = taskRows.filter((r) => r.mapped.notes.length > 0).length;
      if (droppedTaskRefs > 0) {
        notes.push(
          `${droppedTaskRefs} copied task${droppedTaskRefs === 1 ? '' : 's'} lost a priority, assignee or label that does not exist in the target project.`,
        );
      }

      await this.prisma.$transaction(async (tx) => {
        for (const { task: t, mapped: m } of taskRows) {
          const created = await tx.task.create({
            data: {
              title: t.title,
              description: t.description,
              status: 'TO_DO',
              startDate: t.startDate,
              dueDate: t.dueDate,
              storyPoints: t.storyPoints,
              reminderLeadMinutes: t.reminderLeadMinutes,
              // A task on a CSO case must carry a category; fall back to the
              // case's own.
              category: t.category ?? (targetIsCso ? category : undefined) ?? null,
              case: { connect: { id: copy.id } },
              priority: { connect: { id: m.priorityId ?? defaultPriorityId } },
              createdBy: { connect: { id: user.id } },
              ...(t.taskTypeId && { taskType: { connect: { id: t.taskTypeId } } }),
              ...(t.complexityLevelId && {
                complexityLevel: { connect: { id: t.complexityLevelId } },
              }),
              ...(m.assigneeIds.length && {
                assignees: { createMany: { data: m.assigneeIds.map((userId) => ({ userId })) } },
              }),
              ...(m.labelIds.length && {
                labels: { createMany: { data: m.labelIds.map((labelId) => ({ labelId })) } },
              }),
            },
          });
          await tx.taskStatusHistory.create({
            data: { taskId: created.id, fromStatus: null, toStatus: 'TO_DO', changedById: user.id },
          });
          await this.activityLogs.record(
            {
              projectId: targetProjectId,
              entityType: EntityType.TASK,
              entityId: created.id,
              entityLabel: created.title,
              action: ActivityAction.CREATED,
              actorId: user.id,
              description: `Created task "${created.title}" (copied from case "${source.title}")`,
            },
            tx,
          );
        }
      });
      return { item: await this.findOne(copy.id, user), notes };
    }

    return { item: copy, notes };
  }

  async findAll(filter: FilterCaseDto, user: AuthUser): Promise<CaseSummary[]> {
    const where = await this.buildScopedWhere(filter, user);

    let orderBy: Prisma.CaseOrderByWithRelationInput = { createdAt: 'desc' };
    if (filter.sortBy) {
      orderBy = { [filter.sortBy]: filter.sortOrder ?? 'desc' };
    }

    const cases = await this.prisma.case.findMany({
      where,
      select: caseSummarySelect,
      orderBy,
    });

    return cases.map((kase) => this.toCaseSummary(kase));
  }

  async getMyAssignedCases(user: AuthUser): Promise<CaseSummary[]> {
    const cases = await this.prisma.case.findMany({
      where: {
        deletedAt: null,
        assignees: { some: { userId: user.id } },
      },
      select: caseSummarySelect,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return cases.map((kase) => this.toCaseSummary(kase));
  }

  async findOne(id: string, user: AuthUser): Promise<Case> {
    const kase = await this.getCaseDetailOrThrow(id);
    await this.access.assertVisible(kase.projectId, user);
    return this.toCase(kase);
  }

  async update(id: string, dto: UpdateCaseDto, user: AuthUser): Promise<Case> {
    const existing = await this.getCaseOrThrow(id);
    await this.access.assertCan(existing.projectId, user, 'canEditCase');

    if (dto.sprintId) {
      await this.assertSprintBelongsToProject(dto.sprintId, existing.projectId);
    }
    if (dto.milestoneId) {
      await this.assertMilestoneBelongsToProject(dto.milestoneId, existing.projectId);
    }
    if (dto.assigneeIds) {
      const currentIds = await this.prisma.caseAssignee
        .findMany({ where: { caseId: id }, select: { userId: true } })
        .then((rows) => rows.map((r) => r.userId));
      await this.access.assertCanSetAssignees(existing.projectId, user, dto.assigneeIds, currentIds);
      await this.assertAssigneesValid(dto.assigneeIds, existing.projectId);
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

    // isCsoLabeled always mirrors the case's (fixed) project, never the
    // client — see the identical rule in create().
    const isCsoLabeled = await this.getProjectIsCso(existing.projectId);
    const mergedCategory = dto.category !== undefined ? dto.category : existing.category;
    this.assertCsoCategoryRequirement(isCsoLabeled, mergedCategory);

    const { assigneeIds, labelIds, ...restDto } = dto;
    delete restDto.isCsoLabeled;
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

    const oldPrimaryAssignee = await this.prisma.caseAssignee.findFirst({
      where: { caseId: id },
      orderBy: { assignedAt: 'asc' },
      select: { userId: true },
    });
    const oldPrimaryAssigneeId = oldPrimaryAssignee?.userId ?? null;
    const newPrimaryAssigneeId = assigneeIds !== undefined ? assigneeIds[0] ?? null : oldPrimaryAssigneeId;
    const categoryChanged = dto.category !== undefined && dto.category !== existing.category;
    const assigneeChanged = assigneeIds !== undefined && newPrimaryAssigneeId !== oldPrimaryAssigneeId;

    const previousAssigneeIds = await this.prisma.caseAssignee
      .findMany({
        where: { caseId: id },
        select: { userId: true },
      })
      .then((rows) => rows.map((r) => r.userId));

    const isDueDateChange =
      dto.dueDate !== undefined &&
      (dto.dueDate === null
        ? existing.dueDate !== null
        : !existing.dueDate || new Date(dto.dueDate).getTime() !== existing.dueDate.getTime());

    const isStartDateChange =
      dto.startDate !== undefined &&
      (dto.startDate === null
        ? existing.startDate !== null
        : !existing.startDate || new Date(dto.startDate).getTime() !== existing.startDate.getTime());

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id },
        data: {
          ...restDto,
          ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
          ...(assigneeIds && {
            assignees: { deleteMany: {}, createMany: { data: assigneeIds.map((userId) => ({ userId })) } },
          }),
          ...(labelIds && {
            labels: { deleteMany: {}, createMany: { data: labelIds.map((labelId) => ({ labelId })) } },
          }),
        },
      });

      if (dto.status && dto.status !== existing.status) {
        await tx.caseStatusHistory.create({
          data: {
            caseId: id,
            fromStatus: existing.status,
            toStatus: dto.status,
            changedById: user.id,
          },
        });
      }

      if (mergedCategory && (categoryChanged || assigneeChanged)) {
        await tx.caseCategoryAssignment.create({
          data: {
            caseId: id,
            category: mergedCategory,
            assigneeId: newPrimaryAssigneeId,
            changedById: user.id,
          },
        });
      }

      if (dto.status !== undefined || dto.sprintId !== undefined) {
        const affectedSprintIds = new Set(
          [existing.sprintId, dto.sprintId].filter(
            (sprintId): sprintId is string => !!sprintId,
          ),
        );
        for (const sprintId of affectedSprintIds) {
          await this.syncSprintStatus(tx, sprintId, existing.projectId);
        }
      }

      // CaseStatusHistory and CaseCategoryAssignment remain the authoritative
      // per-dimension timelines; this adds one entry to the cross-entity feed
      // covering whatever the request actually changed.
      if (changes.length > 0 || assigneeIds || labelIds) {
        await this.activityLogs.record(
          {
            projectId: existing.projectId,
            entityType: EntityType.CASE,
            entityId: id,
            entityLabel: dto.title ?? existing.title,
            action: isStatusChange ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
            actorId: user.id,
            description: isStatusChange
              ? `Moved case "${existing.title}" from ${existing.status} to ${dto.status}`
              : `Updated case "${existing.title}"`,
            changes,
          },
          tx,
        );
      }
    });

    // Notify ONLY newly added assignees, not users who were already assigned
    if (dto.assigneeIds) {
      const newlyAddedAssignees = dto.assigneeIds.filter((userId) => !previousAssigneeIds.includes(userId));
      if (newlyAddedAssignees.length > 0) {
        this.notificationService.notifyAssignees({
          assigneeUserIds: newlyAddedAssignees,
          actorId: user.id,
          actorName: user.name,
          entityType: 'CASE',
          entityId: id,
          entityTitle: dto.title ?? existing.title,
        }).catch(() => undefined);
      }
    }

    // Notify assigned users about due date changes with the exact dates
    const currentAssignees = dto.assigneeIds ?? previousAssigneeIds;
    if (isDueDateChange && currentAssignees.length > 0) {
      this.notificationService.notifyDateChange({
        recipientUserIds: currentAssignees,
        actorId: user.id,
        actorName: user.name,
        entityType: 'CASE',
        entityId: id,
        entityTitle: dto.title ?? existing.title,
        dateField: 'due date',
        oldDate: existing.dueDate,
        newDate: dto.dueDate ? new Date(dto.dueDate) : null,
      }).catch(() => undefined);
    }

    if (isStartDateChange && currentAssignees.length > 0) {
      this.notificationService.notifyDateChange({
        recipientUserIds: currentAssignees,
        actorId: user.id,
        actorName: user.name,
        entityType: 'CASE',
        entityId: id,
        entityTitle: dto.title ?? existing.title,
        dateField: 'start date',
        oldDate: existing.startDate,
        newDate: dto.startDate ? new Date(dto.startDate) : null,
      }).catch(() => undefined);
    }

    if (dto.status && dto.status !== existing.status) {
      this.prisma.caseAssignee
        .findMany({
          where: { caseId: id },
          select: { userId: true },
        })
        .then((caseAssignees) => {
          const recipientIds = [
            ...caseAssignees.map((a) => a.userId),
            existing.createdById,
          ].filter(Boolean);

          return this.notificationService.notifyStatusChange({
            recipientUserIds: Array.from(new Set(recipientIds)),
            actorId: user.id,
            actorName: user.name,
            entityType: 'CASE',
            entityId: id,
            entityTitle: existing.title,
            newStatus: dto.status as string,
          });
        })
        .catch(() => undefined);
    }

    return this.findOne(id, user);
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const kase = await this.getCaseOrThrow(id);
    await this.access.assertCan(kase.projectId, user, 'canDeleteCase');

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({ where: { id }, data: { deletedAt: new Date() } });

      if (kase.sprintId) {
        await this.syncSprintStatus(tx, kase.sprintId, kase.projectId);
      }

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.CASE,
          entityId: id,
          entityLabel: kase.title,
          action: ActivityAction.DELETED,
          actorId: user.id,
          description: `Deleted case "${kase.title}"`,
        },
        tx,
      );
    });

    return { message: 'Case deleted successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Sprint lifecycle
  // ---------------------------------------------------------------------------

  /** Keep sprint lifecycle derived from its active cases. This runs in the
   * same transaction as each case mutation so the two records cannot drift. */
  private async syncSprintStatus(
    tx: Prisma.TransactionClient,
    sprintId: string,
    projectId: string,
  ): Promise<void> {
    const sprint = await tx.sprint.findFirst({
      where: { id: sprintId, projectId },
      select: { id: true, status: true },
    });
    if (!sprint) return;

    const cases = await tx.case.findMany({
      where: { sprintId, deletedAt: null },
      select: { status: true },
    });

    let nextStatus: SprintStatus = SprintStatus.PLANNED;
    if (
      cases.length > 0 &&
      cases.every((kase) => kase.status === 'DONE' || kase.status === 'CANCELLED')
    ) {
      nextStatus = SprintStatus.COMPLETED;
    } else if (cases.some((kase) => kase.status !== 'TO_DO')) {
      nextStatus = SprintStatus.ACTIVE;
    }

    if (nextStatus === sprint.status) return;

    if (nextStatus === SprintStatus.ACTIVE) {
      const activeSprint = await tx.sprint.findFirst({
        where: {
          projectId,
          status: SprintStatus.ACTIVE,
          id: { not: sprintId },
        },
        select: { name: true },
      });
      if (activeSprint) {
        throw new BadRequestException(
          `Cannot start work in this sprint while "${activeSprint.name}" is active.`,
        );
      }
    }

    await tx.sprint.update({
      where: { id: sprintId },
      data: { status: nextStatus },
    });
  }

  // ---------------------------------------------------------------------------
  // Assignees
  // ---------------------------------------------------------------------------

  async assignUsers(caseId: string, assigneeIds: string[], user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertCanAssign(kase.projectId, user, assigneeIds, 'canEditCase');
    await this.assertAssigneesValid(assigneeIds, kase.projectId);

    const existingAssignees = await this.prisma.caseAssignee
      .findMany({ where: { caseId }, select: { userId: true } })
      .then((rows) => rows.map((r) => r.userId));
    const newlyAddedIds = assigneeIds.filter((id) => !existingAssignees.includes(id));

    const addedNames = await this.getUserNames(assigneeIds);
    const previousAssignees = await this.getAssigneeNames(caseId);

    await this.prisma.$transaction(async (tx) => {
      // Replaces rather than adds to the existing assignee set — a case can
      // only ever have one owner.
      await tx.caseAssignee.deleteMany({ where: { caseId } });
      await tx.caseAssignee.createMany({
        data: assigneeIds.map((userId) => ({ caseId, userId })),
      });

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.CASE,
          entityId: caseId,
          entityLabel: kase.title,
          action: ActivityAction.ASSIGNED,
          actorId: user.id,
          description: `Assigned ${addedNames.join(', ')} to case "${kase.title}"`,
          // The set is replaced outright, so the resulting set is exactly
          // what was passed in — no union with the previous assignees.
          changes: this.activityLogs.buildAssigneeChange(previousAssignees, addedNames),
        },
        tx,
      );
    });

    await this.recordCategoryAssignmentIfChanged(caseId, kase.category, user.id);

    if (newlyAddedIds.length > 0) {
      this.notificationService.notifyAssignees({
        assigneeUserIds: newlyAddedIds,
        actorId: user.id,
        actorName: user.name,
        entityType: 'CASE',
        entityId: caseId,
        entityTitle: kase.title,
      }).catch(() => undefined);
    }

    return this.findOne(caseId, user);
  }

  async unassignUser(caseId: string, userId: string, user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertCanAssign(kase.projectId, user, [userId], 'canEditCase');

    const removed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const previousAssignees = await this.getAssigneeNames(caseId);

    await this.prisma.$transaction(async (tx) => {
      await tx.caseAssignee.deleteMany({ where: { caseId, userId } });

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.CASE,
          entityId: caseId,
          entityLabel: kase.title,
          action: ActivityAction.UNASSIGNED,
          actorId: user.id,
          description: `Unassigned ${removed?.name ?? 'a user'} from case "${kase.title}"`,
          changes: this.activityLogs.buildAssigneeChange(
            previousAssignees,
            previousAssignees.filter((name) => name !== removed?.name),
          ),
        },
        tx,
      );
    });

    await this.recordCategoryAssignmentIfChanged(caseId, kase.category, user.id);
    return this.findOne(caseId, user);
  }

  /** Current assignee names on a case, for rendering an assignee change. */
  private async getAssigneeNames(caseId: string): Promise<string[]> {
    const rows = await this.prisma.caseAssignee.findMany({
      where: { caseId },
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

  private async recordCategoryAssignmentIfChanged(
    caseId: string,
    category: TaskCategory | null,
    changedById: string,
  ): Promise<void> {
    if (!category) return;

    const latest = await this.prisma.caseCategoryAssignment.findFirst({
      where: { caseId },
      orderBy: { changedAt: 'desc' },
      select: { assigneeId: true, category: true },
    });
    const primaryAssignee = await this.prisma.caseAssignee.findFirst({
      where: { caseId },
      orderBy: { assignedAt: 'asc' },
      select: { userId: true },
    });
    const newAssigneeId = primaryAssignee?.userId ?? null;

    if (latest && latest.category === category && latest.assigneeId === newAssigneeId) {
      return;
    }

    await this.prisma.caseCategoryAssignment.create({
      data: { caseId, category, assigneeId: newAssigneeId, changedById },
    });
  }

  async getAssignees(caseId: string, user: AuthUser) {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertVisible(kase.projectId, user);

    const assignees = await this.prisma.caseAssignee.findMany({
      where: { caseId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return assignees.map((a) => a.user);
  }

  // ---------------------------------------------------------------------------
  // Labels
  // ---------------------------------------------------------------------------

  async attachLabels(caseId: string, labelIds: string[], user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertCan(kase.projectId, user, 'canEditCase');
    await this.assertLabelsValid(labelIds, kase.projectId);

    await this.prisma.caseLabel.createMany({
      data: labelIds.map((labelId) => ({ caseId, labelId })),
      skipDuplicates: true,
    });
    return this.findOne(caseId, user);
  }

  async detachLabel(caseId: string, labelId: string, user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertCan(kase.projectId, user, 'canEditCase');

    await this.prisma.caseLabel.deleteMany({ where: { caseId, labelId } });
    return this.findOne(caseId, user);
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  async getStatusHistory(caseId: string, user: AuthUser): Promise<CaseStatusHistoryEntry[]> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertVisible(kase.projectId, user);

    const history = await this.prisma.caseStatusHistory.findMany({
      where: { caseId },
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

  async getCategoryHistory(caseId: string, user: AuthUser): Promise<CaseCategoryAssignmentEntry[]> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.access.assertVisible(kase.projectId, user);

    const history = await this.prisma.caseCategoryAssignment.findMany({
      where: { caseId },
      include: {
        assignee: { select: { id: true, name: true } },
        changedBy: { select: { id: true, name: true } },
      },
      orderBy: { changedAt: 'asc' },
    });

    return history.map((entry) => ({
      id: entry.id,
      category: entry.category,
      assignee: entry.assignee,
      changedAt: entry.changedAt.toISOString(),
      changedBy: entry.changedBy,
    }));
  }

  // ---------------------------------------------------------------------------
  // Authorization (reuses the same PrivilegeGroup flags Task creation/
  // deletion used, since no separate Case-specific flag was introduced)
  // ---------------------------------------------------------------------------

  private async getMembershipWithGroup(projectId: string, userId: string) {
    return this.prisma.projectMember.findFirst({
      where: { projectId, userId, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
  }





  private async buildScopedWhere(
    filter: FilterCaseDto,
    user: AuthUser,
  ): Promise<Prisma.CaseWhereInput> {
    const isPrivileged =
      ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE';

    if (filter.projectId) {
      await this.access.assertVisible(filter.projectId, user);
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

  private buildFilterWhere(filter: FilterCaseDto): Prisma.CaseWhereInput {
    const where: Prisma.CaseWhereInput = {};

    where.deletedAt = null;

    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.status) where.status = filter.status;
    if (filter.sprintId) where.sprintId = filter.sprintId;
    if (filter.milestoneId) where.milestoneId = filter.milestoneId;
    if (filter.createdById) where.createdById = filter.createdById;
    if (filter.assigneeId) where.assignees = { some: { userId: filter.assigneeId } };
    if (filter.unassigned) where.assignees = { none: {} };
    if (filter.labelId) where.labels = { some: { labelId: filter.labelId } };
    if (filter.customerId) where.project = { customerId: filter.customerId };

    const andConditions: Prisma.CaseWhereInput[] = [];

    if (filter.isCsoLabeled !== undefined) {
      if (filter.isCsoLabeled) {
        andConditions.push({ OR: [{ isCsoLabeled: true }, { project: { isCsoProject: true } }] });
      } else {
        andConditions.push({ isCsoLabeled: false, project: { isCsoProject: false } });
      }
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

    if (filter.category) where.category = filter.category;
    if (filter.priorityId) where.priorityId = filter.priorityId;
    if (filter.type) where.type = filter.type;
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
        'This project has no priorities configured. Please add a priority before creating cases.',
      );
    }
    return anyPriority.id;
  }

  private async assertSprintBelongsToProject(
    sprintId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!sprintId) return;
    const sprint = await this.prisma.sprint.findFirst({
      where: { id: sprintId, projectId, deletedAt: null },
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
      where: { id: { in: uniqueIds }, projectId, deletedAt: null },
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

  private assertCsoCategoryRequirement(
    isCsoLabeled: boolean,
    category: TaskCategory | null | undefined,
  ): void {
    if (isCsoLabeled && !category) {
      throw new BadRequestException('A CSO case must be tagged Functional or Technical.');
    }
  }

  private async getProjectIsCso(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { isCsoProject: true },
    });
    if (!project) {
      throw new BadRequestException('Project does not exist.');
    }
    return project.isCsoProject;
  }

  // ---------------------------------------------------------------------------
  // Lookups & mapping
  // ---------------------------------------------------------------------------

  private async getCaseOrThrow(id: string) {
    const kase = await this.prisma.case.findFirst({ where: { id, deletedAt: null } });
    if (!kase) {
      throw new NotFoundException('Case not found.');
    }
    return kase;
  }

  private async getCaseDetailOrThrow(id: string): Promise<CaseWithDetail> {
    const kase = await this.prisma.case.findFirst({
      where: { id, deletedAt: null },
      include: caseDetailInclude,
    });
    if (!kase) {
      throw new NotFoundException('Case not found.');
    }
    return kase;
  }

  private toCaseSummary(kase: CaseWithSummary): CaseSummary {
    return {
      id: kase.id,
      projectId: kase.projectId,
      title: kase.title,
      description: kase.description,
      type: kase.type,
      status: kase.status,
      priorityId: kase.priorityId,
      sprintId: kase.sprintId,
      milestoneId: kase.milestoneId,
      dueDate: kase.dueDate ? kase.dueDate.toISOString() : null,
      startDate: kase.startDate ? kase.startDate.toISOString() : null,
      createdAt: kase.createdAt ? kase.createdAt.toISOString() : undefined,
      updatedAt: kase.updatedAt ? kase.updatedAt.toISOString() : undefined,
      isCsoLabeled: kase.isCsoLabeled,
      category: kase.category,
      jiraStatusLabel: kase.jiraStatusLabel,
      project: kase.project,
      priority: kase.priority,
      assignees: kase.assignees.map((a) => a.user),
    };
  }

  private toCase(kase: CaseWithDetail): Case {
    return {
      id: kase.id,
      projectId: kase.projectId,
      title: kase.title,
      description: kase.description,
      type: kase.type,
      status: kase.status,
      priorityId: kase.priorityId,
      sprintId: kase.sprintId,
      milestoneId: kase.milestoneId,
      dueDate: kase.dueDate ? kase.dueDate.toISOString() : null,
      startDate: kase.startDate ? kase.startDate.toISOString() : null,
      storyPoints: kase.storyPoints,
      isCsoLabeled: kase.isCsoLabeled,
      category: kase.category,
      jiraStatusLabel: kase.jiraStatusLabel,
      jiraIssueKey: kase.jiraIssueKey,
      jiraDescription: kase.jiraDescription,
      jiraSyncedAt: kase.jiraSyncedAt ? kase.jiraSyncedAt.toISOString() : null,
      project: kase.project,
      priority: kase.priority,
      sprint: kase.sprint,
      milestone: kase.milestone,
      assignees: kase.assignees.map((a) => a.user),
      labels: kase.labels.map((l) => l.label),
      createdBy: kase.createdBy,
      taskCount: kase.tasks.length,
      createdAt: kase.createdAt.toISOString(),
      updatedAt: kase.updatedAt.toISOString(),
      tasks: kase.tasks,
    };
  }
}
