import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HandoverStatus, Prisma, ReviewerAssignmentType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import type { ReassignHandoverDto } from './dto/reassign-handover.dto.js';
import {
  NotificationsService,
  TASK_REASSIGNED_NOTIFICATION,
} from '../notifications/notifications.service.js';

const handoverInclude = {
  task: true,
  fromReviewer: true,
  toReviewer: true,
} satisfies Prisma.HandoverTaskInclude;

type HandoverWithRelations = Prisma.HandoverTaskGetPayload<{ include: typeof handoverInclude }>;

@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll() {
    const handovers = await this.prisma.handoverTask.findMany({
      include: handoverInclude,
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
    });
    return handovers.map((handover) => this.toResponse(handover));
  }

  async reassign(id: string, dto: ReassignHandoverDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const handover = await tx.handoverTask.findUnique({
        where: { id },
        include: { task: true, fromReviewer: true },
      });
      if (!handover) throw new NotFoundException(`Handover ${id} was not found`);
      if (handover.status !== HandoverStatus.PENDING) {
        throw new ConflictException('This handover has already been resolved');
      }

      const reviewer = await tx.user.findFirst({
        where: {
          id: dto.reviewerId,
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: { some: { role: { code: 'REVIEWER', deletedAt: null } } },
        },
      });
      if (!reviewer) throw new BadRequestException('Select an active Reviewer');
      if (reviewer.id === handover.task.developerId) {
        throw new BadRequestException('A developer cannot review their own task');
      }

      const now = new Date();
      const resolved = await tx.handoverTask.updateMany({
        where: { id, status: HandoverStatus.PENDING },
        data: {
          status: HandoverStatus.REASSIGNED,
          toReviewerId: reviewer.id,
          reassignedBy: actor.id,
          reassignedAt: now,
        },
      });
      if (resolved.count !== 1) {
        throw new ConflictException('This handover was already reassigned');
      }

      const assigned = await tx.task.updateMany({
        where: {
          id: handover.taskId,
          currentReviewerId: null,
          status: { in: [TaskStatus.SUBMITTED, TaskStatus.RESUBMITTED] },
        },
        data: { currentReviewerId: reviewer.id, status: TaskStatus.IN_REVIEW },
      });
      if (assigned.count !== 1) {
        throw new ConflictException('The handed-over task is no longer available to reassign');
      }

      await tx.taskReviewerAssignment.updateMany({
        where: { taskId: handover.taskId, isCurrent: true },
        data: { isCurrent: false, unassignedAt: now },
      });
      await tx.taskReviewerAssignment.create({
        data: {
          taskId: handover.taskId,
          reviewerId: reviewer.id,
          assignedBy: actor.id,
          assignmentType: ReviewerAssignmentType.HANDOVER_REASSIGNED,
        },
      });
      await tx.taskStatusHistory.create({
        data: {
          taskId: handover.taskId,
          oldStatus: handover.task.status,
          newStatus: TaskStatus.IN_REVIEW,
          changedBy: actor.id,
          remarks: `Handover reassigned from ${handover.fromReviewer.fullName} to ${reviewer.fullName}`,
        },
      });
      await this.audit.record(tx, actor, {
        actionType: 'HANDOVER_REASSIGNED',
        entityType: 'HANDOVER',
        entityId: id,
        taskId: handover.taskId,
        targetUserId: reviewer.id,
        description: `${actor.name} reassigned task '${handover.task.title}' from ${handover.fromReviewer.fullName} to ${reviewer.fullName}. Handover reason: ${handover.reason ?? 'Not provided'}`,
        oldValue: {
          reviewerId: handover.fromReviewerId,
          reviewerName: handover.fromReviewer.fullName,
          reason: handover.reason,
        },
        newValue: { reviewerId: reviewer.id, reviewerName: reviewer.fullName },
      });
      await this.notifications.create(tx, {
        taskId: handover.taskId,
        recipientId: reviewer.id,
        type: TASK_REASSIGNED_NOTIFICATION,
        title: `${handover.task.title} reassigned to you`,
        message: `${actor.name} reassigned this review task to ${reviewer.fullName}.`,
      });

      const updated = await tx.handoverTask.findUnique({
        where: { id },
        include: handoverInclude,
      });
      if (!updated) throw new NotFoundException(`Handover ${id} was not found`);
      return this.toResponse(updated);
    });
  }

  private toResponse(handover: HandoverWithRelations) {
    const status = {
      PENDING: 'Pending',
      REASSIGNED: 'Reassigned',
      CANCELLED: 'Cancelled',
    }[handover.status];
    return {
      id: handover.id,
      taskId: handover.taskId,
      fromReviewerId: handover.fromReviewerId,
      fromReviewerName: handover.fromReviewer.fullName,
      reason: handover.reason ?? 'No reason provided',
      status,
      reassignedToId: handover.toReviewerId,
      reassignedToName: handover.toReviewer?.fullName ?? null,
      reassignedById: handover.reassignedBy,
      createdAt: handover.requestedAt.toISOString(),
      resolvedAt: handover.reassignedAt?.toISOString() ?? null,
    };
  }
}
