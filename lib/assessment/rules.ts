import type { AnswerOption } from '@/types/assessment';

/** Questions drawn from the active bank for each person's test. */
export const QUESTIONS_PER_ATTEMPT = 10;

/** A first-attempt score strictly below this allows one retry (same questions). */
export const RETRY_THRESHOLD = 6;

/** How long an invitation stays valid after it is sent. */
export const INVITATION_VALID_DAYS = 7;

/** Shown to the taker only; the server does not enforce a time limit (same as the old tool). */
export const TIME_LIMIT_MINUTES = 30;

export const ANSWER_KEYS: AnswerOption[] = ['a', 'b', 'c', 'd'];

/** Fisher-Yates shuffle — returns a new array. */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** One point per correct answer. Unanswered questions score zero. */
export function scoreAttempt(
  questions: { id: string; correctOption: AnswerOption }[],
  answers: Record<string, AnswerOption | undefined>
): number {
  return questions.reduce((total, q) => total + (answers[q.id] === q.correctOption ? 1 : 0), 0);
}

/** Whether an attempt closes the assessment for this person and cycle. */
export function isFinalAttempt(attemptNumber: number, score: number): boolean {
  return attemptNumber >= 2 || score >= RETRY_THRESHOLD;
}

export function selectAssessmentRecipients<T extends { userId: string }>(people: T[], employeeIds: string[]): T[] {
  const requested = new Set(employeeIds);
  return people.filter((person) => requested.has(person.userId));
}

export function reminderRecipientIds(
  invitations: { userId: string; status: string }[],
  attempts: { userId: string; isFinal: boolean }[]
): string[] {
  const finalUsers = new Set(attempts.filter((attempt) => attempt.isFinal).map((attempt) => attempt.userId));
  return invitations
    .filter((invitation) => invitation.status !== 'completed' && !finalUsers.has(invitation.userId))
    .map((invitation) => invitation.userId);
}
