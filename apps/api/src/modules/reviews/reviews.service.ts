import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CodeReviewAnswerValue,
  CodeReviewFormStatus,
  DeveloperDecision,
  Prisma,
  ReviewDecision,
  ReviewerDecision,
  TaskStatus,
} from '@prisma/client';
import {
  issueResponseDraftSchema,
  reviewCommentObjectSchema,
  reviewDraftSchema,
  reviewScopeSchema,
} from '@sdp/contracts';
import { z } from 'zod';
import { ApiException } from '../../common/api-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewTasksService } from '../review-tasks/review-tasks.service.js';

const reviewInclude = {
  reviewer: { select: { id: true, fullName: true } },
  answers: { include: { question: true }, orderBy: { question: { displayOrder: 'asc' } } },
  findings: {
    include: {
      creator: { select: { id: true, fullName: true } },
      screenshots: { orderBy: { uploadedAt: 'asc' } },
      responses: { orderBy: { respondedAt: 'asc' } },
    },
    orderBy: [{ findingNo: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.CodeReviewFormInclude;

type ReviewRow = Prisma.CodeReviewFormGetPayload<{ include: typeof reviewInclude }>;

// A draft may legitimately contain a newly-added, still-empty comment. The shared
// Review schema intentionally requires text for completed reviews, so the API uses
// this relaxed input shape only while saving a draft and applies completion rules
// in assertDecisionAllowed before a decision can be recorded.
export const reviewDraftInputSchema = reviewDraftSchema.extend({
  comments: z
    .array(
      reviewCommentObjectSchema.extend({
        reviewRound: z.number().int().min(1).optional(),
        reviewCycle: z.number().int().min(1).optional(),
        text: z.string(),
      }),
    )
    .default([]),
});

type ReviewDraftInput = z.infer<typeof reviewDraftInputSchema>;

export interface CycleFindingDecision {
  developerDecision: DeveloperDecision;
  reviewerDecision: ReviewerDecision;
}

export function shouldCountReviewCycle(
  findingCount: number,
  latestDecisions: readonly CycleFindingDecision[],
): boolean {
  if (findingCount === 0 || latestDecisions.length !== findingCount) return true;
  return !latestDecisions.every(
    ({ developerDecision, reviewerDecision }) =>
      developerDecision === DeveloperDecision.REJECTED &&
      reviewerDecision === ReviewerDecision.ACCEPTED,
  );
}

export function reviewRoundToStart(currentRound: number, hasActiveDraft: boolean): number {
  return hasActiveDraft ? currentRound : currentRound + 1;
}

export function hasValidDeveloperRejectionReason(
  kind: 'Resolved' | 'Rejected',
  reason: string | null | undefined,
): boolean {
  return kind !== 'Rejected' || Boolean(reason?.trim());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function stableReviewEntityUuid(value: string): string {
  if (UUID_PATTERN.test(value)) return value.toLowerCase();
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hash[12] = '5';
  hash[16] = ['8', '9', 'a', 'b'][Number.parseInt(hash[16] ?? '0', 16) % 4] ?? '8';
  const compact = hash.join('');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: ReviewTasksService,
    private readonly audit: AuditService,
  ) {}

  async findGeneralCheck() {
    const questions = await this.prisma.codeReviewQuestion.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    return questions.map((question) => ({
      id: question.id,
      text: question.questionText,
      order: question.displayOrder,
    }));
  }

  async findAll(rawScope: string, user: AuthenticatedUser) {
    const parsed = reviewScopeSchema.safeParse(rawScope);
    if (!parsed.success) throw new ApiException('VALIDATION_FAILED', 'That is not a review scope');
    const scope = parsed.data;
    if (scope === 'all' && !this.isAdmin(user)) throw new ForbiddenException();
    if (scope === 'reviewer' && !user.roles.includes('REVIEWER')) throw new ForbiddenException();
    const rows = await this.prisma.codeReviewForm.findMany({
      where:
        scope === 'mine'
          ? { task: { developerId: user.id } }
          : scope === 'reviewer'
            ? { reviewerId: user.id }
            : {},
      include: reviewInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.toReview(row));
  }

  async findCurrent(taskId: string, user: AuthenticatedUser) {
    await this.assertTaskVisible(taskId, user);
    const row = await this.prisma.codeReviewForm.findFirst({
      where: { taskId, status: CodeReviewFormStatus.DRAFT },
      include: reviewInclude,
      orderBy: { reviewCycleNumber: 'desc' },
    });
    return row ? this.toReview(row) : null;
  }

  async findHistory(taskId: string, user: AuthenticatedUser) {
    await this.assertTaskVisible(taskId, user);
    const rows = await this.prisma.codeReviewForm.findMany({
      where: { taskId },
      include: reviewInclude,
      orderBy: [{ reviewCycleNumber: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      ...this.toReview(row),
      responses: row.findings.flatMap(({ responses }) =>
        responses.map((entry) => this.toResponse(entry, row.taskId, entry.reviewCycleNumber)),
      ),
    }));
  }

  async saveDraft(taskId: string, input: unknown, user: AuthenticatedUser, manual = false) {
    const parsed = reviewDraftInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ApiException('VALIDATION_FAILED', 'Check the highlighted fields', [
        ...parsed.error.issues,
      ]);
    }
    await this.assertAssignedReviewer(taskId, user);
    const row = await this.prisma.$transaction(async (tx) => {
      const round = await this.ensureReviewRoundStarted(tx, taskId);
      return this.persistDraft(tx, taskId, round, parsed.data, user);
    });
    if (manual) {
      await this.audit.record(this.prisma, user, {
        actionType: 'REVIEW_DRAFT_SAVED',
        entityType: 'REVIEW',
        entityId: row.id,
        taskId,
        description: `${user.name} saved a review draft`,
      });
    }
    return this.toReview(row);
  }

  async decide(taskId: string, input: unknown, user: AuthenticatedUser) {
    const decisionInput = z
      .object({ decision: z.enum(['Approved', 'ChangesRequested']), draft: reviewDraftInputSchema })
      .safeParse(input);
    if (!decisionInput.success) {
      throw new ApiException('VALIDATION_FAILED', 'Check the highlighted fields', [
        ...decisionInput.error.issues,
      ]);
    }
    const task = await this.assertAssignedReviewer(taskId, user);
    const decision =
      decisionInput.data.decision === 'Approved'
        ? ReviewDecision.APPROVED
        : ReviewDecision.CHANGES_REQUESTED;
    const decisionRound = await this.resolveDecisionRound(taskId, task.currentReviewCycle);
    await this.assertDecisionAllowed(
      taskId,
      decisionRound,
      decisionInput.data.draft,
      decision,
      user,
    );
    await this.prisma.$transaction(async (tx) => {
      const round = await this.ensureReviewRoundStarted(tx, taskId);
      const review = await this.persistDraft(tx, taskId, round, decisionInput.data.draft, user);
      const now = new Date();
      const status =
        decision === ReviewDecision.APPROVED ? TaskStatus.APPROVED : TaskStatus.CHANGES_REQUESTED;
      await tx.codeReviewForm.update({
        where: { id: review.id },
        data: { status: CodeReviewFormStatus.COMPLETED, decision, completedAt: now },
      });
      await tx.task.update({
        where: { id: taskId },
        data: {
          status,
          currentReviewerId: decision === ReviewDecision.CHANGES_REQUESTED ? null : user.id,
          ...(decision === ReviewDecision.APPROVED ? { approvedAt: now } : {}),
        },
      });
      if (decision === ReviewDecision.CHANGES_REQUESTED) {
        await tx.reviewCycle.upsert({
          where: { taskId_roundNumber: { taskId, roundNumber: round } },
          create: { taskId, roundNumber: round },
          update: {},
        });
        await tx.taskReviewerAssignment.updateMany({
          where: { taskId, reviewerId: user.id, isCurrent: true },
          data: { isCurrent: false, unassignedAt: now },
        });
      }
      await tx.taskStatusHistory.create({
        data: {
          taskId,
          oldStatus: TaskStatus.IN_REVIEW,
          newStatus: status,
          changedBy: user.id,
          reviewFormId: review.id,
        },
      });
      await this.audit.record(tx, user, {
        actionType: decision === ReviewDecision.APPROVED ? 'TASK_APPROVED' : 'CHANGES_REQUESTED',
        entityType: 'REVIEW',
        entityId: review.id,
        taskId,
        targetUserId: task.developerId,
        description: `${user.name} ${decision === ReviewDecision.APPROVED ? 'approved' : 'requested changes for'} task '${task.title}'`,
      });
    });
    return this.tasks.findOne(taskId, user);
  }

  async findResponses(taskId: string, user: AuthenticatedUser) {
    await this.assertTaskVisible(taskId, user);
    const rows = await this.prisma.developerFindingResponse.findMany({
      where: { finding: { reviewForm: { taskId } } },
      include: { finding: { include: { reviewForm: true } } },
      orderBy: { respondedAt: 'asc' },
    });
    return rows.map((row) =>
      this.toResponse(row, row.finding.reviewForm.taskId, row.reviewCycleNumber),
    );
  }

  async saveResponse(taskId: string, input: unknown, user: AuthenticatedUser) {
    const parsed = issueResponseDraftSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiException('VALIDATION_FAILED', 'Check the highlighted fields');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${taskId} was not found`);
    if (task.developerId !== user.id || task.status !== TaskStatus.CHANGES_REQUESTED) {
      throw new ForbiddenException('You cannot respond to this feedback');
    }
    if (!hasValidDeveloperRejectionReason(parsed.data.kind, parsed.data.rejectionReason)) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Provide a reason when rejecting a review finding',
      );
    }
    const findingId = parsed.data.commentId ?? parsed.data.screenshotId;
    if (!findingId) throw new ApiException('VALIDATION_FAILED', 'Select a review comment');
    const finding = await this.prisma.reviewFinding.findFirst({
      where: { id: findingId, reviewForm: { taskId } },
      include: { reviewForm: true },
    });
    if (!finding) throw new NotFoundException(`Review comment ${findingId} was not found`);
    const existing = await this.prisma.developerFindingResponse.findFirst({
      where: {
        findingId,
        developerId: user.id,
        reviewCycleNumber: task.currentReviewCycle + 1,
      },
      orderBy: { respondedAt: 'desc' },
    });
    const data = {
      decision:
        parsed.data.kind === 'Resolved' ? DeveloperDecision.RESOLVED : DeveloperDecision.REJECTED,
      rejectionReason: parsed.data.rejectionReason?.trim() ?? null,
      reviewerDecision: ReviewerDecision.PENDING,
      reviewerComment: null,
      reviewedBy: null,
      reviewedAt: null,
      respondedAt: new Date(),
    } as const;
    if (existing) {
      await this.prisma.developerFindingResponse.update({ where: { id: existing.id }, data });
    } else {
      const cycle = await this.prisma.reviewCycle.findUnique({
        where: {
          taskId_roundNumber: {
            taskId,
            roundNumber: finding.reviewForm.reviewCycleNumber,
          },
        },
        select: { id: true },
      });
      await this.prisma.developerFindingResponse.create({
        data: {
          ...data,
          findingId,
          developerId: user.id,
          reviewCycleNumber: task.currentReviewCycle + 1,
          cycleId: cycle?.id ?? null,
        },
      });
    }
    return this.findResponses(taskId, user);
  }

  async removeResponse(taskId: string, responseId: string, user: AuthenticatedUser) {
    const removed = await this.prisma.developerFindingResponse.deleteMany({
      where: { id: responseId, developerId: user.id, finding: { reviewForm: { taskId } } },
    });
    if (removed.count !== 1) throw new NotFoundException(`Response ${responseId} was not found`);
    return this.findResponses(taskId, user);
  }

  async updateVerdict(taskId: string, responseId: string, input: unknown, user: AuthenticatedUser) {
    const parsed = z
      .object({
        verdict: z.enum(['Accepted', 'Overruled', 'Pending']),
        reviewerComment: z.string().trim().nullable().optional(),
      })
      .safeParse(input);
    if (!parsed.success) throw new ApiException('VALIDATION_FAILED', 'Check the verdict');
    await this.assertAssignedReviewer(taskId, user);
    if (parsed.data.verdict === 'Overruled' && !parsed.data.reviewerComment) {
      throw new ApiException(
        'VALIDATION_FAILED',
        'An explanation is required when overruling a response',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const response = await tx.developerFindingResponse.findFirst({
        where: { id: responseId, finding: { reviewForm: { taskId } } },
        select: {
          cycleId: true,
          finding: { select: { reviewForm: { select: { reviewCycleNumber: true } } } },
        },
      });
      if (!response) throw new NotFoundException(`Response ${responseId} was not found`);
      await tx.developerFindingResponse.update({
        where: { id: responseId },
        data: {
          reviewerDecision: {
            Pending: ReviewerDecision.PENDING,
            Accepted: ReviewerDecision.ACCEPTED,
            Overruled: ReviewerDecision.REJECTED,
          }[parsed.data.verdict],
          reviewerComment: parsed.data.reviewerComment ?? null,
          reviewedBy: user.id,
          reviewedAt: new Date(),
        },
      });
      await this.evaluateOriginalCycleCounted(
        tx,
        taskId,
        response.finding.reviewForm.reviewCycleNumber,
        user,
      );
      const updated = await tx.developerFindingResponse.findUnique({
        where: { id: responseId },
        include: { finding: { include: { reviewForm: true } } },
      });
      return updated ? this.toResponse(updated, taskId, updated.reviewCycleNumber) : undefined;
    });
  }

  private async resolveDecisionRound(taskId: string, currentRound: number): Promise<number> {
    const draft = await this.prisma.codeReviewForm.findFirst({
      where: { taskId, status: CodeReviewFormStatus.DRAFT },
      select: { reviewCycleNumber: true },
      orderBy: { reviewCycleNumber: 'desc' },
    });
    return draft?.reviewCycleNumber ?? currentRound + 1;
  }

  private async ensureReviewRoundStarted(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<number> {
    const locked = await tx.$queryRaw<{ current_review_cycle: number }[]>`
      SELECT "current_review_cycle"
      FROM "tasks"
      WHERE "id" = ${taskId}::uuid
      FOR UPDATE
    `;
    const currentRound = locked[0]?.current_review_cycle;
    if (currentRound === undefined) {
      throw new ApiException('TASK_NOT_FOUND', `Review task ${taskId} was not found`);
    }
    const draft = await tx.codeReviewForm.findFirst({
      where: { taskId, status: CodeReviewFormStatus.DRAFT },
      select: { reviewCycleNumber: true },
      orderBy: { reviewCycleNumber: 'desc' },
    });
    if (draft) return draft.reviewCycleNumber;
    const nextRound = reviewRoundToStart(currentRound, false);
    await tx.task.update({ where: { id: taskId }, data: { currentReviewCycle: nextRound } });
    return nextRound;
  }

  /**
   * Re-evaluates one persisted business cycle from issue-level decisions.
   * The unique task/round key plus an update-to-state implementation makes retries idempotent.
   */
  private async evaluateOriginalCycleCounted(
    tx: Prisma.TransactionClient,
    taskId: string,
    originalRound: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const cycle = await tx.reviewCycle.findUnique({
      where: { taskId_roundNumber: { taskId, roundNumber: originalRound } },
    });
    if (!cycle) return;
    const findings = await tx.reviewFinding.findMany({
      where: { reviewForm: { taskId, reviewCycleNumber: originalRound } },
      select: {
        id: true,
        responses: {
          where: { cycleId: cycle.id },
          select: { decision: true, reviewerDecision: true, reviewCycleNumber: true },
          orderBy: [{ reviewCycleNumber: 'desc' }, { respondedAt: 'desc' }],
        },
      },
    });
    const latest = findings
      .map(({ responses }) => responses[0])
      .filter((entry) => entry !== undefined);
    const counted = shouldCountReviewCycle(
      findings.length,
      latest.map((response) => ({
        developerDecision: response.decision,
        reviewerDecision: response.reviewerDecision,
      })),
    );
    const exclude = !counted;
    const reason = exclude
      ? 'All findings were rejected by the developer and all rejection reasons were accepted by the reviewer; no developer correction was required.'
      : null;
    if (cycle.counted === !exclude && cycle.exclusionReason === reason) return;
    const previousCount = await tx.reviewCycle.count({ where: { taskId, counted: true } });
    await tx.reviewCycle.update({
      where: { id: cycle.id },
      data: { counted: !exclude, exclusionReason: reason, excludedAt: exclude ? new Date() : null },
    });
    if (exclude && cycle.counted) {
      await this.audit.record(tx, actor, {
        actionType: 'COUNTED_CYCLE_ADJUSTED',
        entityType: 'REVIEW_CYCLE',
        entityId: cycle.id,
        taskId,
        description: `Review Round ${originalRound} was excluded from counted cycles`,
        metadata: {
          qualifyingReviewRound: originalRound,
          previousCountedCycle: previousCount,
          newCountedCycle: Math.max(0, previousCount - 1),
          adjustmentAmount: 1,
          reason,
        },
      });
    }
  }

  private async persistDraft(
    tx: Prisma.TransactionClient,
    taskId: string,
    cycle: number,
    draft: ReviewDraftInput,
    user: AuthenticatedUser,
  ) {
    const assignment = await tx.taskReviewerAssignment.findFirst({
      where: { taskId, reviewerId: user.id, isCurrent: true },
      select: { id: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (!assignment) {
      throw new ForbiddenException('Only the assigned reviewer may edit this review');
    }
    const reviewSessionId = assignment.id;
    const form = await tx.codeReviewForm.upsert({
      where: { taskId_reviewCycleNumber: { taskId, reviewCycleNumber: cycle } },
      create: {
        taskId,
        reviewerId: user.id,
        reviewCycleNumber: cycle,
        reviewRank: draft.rank,
        otherRemarks: draft.otherRemarks,
        feedbackSummary: draft.feedbackSummary,
        previousFeedbackReviewNote: draft.previousFeedbackReviewNote ?? null,
        previousFeedbackAcknowledged: draft.previousFeedbackAcknowledged ?? null,
        currentReviewSessionId: reviewSessionId,
        status: CodeReviewFormStatus.DRAFT,
      },
      update: {
        reviewerId: user.id,
        reviewRank: draft.rank,
        otherRemarks: draft.otherRemarks,
        feedbackSummary: draft.feedbackSummary,
        previousFeedbackReviewNote: draft.previousFeedbackReviewNote ?? null,
        previousFeedbackAcknowledged: draft.previousFeedbackAcknowledged ?? null,
        currentReviewSessionId: reviewSessionId,
        status: CodeReviewFormStatus.DRAFT,
      },
    });
    await tx.codeReviewAnswer.deleteMany({ where: { reviewFormId: form.id } });
    if (draft.generalCheck.length > 0) {
      await tx.codeReviewQuestion.createMany({
        data: draft.generalCheck.map(({ questionId }, order) => ({
          id: questionId,
          questionText: questionId,
          displayOrder: order,
        })),
        skipDuplicates: true,
      });
      await tx.codeReviewAnswer.createMany({
        data: draft.generalCheck.map(({ questionId, answer }) => ({
          reviewFormId: form.id,
          questionId,
          answer: {
            Ok: CodeReviewAnswerValue.OK,
            PartiallyOk: CodeReviewAnswerValue.PARTIALLY_OK,
            NotOk: CodeReviewAnswerValue.NOT_OK,
            NA: CodeReviewAnswerValue.NA,
          }[answer],
        })),
      });
    }
    const findingIdFor = (id: string) =>
      stableReviewEntityUuid(UUID_PATTERN.test(id) ? id : `${taskId}:finding:${id}`);
    const incomingIds = draft.comments.map(({ id }) => findingIdFor(id));
    const removable = await tx.reviewFinding.findMany({
      where: {
        reviewFormId: form.id,
        createdBy: user.id,
        id: { notIn: incomingIds },
        responses: { none: {} },
      },
      select: { id: true },
    });
    if (removable.length > 0) {
      const ids = removable.map(({ id }) => id);
      await tx.findingScreenshot.deleteMany({ where: { findingId: { in: ids } } });
      await tx.reviewFinding.deleteMany({ where: { id: { in: ids } } });
    }
    const editableFindings = await tx.reviewFinding.findMany({
      where: { reviewFormId: form.id, createdBy: user.id },
      select: { id: true },
      orderBy: { findingNo: 'asc' },
    });
    for (const [index, finding] of editableFindings.entries()) {
      await tx.reviewFinding.update({
        where: { id: finding.id },
        data: { findingNo: -(index + 1) },
      });
    }
    for (const [index, comment] of draft.comments.entries()) {
      const findingId = findingIdFor(comment.id);
      const existing = await tx.reviewFinding.findUnique({ where: { id: findingId } });
      if (existing && existing.createdBy !== user.id) continue;
      await tx.reviewFinding.upsert({
        where: { id: findingId },
        create: {
          id: findingId,
          reviewFormId: form.id,
          findingNo: index + 1,
          commentText: comment.text,
          reviewSessionId,
          createdBy: user.id,
        },
        update: { findingNo: index + 1, commentText: comment.text, reviewSessionId },
      });
      await tx.findingScreenshot.deleteMany({ where: { findingId } });
      if (comment.screenshots.length > 0) {
        await tx.findingScreenshot.createMany({
          data: comment.screenshots.map((shot) => ({
            id: stableReviewEntityUuid(
              UUID_PATTERN.test(shot.id) ? shot.id : `${findingId}:screenshot:${shot.id}`,
            ),
            findingId,
            fileName: shot.fileName,
            storageKey: shot.storageRef,
            mimeType: shot.mimeType,
            fileSize: BigInt(shot.sizeBytes),
            annotationText: shot.comment,
            uploadedBy: user.id,
            uploadedAt: new Date(shot.uploadedAt),
          })),
        });
      }
    }
    const saved = await tx.codeReviewForm.findUnique({
      where: { id: form.id },
      include: reviewInclude,
    });
    if (!saved) throw new NotFoundException(`Review ${form.id} was not found`);
    return saved;
  }

  private async assertAssignedReviewer(taskId: string, user: AuthenticatedUser) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${taskId} was not found`);
    if (task.currentReviewerId !== user.id)
      throw new ForbiddenException('Only the assigned reviewer may edit this review');
    if (task.status !== TaskStatus.IN_REVIEW) {
      throw new ApiException('INVALID_STATE_TRANSITION', 'This review is not currently active');
    }
    return task;
  }

  private async assertDecisionAllowed(
    taskId: string,
    cycle: number,
    draft: ReviewDraftInput,
    decision: ReviewDecision,
    user: AuthenticatedUser,
  ): Promise<void> {
    const assignment = await this.prisma.taskReviewerAssignment.findFirst({
      where: { taskId, reviewerId: user.id, isCurrent: true },
      select: { id: true },
      orderBy: { assignedAt: 'desc' },
    });
    if (!assignment)
      throw new ForbiddenException('Only the assigned reviewer may decide this review');
    if (draft.rank === null) {
      throw new ApiException('REVIEW_INCOMPLETE', 'Select a review rank before submitting');
    }
    const ownComments = draft.comments.filter(
      ({ reviewSessionId, reviewerId }) =>
        reviewSessionId === assignment.id || (!reviewSessionId && reviewerId === user.id),
    );
    if (ownComments.some(({ text }) => !text.trim())) {
      throw new ApiException('REVIEW_INCOMPLETE', 'Review comments cannot be empty');
    }
    if (decision === ReviewDecision.APPROVED && (draft.rank === 2 || draft.rank === 3)) {
      throw new ApiException(
        'APPROVE_BLOCKED',
        'A Rank 2 or Rank 3 review cannot be approved. Request changes instead',
      );
    }
    if (decision === ReviewDecision.CHANGES_REQUESTED) {
      if (draft.rank === 1) {
        throw new ApiException('REVIEW_INCOMPLETE', 'Rank 1 cannot request changes');
      }
      if (ownComments.length === 0) {
        throw new ApiException(
          'REVIEW_INCOMPLETE',
          'Add at least one review comment before requesting changes',
        );
      }
    }
    if (
      decision === ReviewDecision.APPROVED &&
      draft.comments.some(({ reviewSessionId }) =>
        Boolean(reviewSessionId && reviewSessionId !== assignment.id),
      ) &&
      draft.previousFeedbackAcknowledged !== true
    ) {
      throw new ApiException(
        'REVIEW_INCOMPLETE',
        'Acknowledge the previous reviewer feedback before approving',
      );
    }
    const previousChangesReview = await this.prisma.codeReviewForm.findFirst({
      where: {
        taskId,
        decision: ReviewDecision.CHANGES_REQUESTED,
        reviewCycleNumber: { lt: Math.max(cycle, 1) },
      },
      select: { reviewCycleNumber: true, findings: { select: { id: true } } },
      orderBy: [{ reviewCycleNumber: 'desc' }, { completedAt: 'desc' }],
    });
    const previousFindingIds = previousChangesReview?.findings.map(({ id }) => id) ?? [];
    const responses = await this.prisma.developerFindingResponse.findMany({
      where: {
        findingId: { in: previousFindingIds },
        reviewCycleNumber: Math.max(cycle, 1),
      },
      select: { findingId: true, decision: true, reviewerDecision: true },
    });
    if (responses.some(({ reviewerDecision }) => reviewerDecision === ReviewerDecision.PENDING)) {
      throw new ApiException(
        'REVIEW_INCOMPLETE',
        'Adjudicate all developer responses before submitting the review',
      );
    }
    if (
      decision === ReviewDecision.APPROVED &&
      responses.some(({ reviewerDecision }) => reviewerDecision === ReviewerDecision.REJECTED)
    ) {
      throw new ApiException(
        'UNRESOLVED_RESPONSES',
        'Cannot approve while review findings remain unresolved',
      );
    }
  }

  private async assertTaskVisible(taskId: string, user: AuthenticatedUser) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { codeReviewForms: { select: { reviewerId: true } } },
    });
    if (!task) throw new ApiException('TASK_NOT_FOUND', `Review task ${taskId} was not found`);
    const visible =
      this.isAdmin(user) ||
      task.developerId === user.id ||
      (user.roles.includes('REVIEWER') &&
        task.developerId !== user.id &&
        (task.currentReviewerId === user.id ||
          task.codeReviewForms.some(({ reviewerId }) => reviewerId === user.id)));
    if (!visible) throw new ForbiddenException('You cannot access this review task');
    return task;
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');
  }

  private toReview(row: ReviewRow) {
    const answer = {
      OK: 'Ok',
      PARTIALLY_OK: 'PartiallyOk',
      NOT_OK: 'NotOk',
      NA: 'NA',
    } as const;
    const decision = row.decision
      ? { APPROVED: 'Approved', CHANGES_REQUESTED: 'ChangesRequested' }[row.decision]
      : null;
    const comments = row.findings
      .filter(({ commentText }) => commentText.trim() !== '')
      .map((finding) => ({
        id: finding.id,
        reviewId: row.id,
        reviewCycle: row.reviewCycleNumber,
        reviewerId: finding.createdBy,
        reviewerName: finding.creator.fullName,
        reviewSessionId: finding.reviewSessionId ?? row.currentReviewSessionId ?? row.id,
        text: finding.commentText,
        screenshots: finding.screenshots.map((shot) => ({
          id: shot.id,
          fileName: shot.fileName,
          sizeBytes: Number(shot.fileSize),
          mimeType: shot.mimeType,
          storageRef: shot.storageKey,
          comment: shot.annotationText ?? '',
          uploadedAt: shot.uploadedAt.toISOString(),
        })),
        createdAt: finding.createdAt.toISOString(),
        updatedAt: finding.updatedAt.toISOString(),
      }));
    return {
      id: row.id,
      taskId: row.taskId,
      reviewCycle: row.reviewCycleNumber,
      reviewerId: row.reviewerId,
      reviewerName: row.reviewer.fullName,
      currentReviewSessionId:
        row.status === CodeReviewFormStatus.COMPLETED ? null : row.currentReviewSessionId,
      comments,
      generalCheck: row.answers.map((entry) => ({
        questionId: entry.questionId,
        answer: answer[entry.answer],
      })),
      findings: { incorrectCode: '', incompleteImplementation: '', sourceFormatting: '' },
      otherRemarks: row.otherRemarks ?? '',
      feedbackSummary: row.feedbackSummary ?? '',
      screenshots: comments.flatMap(({ screenshots }) => screenshots),
      rank:
        row.reviewRank === 1 || row.reviewRank === 2 || row.reviewRank === 3
          ? row.reviewRank
          : null,
      previousFeedbackReviewNote: row.previousFeedbackReviewNote,
      previousFeedbackAcknowledged: row.previousFeedbackAcknowledged,
      decision,
      decidedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: (row.completedAt ?? row.updatedAt).toISOString(),
    };
  }

  private toResponse(
    row: {
      id: string;
      findingId: string;
      decision: DeveloperDecision;
      rejectionReason: string | null;
      reviewerDecision: ReviewerDecision;
      reviewerComment: string | null;
      respondedAt: Date;
      reviewedAt: Date | null;
    },
    taskId: string,
    reviewCycle: number,
  ) {
    return {
      id: row.id,
      taskId,
      reviewCycle,
      commentId: row.findingId,
      screenshotId: null,
      kind: row.decision === DeveloperDecision.RESOLVED ? 'Resolved' : 'Rejected',
      rejectionReason: row.rejectionReason,
      verdict: {
        PENDING: 'Pending',
        ACCEPTED: 'Accepted',
        REJECTED: 'Overruled',
      }[row.reviewerDecision],
      reviewerComment: row.reviewerComment,
      respondedAt: row.respondedAt.toISOString(),
      adjudicatedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }
}
