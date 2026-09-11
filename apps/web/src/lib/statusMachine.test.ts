import { describe, expect, it } from 'vitest';
import { TASK_STATUSES, type Role, type TaskStatus } from '@sdp/contracts';
import {
  canAssignReviewer,
  canCancelTask,
  canDecideReview,
  canDeleteTask,
  canEditTask,
  canHandOver,
  canPickForReview,
  canRespondToFindings,
  canSubmitForReview,
  canTransition,
  isTerminal,
  nextStatuses,
  type TaskActor,
  type TaskSubject,
} from './statusMachine.ts';

const DEV = 'user-dev';
const REVIEWER = 'user-rev';
const OTHER_REVIEWER = 'user-rev-2';
const ADMIN = 'user-admin';

function actor(userId: string, ...roles: Role[]): TaskActor {
  return { userId, roles };
}

function task(overrides: Partial<TaskSubject> = {}): TaskSubject {
  return { status: 'Draft', developerId: DEV, reviewerId: null, ...overrides };
}

describe('transitions', () => {
  it('allows only the edges the lifecycle declares', () => {
    expect(canTransition('Draft', 'Submitted')).toBe(true);
    expect(canTransition('Draft', 'Approved')).toBe(false);
    expect(canTransition('InReview', 'ChangesRequested')).toBe(true);
    expect(canTransition('ChangesRequested', 'ReSubmitted')).toBe(true);
    expect(canTransition('Approved', 'Delivered')).toBe(true);
  });

  it('treats Delivered and Cancelled as terminal, and nothing else', () => {
    const terminal = TASK_STATUSES.filter(isTerminal);
    expect(terminal).toEqual(['Delivered', 'Cancelled']);

    for (const status of terminal) {
      expect(nextStatuses(status)).toHaveLength(0);
    }
  });

  it('lets an admin cancel from every non-terminal state', () => {
    const cancellable = TASK_STATUSES.filter((status) => canTransition(status, 'Cancelled'));
    // Approved is deliberately excluded: an approved task is handed to the
    // Delivery Portal, and cancelling it there is that system's decision.
    expect(cancellable).toEqual([
      'Draft',
      'Submitted',
      'InReview',
      'ChangesRequested',
      'ReSubmitted',
    ]);
  });

  it('never lets a status transition to itself', () => {
    for (const status of TASK_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('canEditTask', () => {
  it('permits the owning developer while the task is theirs to change', () => {
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Draft' }))).toBe(true);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' }))).toBe(true);
  });

  it('refuses once the task is with a reviewer', () => {
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Submitted' }))).toBe(false);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'InReview' }))).toBe(false);
    expect(canEditTask(actor(DEV, 'Developer'), task({ status: 'Approved' }))).toBe(false);
  });

  it('refuses another developer, even an admin', () => {
    expect(canEditTask(actor(ADMIN, 'Admin', 'Developer'), task())).toBe(false);
  });
});

describe('canSubmitForReview', () => {
  it('covers both the first submission and a resubmission', () => {
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'Draft' }))).toBe(true);
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' }))).toBe(
      true,
    );
  });

  it('refuses a non-owner and an already-submitted task', () => {
    expect(canSubmitForReview(actor(REVIEWER, 'Developer'), task())).toBe(false);
    expect(canSubmitForReview(actor(DEV, 'Developer'), task({ status: 'Submitted' }))).toBe(false);
  });
});

describe('canPickForReview', () => {
  const submitted = task({ status: 'Submitted' });

  it('permits a reviewer who did not submit the task', () => {
    expect(canPickForReview(actor(REVIEWER, 'Reviewer'), submitted)).toBe(true);
  });

  it('blocks self-review even when the user holds the Reviewer role', () => {
    expect(canPickForReview(actor(DEV, 'Developer', 'Reviewer'), submitted)).toBe(false);
  });

  it('blocks a task another reviewer already holds', () => {
    expect(
      canPickForReview(actor(REVIEWER, 'Reviewer'), {
        ...submitted,
        reviewerId: OTHER_REVIEWER,
      }),
    ).toBe(false);
  });

  it('blocks a user without the Reviewer role', () => {
    expect(canPickForReview(actor(REVIEWER, 'Developer'), submitted)).toBe(false);
  });

  it('accepts a re-submitted task back into the queue', () => {
    expect(canPickForReview(actor(REVIEWER, 'Reviewer'), task({ status: 'ReSubmitted' }))).toBe(
      true,
    );
  });
});

describe('canDecideReview and canHandOver', () => {
  const inReview = task({ status: 'InReview', reviewerId: REVIEWER });

  it('permits only the assigned reviewer', () => {
    expect(canDecideReview(actor(REVIEWER, 'Reviewer'), inReview)).toBe(true);
    expect(canDecideReview(actor(OTHER_REVIEWER, 'Reviewer'), inReview)).toBe(false);
  });

  it('refuses once the review is decided', () => {
    expect(
      canDecideReview(actor(REVIEWER, 'Reviewer'), {
        ...inReview,
        status: 'Approved',
      }),
    ).toBe(false);
  });

  it('gates handover the same way as a decision', () => {
    expect(canHandOver(actor(REVIEWER, 'Reviewer'), inReview)).toBe(true);
    expect(canHandOver(actor(OTHER_REVIEWER, 'Reviewer'), inReview)).toBe(false);
  });
});

describe('canCancelTask', () => {
  it('requires the Admin role', () => {
    expect(canCancelTask(actor(ADMIN, 'Admin'), task({ status: 'InReview' }))).toBe(true);
    expect(canCancelTask(actor(DEV, 'Developer', 'Reviewer'), task({ status: 'InReview' }))).toBe(
      false,
    );
  });

  it('refuses a terminal task', () => {
    for (const status of ['Delivered', 'Cancelled'] satisfies TaskStatus[]) {
      expect(canCancelTask(actor(ADMIN, 'Admin'), task({ status }))).toBe(false);
    }
  });
});

describe('canDeleteTask', () => {
  it('requires the Admin role', () => {
    expect(canDeleteTask(actor(ADMIN, 'Admin'), task({ status: 'Draft' }))).toBe(true);
    expect(canDeleteTask(actor(DEV, 'Developer', 'Reviewer'), task({ status: 'Draft' }))).toBe(
      false,
    );
  });

  /**
   * The distinction that matters: cancel is broad, delete is narrow. Anything
   * that has been through review is countable history, and Reports counts it.
   */
  it('is narrower than cancel — only Draft and Cancelled may be destroyed', () => {
    const deletable: TaskStatus[] = ['Draft', 'Cancelled'];
    const admin = actor(ADMIN, 'Admin');

    for (const status of TASK_STATUSES) {
      expect(canDeleteTask(admin, task({ status }))).toBe(deletable.includes(status));
    }

    // And every status that is cancellable but not Draft is explicitly NOT
    // deletable, which is the property a future refactor would break silently.
    for (const status of TASK_STATUSES) {
      if (status !== 'Draft' && canCancelTask(admin, task({ status }))) {
        expect(canDeleteTask(admin, task({ status }))).toBe(false);
      }
    }
  });
});

describe('canAssignReviewer', () => {
  it('requires the Admin role', () => {
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Submitted' }))).toBe(true);
    expect(
      canAssignReviewer(actor(REVIEWER, 'Developer', 'Reviewer'), task({ status: 'Submitted' })),
    ).toBe(false);
  });

  it('refuses a Draft — nothing has been submitted to review yet', () => {
    expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status: 'Draft' }))).toBe(false);
  });

  it('refuses a terminal task', () => {
    for (const status of ['Delivered', 'Cancelled'] satisfies TaskStatus[]) {
      expect(canAssignReviewer(actor(ADMIN, 'Admin'), task({ status }))).toBe(false);
    }
  });

  it('allows reassignment of a task that already has a reviewer', () => {
    expect(
      canAssignReviewer(
        actor(ADMIN, 'Admin'),
        task({ status: 'InReview', reviewerId: OTHER_REVIEWER }),
      ),
    ).toBe(true);
  });
});

describe('canRespondToFindings', () => {
  it('is open to the owning developer only while changes are requested', () => {
    expect(
      canRespondToFindings(actor(DEV, 'Developer'), task({ status: 'ChangesRequested' })),
    ).toBe(true);
    expect(canRespondToFindings(actor(DEV, 'Developer'), task({ status: 'InReview' }))).toBe(false);
    expect(
      canRespondToFindings(actor(REVIEWER, 'Developer'), task({ status: 'ChangesRequested' })),
    ).toBe(false);
  });
});
