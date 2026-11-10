import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type {
  EmailBody,
  EmailCallout,
  EmailTable,
  EmailTone,
} from '../../integrations/mail/templates/layout.js';

export const TASK_EMAIL_EVENTS = [
  'TASK_PICKED',
  'CHANGES_REQUESTED',
  'TASK_APPROVED',
  'TASK_RESUBMITTED',
  'RESUBMISSION_UNASSIGNED',
  'TASK_HANDED_OVER',
  'HANDOVER_REASSIGNED',
  'REVIEWER_ASSIGNED',
  'FOLLOW_UP_REVIEWER_CHANGED',
  'TASK_CANCELLED',
] as const;

export const taskEmailPayloadSchema = z.object({
  event: z.enum(TASK_EMAIL_EVENTS),
  actorName: z.string(),
  occurredAt: z.iso.datetime(),
  reviewerId: z.string().optional(),
  reviewerName: z.string().optional(),
  previousReviewerName: z.string().optional(),
  developerName: z.string().optional(),
  reason: z.string().optional(),
  round: z.number().int().optional(),
  findings: z.number().int().optional(),
  rank: z.number().int().min(1).max(3).optional(),
  summary: z.string().optional(),
  checklistIssues: z
    .array(
      z.object({
        section: z.string().optional(),
        question: z.string(),
        answer: z.enum(['NOT_OK', 'PARTIALLY_OK']),
      }),
    )
    .optional(),
});
export type TaskEmailPayload = z.infer<typeof taskEmailPayloadSchema>;

export function taskEmail(
  event: TaskEmailPayload['event'],
  actorName: string,
  facts: Omit<TaskEmailPayload, 'event' | 'actorName' | 'occurredAt'> = {},
  occurredAt: Date = new Date(),
): TaskEmailPayload {
  const clean = Object.fromEntries(
    Object.entries(facts).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
  return { event, actorName, occurredAt: occurredAt.toISOString(), ...clean };
}

/** Columns that queue a notification row for email. */
export function pendingEmailColumns(payload: TaskEmailPayload) {
  return {
    emailStatus: 'PENDING' as const,
    emailAttempts: 0,
    emailNextAttemptAt: new Date(),
    payload: payload as unknown as Prisma.InputJsonObject,
  };
}

export type RecipientRelation = 'developer' | 'reviewer' | 'admin';

export interface TaskEmailContext {
  recipientName: string;
  relation: RecipientRelation;
  task: { code: string; title: string; customer: string };
  link: string;
  when: string;
}

interface Copy {
  tone: EmailTone;
  label: string;
  subject: string;
  heading: string;
  paragraph: string;
  highlight?: string;
  action?: string;
}

/** Mirrors the rank wording reviewers pick from in the web app. */
const RANK_TEXT: Record<number, { title: string; description: string; tone: EmailTone }> = {
  1: {
    title: 'Rank 1 — Good / Approved Quality',
    description:
      'Review did not show up any serious issues. Development can be delivered after functional testing.',
    tone: 'success',
  },
  2: {
    title: 'Rank 2 — Minor Issues / Needs Improvement',
    description:
      'Review showed up minor issues that need to be fixed before delivery. A re-review must be done prior to delivery.',
    tone: 'warning',
  },
  3: {
    title: 'Rank 3 — Major Issues / Significant Changes Required',
    description:
      'Review showed up serious issues requiring significant implementation changes. A re-review must be done prior to delivery.',
    tone: 'danger',
  },
};

const BY_LABEL: Partial<Record<TaskEmailPayload['event'], string>> = {
  REVIEWER_ASSIGNED: 'Assigned by',
  HANDOVER_REASSIGNED: 'Assigned by',
  FOLLOW_UP_REVIEWER_CHANGED: 'Changed by',
  TASK_HANDED_OVER: 'Handed over by',
  TASK_CANCELLED: 'Cancelled by',
};

const ACTION_REQUIRED = 'Action required';
const REVIEW_REQUIRED = 'Review required';
const FYI = 'For your information';

function plural(n: number, word: string): string {
  return `${String(n)} ${word}${n === 1 ? '' : 's'}`;
}

function copyFor(p: TaskEmailPayload, c: TaskEmailContext): Copy {
  const ref = `${c.task.code} (${c.task.customer})`;
  const reviewer = p.reviewerName ?? 'A reviewer';
  const developer = p.developerName ?? p.actorName;
  const cycle = p.round === undefined ? '' : ` in review cycle ${String(p.round)}`;
  switch (p.event) {
    case 'TASK_PICKED':
      return {
        tone: 'info',
        label: FYI,
        subject: `${c.task.code}: picked up for review by ${reviewer}`,
        heading: 'Your Task Is Being Reviewed',
        paragraph: `Reviewer ${reviewer} picked up your task ${ref} on ${c.when}. You will be notified as soon as the review is complete.`,
        action: 'Open Task',
      };
    case 'CHANGES_REQUESTED':
      return {
        tone: 'warning',
        label: ACTION_REQUIRED,
        subject: `${c.task.code}: changes requested`,
        heading: 'Changes Requested',
        paragraph: `${reviewer} reviewed your task ${ref}${cycle} and requested Changes${p.findings === undefined ? '' : ` with ${plural(p.findings, 'finding')}`}. Please review the feedback below, respond to each finding, fix the code and resubmit.`,
        highlight: 'Changes',
        action: 'View Findings',
      };
    case 'TASK_APPROVED':
      return {
        tone: 'success',
        label: FYI,
        subject: `${c.task.code}: approved`,
        heading: 'Task Approved',
        paragraph: `Your task ${ref} was Approved by ${reviewer} on ${c.when}${p.round === undefined ? '' : ` after ${plural(p.round, 'review cycle')}`}. No further changes are needed for this review.`,
        highlight: 'Approved',
        action: 'Open Task',
      };
    case 'TASK_RESUBMITTED':
      return {
        tone: 'info',
        label: REVIEW_REQUIRED,
        subject: `${c.task.code}: resubmitted for your review`,
        heading: 'Task Re-Submitted for Review',
        paragraph: `Task ${ref} has been Re-Submitted for your review. ${developer} has completed the requested changes and resubmitted it on ${c.when}.`,
        highlight: 'Re-Submitted',
        action: 'Review Task',
      };
    case 'RESUBMISSION_UNASSIGNED':
      return {
        tone: 'warning',
        label: ACTION_REQUIRED,
        subject: `${c.task.code}: resubmitted and needs a reviewer`,
        heading: 'Re-Submitted Task Needs a Reviewer',
        paragraph: `${developer} resubmitted ${ref}, but ${p.previousReviewerName ?? 'the previous reviewer'} is no longer available to review it. The task has returned to the review pool; please assign a reviewer.`,
        action: 'Assign Reviewer',
      };
    case 'TASK_HANDED_OVER':
      return c.relation === 'developer'
        ? {
            tone: 'warning',
            label: FYI,
            subject: `${c.task.code}: your reviewer handed the task over`,
            heading: 'Your Task Is Awaiting a New Reviewer',
            paragraph: `${p.actorName} handed over the review of your task ${ref}. The task is waiting for a new reviewer; you will be notified when one is assigned.`,
            action: 'Open Task',
          }
        : {
            tone: 'warning',
            label: ACTION_REQUIRED,
            subject: `${c.task.code}: handed over by ${p.actorName}`,
            heading: 'Review Handed Over',
            paragraph: `Reviewer ${p.actorName} handed over the review of ${ref}. The task is waiting in the handover queue for a new reviewer.`,
            action: 'Open Handovers',
          };
    case 'HANDOVER_REASSIGNED':
    case 'REVIEWER_ASSIGNED':
      return c.relation === 'reviewer'
        ? {
            tone: 'info',
            label: REVIEW_REQUIRED,
            subject: `${c.task.code}: assigned to you for review`,
            heading: 'Review Assigned to You',
            paragraph: `${p.actorName} assigned task ${ref} to you for review${p.event === 'HANDOVER_REASSIGNED' ? ' after it was handed over' : ''}.`,
            action: 'Review Task',
          }
        : {
            tone: 'info',
            label: FYI,
            subject: `${c.task.code}: ${reviewer} is now your reviewer`,
            heading: 'New Reviewer Assigned',
            paragraph: `${p.actorName} assigned ${reviewer} to review your task ${ref}.`,
            action: 'Open Task',
          };
    case 'FOLLOW_UP_REVIEWER_CHANGED':
      return c.relation === 'reviewer'
        ? {
            tone: 'info',
            label: FYI,
            subject: `${c.task.code}: you are the follow-up reviewer`,
            heading: 'You Will Review the Resubmission',
            paragraph: `You are now the follow-up reviewer for ${ref}. The task comes to you for review when the developer resubmits it.`,
            action: 'Open Task',
          }
        : {
            tone: 'info',
            label: FYI,
            subject: `${c.task.code}: ${reviewer} will review your resubmission`,
            heading: 'Follow-Up Reviewer Changed',
            paragraph: `Your next resubmission of ${ref} will be reviewed by ${reviewer}.`,
            action: 'Open Task',
          };
    case 'TASK_CANCELLED':
      return {
        tone: 'danger',
        label: FYI,
        subject: `${c.task.code}: cancelled`,
        heading: 'Task Cancelled',
        paragraph: `Task ${ref} has been cancelled. Work on this task has stopped and no further review is needed.`,
      };
  }
}

/** Each person appears once; "By" is only added when the actor is not already listed. */
function peopleRows(p: TaskEmailPayload): (readonly [string, string])[] {
  const rows: (readonly [string, string])[] = [];
  const showDeveloper = p.event === 'TASK_RESUBMITTED' || p.event === 'RESUBMISSION_UNASSIGNED';
  if (showDeveloper && p.developerName) rows.push(['Developer', p.developerName]);
  const reviewer = p.event === 'TASK_RESUBMITTED' ? undefined : p.reviewerName;
  const previous = p.previousReviewerName;
  if (reviewer && previous && reviewer !== previous) {
    rows.push(
      ['Previous reviewer', previous],
      [p.event === 'FOLLOW_UP_REVIEWER_CHANGED' ? 'Follow-up reviewer' : 'New reviewer', reviewer],
    );
  } else if (reviewer) {
    rows.push(['Reviewer', reviewer]);
  } else if (previous) {
    rows.push(['Previous reviewer', previous]);
  }
  if (!rows.some(([, name]) => name === p.actorName)) {
    rows.push([BY_LABEL[p.event] ?? 'By', p.actorName]);
  }
  return rows;
}

function calloutFor(p: TaskEmailPayload): EmailCallout | undefined {
  if (p.event === 'TASK_RESUBMITTED') {
    return p.round === undefined
      ? undefined
      : {
          tone: 'brand',
          title: `Review Cycle ${String(p.round)}`,
          text: 'The developer has addressed previous feedback and resubmitted for review.',
        };
  }
  const rank = p.rank === undefined ? undefined : RANK_TEXT[p.rank];
  if (!rank || (p.event !== 'CHANGES_REQUESTED' && p.event !== 'TASK_APPROVED')) return undefined;
  return { tone: rank.tone, title: `Review Ranking: ${rank.title}`, text: rank.description };
}

function issueTables(p: TaskEmailPayload): EmailTable[] {
  const groups = new Map<string, EmailTable['rows'][number][]>();
  for (const issue of p.checklistIssues ?? []) {
    const title = issue.section ? `${issue.section} Issues` : 'Checklist Issues';
    const rows = groups.get(title) ?? [];
    rows.push(
      issue.answer === 'NOT_OK'
        ? { tone: 'danger', status: '❌ Not OK', item: issue.question }
        : { tone: 'warning', status: '⚠️ Partially OK', item: issue.question },
    );
    groups.set(title, rows);
  }
  return [...groups].map(([title, rows]) => ({ title, columns: ['Status', 'Item'], rows }));
}

export function buildTaskEmail(
  payload: TaskEmailPayload,
  context: TaskEmailContext,
): { subject: string; body: EmailBody } {
  const copy = copyFor(payload, context);
  const details: (readonly [string, string])[] = [
    ['Task ID', context.task.code],
    ['Title', context.task.title],
    ['Customer', context.task.customer],
    ...peopleRows(payload),
  ];
  if (payload.round !== undefined) details.push(['Review cycle', String(payload.round)]);
  if (payload.findings !== undefined) details.push(['Findings', String(payload.findings)]);
  if (payload.reason) details.push(['Reason', payload.reason]);
  details.push(['When', context.when]);

  const isDecision = payload.event === 'CHANGES_REQUESTED' || payload.event === 'TASK_APPROVED';
  const callout = calloutFor(payload);
  return {
    subject: copy.subject,
    body: {
      tone: copy.tone,
      label: copy.label,
      heading: copy.heading,
      greeting: `Hello ${context.recipientName},`,
      paragraphs: [copy.paragraph],
      ...(copy.highlight ? { highlight: copy.highlight } : {}),
      detailsTitle: 'Task Details',
      details,
      ...(callout ? { callout } : {}),
      ...(isDecision ? { tables: issueTables(payload) } : {}),
      ...(isDecision && payload.summary
        ? { sections: [{ title: 'Reviewer Summary', text: payload.summary }] }
        : {}),
      ...(copy.action ? { action: { label: copy.action, url: context.link } } : {}),
      notes: ['You are receiving this because you are involved in this task.'],
    },
  };
}
