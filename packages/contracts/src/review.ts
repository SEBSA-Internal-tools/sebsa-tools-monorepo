import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import {
  generalCheckAnswerSchema,
  issueResponseSchema,
  rejectionVerdictSchema,
  reviewDecisionSchema,
  reviewRankSchema,
  MAX_FEEDBACK_SUMMARY_CHARS,
} from './enums.js';

// General Check — spec §3.1, 13 fixed questions.
export const generalCheckQuestionSchema = z.object({
  id: idSchema,
  text: z.string().min(1),
  order: z.number().int().min(0),
});
export type GeneralCheckQuestion = z.infer<typeof generalCheckQuestionSchema>;

export const generalCheckEntrySchema = z.object({
  questionId: idSchema,
  answer: generalCheckAnswerSchema,
});
export type GeneralCheckEntry = z.infer<typeof generalCheckEntrySchema>;

// Screenshots — spec §2.9.2.6.
export const reviewScreenshotSchema = z.object({
  id: idSchema,
  fileName: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().min(1),
  /**
   * Opaque handle. In Phase 2 this is the Microsoft Graph item ID; the browser
   * never receives a raw SharePoint URL (plan §2.8). Phase 1 uses a blob URL.
   */
  storageRef: z.string().min(1),
  /** Per-image annotation from the reviewer. */
  comment: z.string(),
  uploadedAt: isoDateTimeSchema,
});
export type ReviewScreenshot = z.infer<typeof reviewScreenshotSchema>;

// Review — one row per cycle.
/** The three Detailed Review Findings text areas from screen 12, §3.2. */
export const reviewFindingsSchema = z.object({
  incorrectCode: z.string(),
  incompleteImplementation: z.string(),
  sourceFormatting: z.string(),
});
export type ReviewFindings = z.infer<typeof reviewFindingsSchema>;

export const reviewSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  reviewCycle: z.number().int().min(1),
  reviewerId: idSchema,
  reviewerName: z.string(),

  generalCheck: z.array(generalCheckEntrySchema),
  findings: reviewFindingsSchema,
  otherRemarks: z.string(),
  feedbackSummary: z.string().max(MAX_FEEDBACK_SUMMARY_CHARS),
  rank: reviewRankSchema.nullable(),
  screenshots: z.array(reviewScreenshotSchema),

  /** Null while the review is still a draft (spec p.10: auto-saved draft). */
  decision: reviewDecisionSchema.nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Review = z.infer<typeof reviewSchema>;

/**
 * What the reviewer submits from screen 12.
 *
 * Deliberately permissive: the hard rules — every General Check item answered
 * (FL 2.9.2.4-01), findings required when any answer is Partially OK / Not OK
 * (FL 2.9.2.4-02), and Rank 2/3 requiring findings + a screenshot and blocking
 * Approve (FL 2.9.2.5-01) — are cross-field and depend on the chosen action.
 * They live in the domain layer so each produces its exact spec message.
 */
export const reviewDraftSchema = z.object({
  generalCheck: z.array(generalCheckEntrySchema),
  findings: reviewFindingsSchema,
  otherRemarks: z.string().trim().default(''),
  feedbackSummary: z
    .string()
    .trim()
    .max(
      MAX_FEEDBACK_SUMMARY_CHARS,
      `Summary must be ${MAX_FEEDBACK_SUMMARY_CHARS} characters or fewer`,
    )
    .default(''),
  rank: reviewRankSchema.nullable(),
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;

// Issue responses — the developer's reply to each finding (spec §1.5 p.11).
export const issueResponseRecordSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  /** The cycle whose feedback is being answered. */
  reviewCycle: z.number().int().min(1),
  /** Null when responding to the review as a whole rather than one screenshot. */
  screenshotId: idSchema.nullable(),
  kind: issueResponseSchema,
  /** Mandatory when `kind` is "Rejected" (FL 2.11.2.3-01). */
  rejectionReason: z.string().nullable(),
  /** The reviewer's ruling on a rejection (FL 2.11.2.3-02). */
  verdict: rejectionVerdictSchema,
  respondedAt: isoDateTimeSchema,
});
export type IssueResponseRecord = z.infer<typeof issueResponseRecordSchema>;

export const issueResponseDraftSchema = z.object({
  screenshotId: idSchema.nullable(),
  kind: issueResponseSchema,
  rejectionReason: z.string().trim().optional(),
});
export type IssueResponseDraft = z.infer<typeof issueResponseDraftSchema>;

// Cycle history — screen 14 and the developer's Review Feedback History.
/** One past cycle, newest first (spec §1.5 p.11: descending order). */
export const reviewHistoryEntrySchema = reviewSchema.extend({
  responses: z.array(issueResponseRecordSchema),
});
export type ReviewHistoryEntry = z.infer<typeof reviewHistoryEntrySchema>;
