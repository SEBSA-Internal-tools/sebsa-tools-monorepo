/**
 * Shared types for the knowledge-assessment module (supabase/migrations/0031_assessment_core.sql).
 * Camel-case domain shapes are what services return; the snake_case `*Row` shapes live next to
 * the queries in repositories/assessment-repository.ts.
 */

export type AnswerOption = 'a' | 'b' | 'c' | 'd';
export type CycleStatus = 'active' | 'closed' | 'deactivated';
export type InvitationStatus = 'pending' | 'opened' | 'completed' | 'resent' | 'expired';

export interface AssessmentCycle {
  id: string;
  label: string;
  passingScore: number;
  status: CycleStatus;
  openedAt: string;
}

export interface AssessmentInvitation {
  id: string;
  cycleId: string;
  status: InvitationStatus;
  expiresAt: string;
}

export interface AssessmentAttemptSummary {
  id: string;
  cycleId: string;
  cycleLabel: string | null;
  attemptNumber: number;
  score: number;
  passed: boolean;
  isFinal: boolean;
  submittedAt: string;
}

export interface AssessmentCertificate {
  id: string;
  certificateNumber: string;
  issuedAt: string;
  score: number | null;
  cycleLabel: string | null;
}

/** What an employee sees on /assessments. */
export interface AssessmentOverview {
  activeCycle: (AssessmentCycle & { invitation: AssessmentInvitation | null }) | null;
  /** Latest attempt in the active cycle, if any. */
  currentAttempt: AssessmentAttemptSummary | null;
  pendingAssessment: boolean;
  canRetry: boolean;
  /** Distinct cycles the person has finalized — a retry is not a second assessment. */
  completedAssessmentCount: number;
  certificateCount: number;
  certificates: AssessmentCertificate[];
}

/** A question as served to the person taking the test — the answer key is never included. */
export interface TakerQuestion {
  id: string;
  questionText: string;
  category: string | null;
  options: { key: AnswerOption; text: string }[];
}

export interface QuestionReview extends TakerQuestion {
  userKey: AnswerOption | null;
  correctKey: AnswerOption;
  isCorrect: boolean;
}

export interface AssessmentResult {
  attemptId: string;
  attemptNumber: number;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  isFinal: boolean;
  passingScore: number;
  cycleLabel: string;
  submittedAt: string;
  certificateNumber: string | null;
  perQuestion: QuestionReview[];
}

/** Result of opening /assessments/take — a discriminated union so the page handles every state. */
export type AssessmentSession =
  | { kind: 'no-cycle' }
  | { kind: 'not-invited' }
  | { kind: 'expired'; expiredAt: string }
  | { kind: 'no-questions' }
  | { kind: 'completed'; result: AssessmentResult; firstAttemptScore: number | null }
  | {
      kind: 'ready';
      cycle: { id: string; label: string; passingScore: number };
      attemptNumber: 1 | 2;
      questions: TakerQuestion[];
      /** Set on the retry so the UI can show the first-attempt score. */
      firstAttemptScore: number | null;
    };
