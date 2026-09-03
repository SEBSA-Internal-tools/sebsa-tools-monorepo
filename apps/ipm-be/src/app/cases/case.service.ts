import {
  BadRequestException,
  ForbiddenException,
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
  TaskLabelSummary,
} from '@sebsa-pm-tool/shared-models';
import { ActivityAction, EntityType, Prisma, TaskCategory } from '@prisma/client';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { FilterCaseDto } from './dto/filter-case.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

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
  isCsoLabeled: true,
  category: true,
  jiraStatusLabel: true,
  project: { select: { id: true, name: true } },
  priority: { select: { id: true, name: true, color: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.CaseSelect;

type CaseWithSummary = Prisma.CaseGetPayload<{ select: typeof caseSummarySelect }>;

const caseDetailInclude = {
  createdBy: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  tasks: {
    where: { deletedAt: null },
    select: { id: true, title: true, status: true },
  },
  project: { select: { id: true, name: true } },
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
  ) {}

  async create(dto: CreateCaseDto, user: AuthUser): Promise<Case> {
    await this.assertCanCreate(dto.projectId, user);

    const priorityId = dto.priorityId ?? (await this.resolveDefaultPriorityId(dto.projectId));

    await this.assertSprintBelongsToProject(dto.sprintId, dto.projectId);
    await this.assertMilestoneBelongsToProject(dto.milestoneId, dto.projectId);
    await this.assertAssigneesValid(dto.assigneeIds, dto.projectId);
    await this.assertLabelsValid(dto.labelIds, dto.projectId);
    this.assertDatesValid(dto.startDate, dto.dueDate);
    this.assertCsoCategoryRequirement(dto.isCsoLabeled ?? false, dto.category);

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
          isCsoLabeled: dto.isCsoLabeled ?? false,
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

    return this.findOne(created.id, user);
  }

  async findAll(filter: FilterCaseDto, user: AuthUser): Promise<CaseSummary[]> {
    const where = await this.buildScopedWhere(filter, user);

    const cases = await this.prisma.case.findMany({
      where,
      select: caseSummarySelect,
      orderBy: { createdAt: 'desc' },
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
    await this.assertVisible(kase.projectId, user);
    return this.toCase(kase);
  }

  async update(id: string, dto: UpdateCaseDto, user: AuthUser): Promise<Case> {
    const existing = await this.getCaseOrThrow(id);
    await this.assertCanEdit(existing.projectId, user);

    if (dto.sprintId) {
      await this.assertSprintBelongsToProject(dto.sprintId, existing.projectId);
    }
    if (dto.milestoneId) {
      await this.assertMilestoneBelongsToProject(dto.milestoneId, existing.projectId);
    }
    if (dto.assigneeIds) {
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

    const mergedIsCsoLabeled = dto.isCsoLabeled ?? existing.isCsoLabeled;
    const mergedCategory = dto.category !== undefined ? dto.category : existing.category;
    this.assertCsoCategoryRequirement(mergedIsCsoLabeled, mergedCategory);

    const { assigneeIds, labelIds, ...restDto } = dto;
    const isStatusChange = !!dto.status && dto.status !== existing.status;
    const changes = this.activityLogs.buildFieldChanges(existing, restDto);

    const oldPrimaryAssignee = await this.prisma.caseAssignee.findFirst({
      where: { caseId: id },
      orderBy: { assignedAt: 'asc' },
      select: { userId: true },
    });
    const oldPrimaryAssigneeId = oldPrimaryAssignee?.userId ?? null;
    const newPrimaryAssigneeId = assigneeIds !== undefined ? assigneeIds[0] ?? null : oldPrimaryAssigneeId;
    const categoryChanged = dto.category !== undefined && dto.category !== existing.category;
    const assigneeChanged = assigneeIds !== undefined && newPrimaryAssigneeId !== oldPrimaryAssigneeId;

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({
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

    return this.findOne(id, user);
  }

  async delete(id: string, user: AuthUser): Promise<{ message: string }> {
    const kase = await this.getCaseOrThrow(id);
    await this.assertCanDelete(kase.projectId, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.case.update({ where: { id }, data: { deletedAt: new Date() } });

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
  // Assignees
  // ---------------------------------------------------------------------------

  async assignUsers(caseId: string, assigneeIds: string[], user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.assertCanEdit(kase.projectId, user);
    await this.assertAssigneesValid(assigneeIds, kase.projectId);

    const assignees = await this.prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { name: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.caseAssignee.createMany({
        data: assigneeIds.map((userId) => ({ caseId, userId })),
        skipDuplicates: true,
      });

      await this.activityLogs.record(
        {
          projectId: kase.projectId,
          entityType: EntityType.CASE,
          entityId: caseId,
          entityLabel: kase.title,
          action: ActivityAction.ASSIGNED,
          actorId: user.id,
          description: `Assigned ${assignees.map((a) => a.name).join(', ')} to case "${kase.title}"`,
        },
        tx,
      );
    });

    await this.recordCategoryAssignmentIfChanged(caseId, kase.category, user.id);
    return this.findOne(caseId, user);
  }

  async unassignUser(caseId: string, userId: string, user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.assertCanEdit(kase.projectId, user);

    const removed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

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
        },
        tx,
      );
    });

    await this.recordCategoryAssignmentIfChanged(caseId, kase.category, user.id);
    return this.findOne(caseId, user);
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
    await this.assertVisible(kase.projectId, user);

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
    await this.assertCanEdit(kase.projectId, user);
    await this.assertLabelsValid(labelIds, kase.projectId);

    await this.prisma.caseLabel.createMany({
      data: labelIds.map((labelId) => ({ caseId, labelId })),
      skipDuplicates: true,
    });
    return this.findOne(caseId, user);
  }

  async detachLabel(caseId: string, labelId: string, user: AuthUser): Promise<Case> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.assertCanEdit(kase.projectId, user);

    await this.prisma.caseLabel.deleteMany({ where: { caseId, labelId } });
    return this.findOne(caseId, user);
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  async getStatusHistory(caseId: string, user: AuthUser): Promise<CaseStatusHistoryEntry[]> {
    const kase = await this.getCaseOrThrow(caseId);
    await this.assertVisible(kase.projectId, user);

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
    await this.assertVisible(kase.projectId, user);

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
      throw new ForbiddenException('You do not have permission to create cases in this project.');
    }
  }

  private async assertCanEdit(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.getMembershipWithGroup(projectId, user.id);
    if (!membership || membership.role.privilegeGroup.isReadOnly) {
      throw new ForbiddenException('You do not have permission to edit cases in this project.');
    }
  }

  private async assertCanDelete(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.getMembershipWithGroup(projectId, user.id);
    if (!membership || !membership.role.privilegeGroup.canDeleteTask) {
      throw new ForbiddenException('You do not have permission to delete cases in this project.');
    }
  }

  private async buildScopedWhere(
    filter: FilterCaseDto,
    user: AuthUser,
  ): Promise<Prisma.CaseWhereInput> {
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

  private buildFilterWhere(filter: FilterCaseDto): Prisma.CaseWhereInput {
    const where: Prisma.CaseWhereInput = {};

    where.deletedAt = null;

    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.status) where.status = filter.status;
    if (filter.sprintId) where.sprintId = filter.sprintId;
    if (filter.milestoneId) where.milestoneId = filter.milestoneId;
    if (filter.createdById) where.createdById = filter.createdById;
    if (filter.assigneeId) where.assignees = { some: { userId: filter.assigneeId } };
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

  private assertCsoCategoryRequirement(
    isCsoLabeled: boolean,
    category: TaskCategory | null | undefined,
  ): void {
    if (isCsoLabeled && !category) {
      throw new BadRequestException('A CSO case must be tagged Functional or Technical.');
    }
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
