import {
  TASK_STATUS_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  type Role,
  type TaskStatus,
} from '@sdp/contracts';

/**
 * The task lifecycle, as one pure module.
 *
 * Every "can this button be shown" question in the product resolves here rather
 * than in a component, for two reasons: the same question is asked from five
 * screens, and the answer will be re-asserted server-side in Phase 2. A rule
 * that lives in a `disabled` prop cannot be shared with a NestJS guard; a rule
 * that lives in a function can be ported line for line.
 *
 * Nothing in this file may import React, the router, or a store — ESLint
 * enforces that. These are functions of their arguments and nothing else.
 */

export function nextStatuses(from: TaskStatus): readonly TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[from];
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status);
}

/* -------------------------------------------------------------------------- */
/* Action gates                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The subject of an authorisation question: who is asking, and about which task.
 *
 * Deliberately a plain shape rather than the full `Task`, so these can be
 * answered from a list row, a detail page, or a test fixture without
 * constructing an entire task.
 */
export interface TaskActor {
  userId: string;
  roles: readonly Role[];
}

export interface TaskSubject {
  status: TaskStatus;
  developerId: string;
  reviewerId: string | null;
}

function hasRole(actor: TaskActor, role: Role): boolean {
  return actor.roles.includes(role);
}

/** The owning developer may edit only while the task is theirs to change. */
export function canEditTask(actor: TaskActor, task: TaskSubject): boolean {
  if (actor.userId !== task.developerId) return false;
  return task.status === 'Draft' || task.status === 'ChangesRequested';
}

/**
 * Submit and Resubmit are the same transition from the user's point of view but
 * different edges in the machine, so both are checked.
 *
 * Checklist completeness is a *separate* gate (FL 2.2-03) handled by
 * `taskRules.canSubmit`, because "you may submit this" and "this is ready to
 * submit" are different failures and deserve different messages.
 */
export function canSubmitForReview(actor: TaskActor, task: TaskSubject): boolean {
  if (actor.userId !== task.developerId) return false;
  return canTransition(task.status, 'Submitted') || canTransition(task.status, 'ReSubmitted');
}

/**
 * FL 3.3-02 and the self-review bar (plan section 5).
 *
 * The UI hiding an unpickable task is a convenience; the real control is the
 * server excluding the developer's own submissions from the Available queue and
 * performing the pick as one conditional update. This function must never be
 * the only thing standing between a reviewer and their own task.
 */
export function canPickForReview(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Reviewer')) return false;
  if (actor.userId === task.developerId) return false;
  if (task.reviewerId !== null) return false;
  return canTransition(task.status, 'InReview');
}

/** Only the assigned reviewer decides — a second reviewer cannot approve for them. */
export function canDecideReview(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Reviewer')) return false;
  if (task.reviewerId !== actor.userId) return false;
  return task.status === 'InReview';
}

/** The assigned reviewer may hand a task back to the admin pool (spec p.12). */
export function canHandOver(actor: TaskActor, task: TaskSubject): boolean {
  return canDecideReview(actor, task);
}

/** Admin may cancel at any time before a terminal state (spec p.13). */
export function canCancelTask(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  return canTransition(task.status, 'Cancelled');
}

/**
 * Admin may delete only a task that never entered the workflow or has already
 * left it — Draft or Cancelled (screen 01 draws the trash icon on exactly those
 * rows).
 *
 * Deliberately narrower than cancel. A Submitted or reviewed task carries review
 * cycles, findings and an audit trail that the Reports tab counts; deleting one
 * would silently change historical metrics. Cancelling keeps the record and
 * marks it closed, which is what "remove this from the queue" almost always
 * means.
 */
export function canDeleteTask(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  return task.status === 'Draft' || task.status === 'Cancelled';
}

/**
 * Admin may assign or reassign a reviewer once the task has left the developer
 * and before it reaches a terminal state.
 *
 * Draft is excluded because there is nothing to review yet: assigning a reviewer
 * to an unsubmitted task would put a row in their queue that its owner can still
 * rewrite.
 */
export function canAssignReviewer(actor: TaskActor, task: TaskSubject): boolean {
  if (!hasRole(actor, 'Admin')) return false;
  if (task.status === 'Draft') return false;
  return !isTerminal(task.status);
}

/**
 * Responding to findings — the resolve/reject pass before resubmission
 * (spec section 1.5 p.11).
 */
export function canRespondToFindings(actor: TaskActor, task: TaskSubject): boolean {
  return actor.userId === task.developerId && task.status === 'ChangesRequested';
}
