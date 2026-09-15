import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { ActivityAction, EntityType, Prisma } from '@prisma/client';
import { AuthUser, CommentSummary } from '@sebsa-pm-tool/shared-models';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { FilterCommentDto } from './dto/filter-comment.dto';

const ADMIN_SYSTEM_ROLES: AuthUser['systemRole'][] = ['ADMIN', 'SUPER_ADMIN'];

const commentInclude = {
  author: { select: { id: true, name: true, email: true } },
  mentions: { include: { mentionedUser: { select: { id: true, name: true } } } },
  attachments: {
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      filePath: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.CommentInclude;

type CommentWithRelations = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

/** Where a comment thread hangs, resolved once and reused for authorization. */
interface CommentTarget {
  projectId: string;
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: ActivityLogsService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(filter: FilterCommentDto, user: AuthUser): Promise<CommentSummary[]> {
    const target = await this.resolveTarget(filter.caseId, filter.taskId);
    await this.assertVisible(target.projectId, user);

    const comments = await this.prisma.comment.findMany({
      where: { ...this.targetWhere(target), deletedAt: null },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });

    return this.toThreads(comments, user);
  }

  async create(dto: CreateCommentDto, user: AuthUser): Promise<CommentSummary> {
    const target = await this.resolveTarget(dto.caseId, dto.taskId);
    await this.assertCanComment(target.projectId, user);

    // A reply must belong to the same thread as its parent, or a caller could
    // graft a comment onto a project they cannot see.
    if (dto.parentCommentId) {
      await this.assertParentBelongsToTarget(dto.parentCommentId, target);
    }

    const mentionedUserIds = await this.resolveMentions(dto.mentionedUserIds, target.projectId);

    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          caseId: dto.caseId ?? null,
          taskId: dto.taskId ?? null,
          parentCommentId: dto.parentCommentId ?? null,
          authorId: user.id,
          body: dto.body,
          ...(mentionedUserIds.length > 0 && {
            mentions: { createMany: { data: mentionedUserIds.map((id) => ({ mentionedUserId: id })) } },
          }),
        },
        include: commentInclude,
      });

      await this.activityLogs.record(
        {
          projectId: target.projectId,
          entityType: target.entityType,
          entityId: target.entityId,
          entityLabel: target.entityLabel,
          action: ActivityAction.COMMENTED,
          actorId: user.id,
          description: `Commented on ${this.entityNoun(target.entityType)} "${target.entityLabel}"`,
        },
        tx,
      );

      return comment;
    });

    this.notifyMentions(mentionedUserIds, user, target);

    return this.toSummary(created, [], user);
  }

  async update(id: string, dto: UpdateCommentDto, user: AuthUser): Promise<CommentSummary> {
    const { comment, target } = await this.getCommentOrThrow(id);
    this.assertCanModify(comment, user);

    const mentionedUserIds = await this.resolveMentions(dto.mentionedUserIds, target.projectId);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Mentions are replaced wholesale so an edit that removes an @ removes
      // the mention row with it.
      await tx.commentMention.deleteMany({ where: { commentId: id } });

      return tx.comment.update({
        where: { id },
        data: {
          body: dto.body,
          isEdited: true,
          ...(mentionedUserIds.length > 0 && {
            mentions: { createMany: { data: mentionedUserIds.map((userId) => ({ mentionedUserId: userId })) } },
          }),
        },
        include: commentInclude,
      });
    });

    return this.toSummary(updated, [], user);
  }

  async remove(id: string, user: AuthUser): Promise<{ message: string }> {
    const { comment } = await this.getCommentOrThrow(id);
    this.assertCanModify(comment, user);

    // Soft delete keeps replies addressable and preserves the audit trail.
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });

    return { message: 'Comment deleted successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Target resolution
  // ---------------------------------------------------------------------------

  private async resolveTarget(caseId?: string, taskId?: string): Promise<CommentTarget> {
    if ((!caseId && !taskId) || (caseId && taskId)) {
      throw new BadRequestException('Provide exactly one of caseId or taskId.');
    }

    if (caseId) {
      const kase = await this.prisma.case.findFirst({
        where: { id: caseId, deletedAt: null },
        select: { id: true, title: true, projectId: true },
      });
      if (!kase) throw new NotFoundException('Case not found.');

      return {
        projectId: kase.projectId,
        entityType: EntityType.CASE,
        entityId: kase.id,
        entityLabel: kase.title,
      };
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, title: true, case: { select: { projectId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found.');

    return {
      projectId: task.case.projectId,
      entityType: EntityType.TASK,
      entityId: task.id,
      entityLabel: task.title,
    };
  }

  private targetWhere(target: CommentTarget): Prisma.CommentWhereInput {
    return target.entityType === EntityType.CASE
      ? { caseId: target.entityId }
      : { taskId: target.entityId };
  }

  private async getCommentOrThrow(id: string): Promise<{
    comment: CommentWithRelations;
    target: CommentTarget;
  }> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, deletedAt: null },
      include: commentInclude,
    });
    if (!comment) throw new NotFoundException('Comment not found.');

    const target = await this.resolveTarget(comment.caseId ?? undefined, comment.taskId ?? undefined);
    return { comment, target };
  }

  private async assertParentBelongsToTarget(
    parentCommentId: string,
    target: CommentTarget,
  ): Promise<void> {
    const parent = await this.prisma.comment.findFirst({
      where: { id: parentCommentId, deletedAt: null },
      select: { id: true, caseId: true, taskId: true, parentCommentId: true },
    });
    if (!parent) throw new NotFoundException('Parent comment not found.');

    const sameTarget =
      target.entityType === EntityType.CASE
        ? parent.caseId === target.entityId
        : parent.taskId === target.entityId;
    if (!sameTarget) {
      throw new BadRequestException('A reply must belong to the same thread as its parent.');
    }

    // One level only: replying to a reply would nest indefinitely in the UI.
    if (parent.parentCommentId) {
      throw new BadRequestException('Replies cannot be nested more than one level deep.');
    }
  }

  // ---------------------------------------------------------------------------
  // Authorization
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

  /** Read-only project roles can see a thread but not post to it. */
  private async assertCanComment(projectId: string, user: AuthUser): Promise<void> {
    if (ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: user.id, deletedAt: null },
      include: { role: { include: { privilegeGroup: true } } },
    });
    if (!membership || membership.role.privilegeGroup.isReadOnly) {
      throw new ForbiddenException('You do not have permission to comment on this project.');
    }
  }

  /** Authors edit their own words; admins may remove anyone's. */
  private assertCanModify(comment: CommentWithRelations, user: AuthUser): void {
    if (comment.authorId === user.id || ADMIN_SYSTEM_ROLES.includes(user.systemRole)) return;
    throw new ForbiddenException('You can only modify your own comments.');
  }

  /** Silently drops ids that aren't active members of the project, so a mention
   * can never be used to probe for users outside it. */
  private async resolveMentions(
    mentionedUserIds: string[] | undefined,
    projectId: string,
  ): Promise<string[]> {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(mentionedUserIds));
    const members = await this.prisma.projectMember.findMany({
      where: {
        projectId,
        userId: { in: uniqueIds },
        deletedAt: null,
        user: { isActive: true, deletedAt: null },
      },
      select: { userId: true },
    });

    return members.map((member) => member.userId);
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  /** Fire-and-forget: a notification failure must not fail the comment. */
  private notifyMentions(mentionedUserIds: string[], actor: AuthUser, target: CommentTarget): void {
    const recipients = mentionedUserIds.filter((id) => id !== actor.id);
    if (recipients.length === 0) return;

    this.notifications
      .createBulkNotifications(
        recipients.map((userId) => ({
          userId,
          type: 'MENTION' as const,
          title: `${actor.name} mentioned you`,
          message: `You were mentioned in a comment on "${target.entityLabel}".`,
          relatedEntityType: target.entityType,
          relatedEntityId: target.entityId,
        })),
      )
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /** Flat rows become one level of parent -> replies. */
  private toThreads(comments: CommentWithRelations[], user: AuthUser): CommentSummary[] {
    const repliesByParent = new Map<string, CommentWithRelations[]>();
    const roots: CommentWithRelations[] = [];

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const siblings = repliesByParent.get(comment.parentCommentId) ?? [];
        siblings.push(comment);
        repliesByParent.set(comment.parentCommentId, siblings);
      } else {
        roots.push(comment);
      }
    }

    return roots.map((root) =>
      this.toSummary(
        root,
        (repliesByParent.get(root.id) ?? []).map((reply) => this.toSummary(reply, [], user)),
        user,
      ),
    );
  }

  private toSummary(
    comment: CommentWithRelations,
    replies: CommentSummary[],
    user: AuthUser,
  ): CommentSummary {
    return {
      id: comment.id,
      caseId: comment.caseId,
      taskId: comment.taskId,
      parentCommentId: comment.parentCommentId,
      body: comment.body,
      isEdited: comment.isEdited,
      author: comment.author,
      mentions: comment.mentions.map((mention) => mention.mentionedUser),
      replies,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      canModify:
        comment.authorId === user.id || ADMIN_SYSTEM_ROLES.includes(user.systemRole),
      attachments: comment.attachments?.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        filePath: a.filePath,
        uploadedBy: a.uploadedBy,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  private entityNoun(entityType: EntityType): string {
    return entityType === EntityType.CASE ? 'case' : 'task';
  }
}
