import { Injectable } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditRecordInput {
  actionType: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  taskId?: string | null;
  targetUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(client: AuditWriter, actor: AuthenticatedUser, input: AuditRecordInput) {
    return client.auditLog.create({
      data: {
        userId: actor.id,
        actorName: actor.name,
        actorRole: actor.roles.join(', '),
        action: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        ...(input.oldValue === undefined ? {} : { oldValues: input.oldValue }),
        ...(input.newValue === undefined ? {} : { newValues: input.newValue }),
        taskId: input.taskId ?? null,
        targetUserId: input.targetUserId ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }

  async findAll(query: AuditLogQueryDto) {
    const needle = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId === undefined ? {} : { userId: query.actorUserId }),
      ...(query.actorRole === undefined
        ? {}
        : { actorRole: { contains: query.actorRole, mode: 'insensitive' } }),
      ...(query.actionType === undefined ? {} : { action: query.actionType }),
      ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
      ...(query.dateFrom === undefined && query.dateTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.dateFrom === undefined ? {} : { gte: query.dateFrom }),
              ...(query.dateTo === undefined ? {} : { lte: query.dateTo }),
            },
          }),
      ...(needle === undefined || needle === ''
        ? {}
        : {
            OR: [
              { actorName: { contains: needle, mode: 'insensitive' } },
              { description: { contains: needle, mode: 'insensitive' } },
              { action: { contains: needle, mode: 'insensitive' } },
              { entityType: { contains: needle, mode: 'insensitive' } },
              { entityId: { contains: needle, mode: 'insensitive' } },
            ],
          }),
    };
    const page = query.page;
    const pageSize = query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private toResponse(item: AuditLog) {
    return {
      id: item.id,
      timestamp: item.createdAt.toISOString(),
      actorUserId: item.userId,
      actorName: item.actorName,
      actorRole: item.actorRole,
      actionType: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      description: item.description,
      oldValue: item.oldValues,
      newValue: item.newValues,
      taskId: item.taskId,
      targetUserId: item.targetUserId,
      metadata: item.metadata,
    };
  }
}
