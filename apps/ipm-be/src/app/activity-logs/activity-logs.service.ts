import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import {
  ActivityFieldChange,
  ActivityLogEntry,
  ActivityLogMetadata,
  ActivityLogPage,
  AuditLogFilterOptions,
  AuthUser,
} from '@sebsa-pm-tool/shared-models';
import { QueryActivityLogsDto } from './dto/query-activity-logs.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const actorSelect = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

const activityLogInclude = { actor: { select: actorSelect } } satisfies Prisma.ActivityLogInclude;

type ActivityLogWithActor = Prisma.ActivityLogGetPayload<{ include: typeof activityLogInclude }>;

/** The slice of PrismaService shared with an interactive transaction client,
 * so `record()` can join a caller's `$transaction` instead of writing on its
 * own connection. */
type ActivityLogWriter = Pick<PrismaService, 'activityLog'>;

export interface RecordActivityInput {
  /** Null only for entries outside any project (e.g. system-level user admin). */
  projectId: string | null;
  entityType: EntityType;
  entityId: string;
  /** Name/title of the entity at write time, so the trail stays readable after
   * the entity is renamed or soft-deleted. */
  entityLabel?: string | null;
  action: ActivityAction;
  actorId: string | null;
  description: string;
  changes?: ActivityFieldChange[];
}

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Appends one entry to the ledger.
   *
   * Pass `tx` from inside a `$transaction` so the entry commits or rolls back
   * with the mutation it describes. Write failures deliberately propagate: an
   * audit trail that silently disagrees with the data it audits is worse than
   * one that fails loudly.
   */
  async record(input: RecordActivityInput, tx?: ActivityLogWriter): Promise<void> {
    const client = tx ?? this.prisma;

    const metadata: ActivityLogMetadata = {};
    if (input.entityLabel) {
      metadata.entityLabel = input.entityLabel;
    }
    if (input.changes?.length) {
      metadata.changes = input.changes;
    }

    await client.activityLog.create({
      data: {
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        description: input.description,
        metadata:
          Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonObject) : undefined,
      },
    });
  }

  /**
   * Reduces a DTO to the fields it actually changes, so an UPDATED entry records
   * `dueDate: 12 Sep -> 19 Sep` rather than an opaque "updated". Keys the caller
   * left `undefined` are untouched and skipped; an explicit `null` is a real
   * change to null.
   */
  buildFieldChanges<T extends object>(
    before: T,
    changes: Partial<Record<keyof T, unknown>>,
    ignore: Array<keyof T> = [],
  ): ActivityFieldChange[] {
    const result: ActivityFieldChange[] = [];

    for (const [field, next] of Object.entries(changes)) {
      if (next === undefined) continue;
      if (ignore.includes(field as keyof T)) continue;

      const from = this.stringifyValue((before as Record<string, unknown>)[field]);
      const to = this.stringifyValue(next);
      if (from === to) continue;

      result.push({ field, from, to });
    }

    return result;
  }

  private stringifyValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // Entity-scoped feed (project / case / task / subtask)
  // ---------------------------------------------------------------------------

  /**
   * Activity for one entity *and everything beneath it* — a case feed includes
   * its tasks and their subtasks — which is what makes the feed useful for
   * catching up on a work item rather than auditing a single row.
   */
  async findForEntity(
    entityType: EntityType,
    entityId: string,
    user: AuthUser,
    query: QueryActivityLogsDto,
  ): Promise<ActivityLogPage> {
    const { projectId, where } = await this.resolveEntityScope(entityType, entityId);
    await this.assertProjectVisible(projectId, user);

    const scoped: Prisma.ActivityLogWhereInput = {
      ...where,
      ...(query.action && { action: query.action }),
      ...(query.actorId && { actorId: query.actorId }),
    };

    return this.paginate(scoped, query.page, query.limit);
  }

  /**
   * Descendant ids are collected without filtering on `deletedAt` — the history
   * of a task that was later deleted is exactly what this feed exists to show.
   */
  private async resolveEntityScope(
    entityType: EntityType,
    entityId: string,
  ): Promise<{ projectId: string; where: Prisma.ActivityLogWhereInput }> {
    switch (entityType) {
      case EntityType.PROJECT: {
        const project = await this.prisma.project.findFirst({
          where: { id: entityId, deletedAt: null },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('Project not found.');

        // Every entry beneath a project carries its projectId, so the indexed
        // column answers this without enumerating descendants.
        return { projectId: entityId, where: { projectId: entityId } };
      }

      case EntityType.CASE: {
        const kase = await this.prisma.case.findUnique({
          where: { id: entityId },
          select: { id: true, projectId: true },
        });
        if (!kase) throw new NotFoundException('Case not found.');

        const tasks = await this.prisma.task.findMany({
          where: { caseId: entityId },
          select: { id: true },
        });
        const taskIds = tasks.map((task) => task.id);
        const subtasks = await this.prisma.subtask.findMany({
          where: { taskId: { in: taskIds } },
          select: { id: true },
        });

        return {
          projectId: kase.projectId,
          where: { entityId: { in: [entityId, ...taskIds, ...subtasks.map((s) => s.id)] } },
        };
      }

      case EntityType.TASK: {
        const task = await this.prisma.task.findUnique({
          where: { id: entityId },
          select: { id: true, case: { select: { projectId: true } } },
        });
        if (!task) throw new NotFoundException('Task not found.');

        const subtasks = await this.prisma.subtask.findMany({
          where: { taskId: entityId },
          select: { id: true },
        });

        return {
          projectId: task.case.projectId,
          where: { entityId: { in: [entityId, ...subtasks.map((s) => s.id)] } },
        };
      }

      case EntityType.SUBTASK: {
        const subtask = await this.prisma.subtask.findUnique({
          where: { id: entityId },
          select: { id: true, task: { select: { case: { select: { projectId: true } } } } },
        });
        if (!subtask) throw new NotFoundException('Subtask not found.');

        return { projectId: subtask.task.case.projectId, where: { entityId } };
      }

      default:
        throw new BadRequestException(
          `Activity feeds are available for PROJECT, CASE, TASK and SUBTASK — not ${entityType}.`,
        );
    }
  }

  /** Mirrors the project-visibility rule the domain services enforce. */
  private async assertProjectVisible(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole) || user.systemRole === 'EXECUTIVE') return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }
  }

  // ---------------------------------------------------------------------------
  // Global audit trail (Super Admin only — gated at the controller)
  // ---------------------------------------------------------------------------

  async findAudit(query: QueryAuditLogsDto): Promise<ActivityLogPage> {
    const where: Prisma.ActivityLogWhereInput = {
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.action && { action: query.action }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.projectId && { projectId: query.projectId }),
      ...(query.search && {
        description: { contains: query.search, mode: Prisma.QueryMode.insensitive },
      }),
      ...((query.dateFrom || query.dateTo) && {
        createdAt: {
          ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
          ...(query.dateTo && { lte: new Date(query.dateTo) }),
        },
      }),
    };

    return this.paginate(where, query.page, query.limit);
  }

  /** Values actually present in the log, so the audit screen's dropdowns offer
   * real choices rather than every theoretical one. */
  async getAuditFilterOptions(): Promise<AuditLogFilterOptions> {
    const [actors, loggedProjects] = await Promise.all([
      this.prisma.user.findMany({
        where: { activityLogEntries: { some: {} } },
        select: actorSelect,
        orderBy: { name: 'asc' },
      }),
      this.prisma.activityLog.findMany({
        where: { projectId: { not: null } },
        distinct: ['projectId'],
        select: { projectId: true },
      }),
    ]);

    const projectIds = loggedProjects
      .map((row) => row.projectId)
      .filter((id): id is string => id !== null);

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return {
      actors,
      projects,
      entityTypes: Object.values(EntityType),
      actions: Object.values(ActivityAction),
    };
  }

  // ---------------------------------------------------------------------------
  // Shared query plumbing
  // ---------------------------------------------------------------------------

  private async paginate(
    where: Prisma.ActivityLogWhereInput,
    page: number,
    limit: number,
  ): Promise<ActivityLogPage> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where,
        include: activityLogInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      entries: rows.map((row) => this.toEntry(row)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private toEntry(row: ActivityLogWithActor): ActivityLogEntry {
    const stored = (row.metadata ?? null) as ActivityLogMetadata | null;
    const { entityLabel, ...metadata } = stored ?? {};

    return {
      id: row.id,
      projectId: row.projectId,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: typeof entityLabel === 'string' ? entityLabel : null,
      action: row.action,
      description: row.description,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
