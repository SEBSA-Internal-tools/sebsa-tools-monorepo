import { AlertCircle, CheckCircle2, ClipboardList, Image, MessageSquare, Send } from 'lucide-react';
import {
  MAX_FEEDBACK_SUMMARY_CHARS,
  type GeneralCheckAnswer,
  type GeneralCheckQuestion,
  type ReviewDecision,
  type ReviewDraft,
  type ReviewRank,
  type ReviewScreenshot,
} from '@sdp/contracts';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { RadioGroup, Textarea } from '@/components/ui/controls.tsx';
import { GeneralCheckPicker } from '@/portals/code-review/components/checklist.tsx';
import { Tag } from '@/portals/code-review/components/badges.tsx';
import reviews from '@/content/reviews.json';
import { reviewBlockers, type ReviewBlocker } from '../domain/reviewRules.ts';
import { ImageDropzone } from '@/components/common/ImageDropzone.tsx';

/**
 * The Code Review Form (screen 12, spec §3.1–3.2 and §2.9.2.4–6).
 *
 * Presentation only. Every gate — all thirteen answered, findings required for a
 * defect answer, and the Rank 2/3 approval block — comes from
 * `reviewRules.reviewBlockers`, so this file cannot disagree with the server,
 * which calls the same function.
 */

const RANK_OPTIONS = [
  {
    value: '1',
    label: reviews.form.rank1,
    description: reviews.form.rank1Description,
  },
  {
    value: '2',
    label: reviews.form.rank2,
    description: reviews.form.rank2Description,
  },
  {
    value: '3',
    label: reviews.form.rank3,
    description: reviews.form.rank3Description,
  },
];

export function CodeReviewForm({
  draft,
  onChange,
  questions,
  screenshots,
  onAddScreenshot,
  onCommentScreenshot,
  onRemoveScreenshot,
  onDecide,
  isDeciding,
  readOnly = false,
}: {
  draft: ReviewDraft;
  onChange: (draft: ReviewDraft) => void;
  questions: readonly GeneralCheckQuestion[];
  screenshots: readonly ReviewScreenshot[];
  onAddScreenshot: (file: {
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    dataUrl: string;
  }) => void;
  onCommentScreenshot: (screenshotId: string, comment: string) => void;
  onRemoveScreenshot: (screenshotId: string) => void;
  onDecide: (decision: ReviewDecision) => void;
  isDeciding: boolean;
  readOnly?: boolean;
}) {
  const answers = new Map(draft.generalCheck.map((entry) => [entry.questionId, entry.answer]));
  const answered = questions.filter((question) => answers.has(question.id)).length;

  const input = { draft, questions, screenshotCount: screenshots.length };
  const approveBlockers = reviewBlockers(input, 'Approved');
  const changesBlockers = reviewBlockers(input, 'ChangesRequested');

  /**
   * What the reviewer is shown as outstanding.
   *
   * The Request Changes list, not the Approve one: `approveBlockedByRank` is not
   * an incomplete-form problem, it is the rule doing its job, and listing it
   * beside "answer every question" would read as a defect in the form.
   */
  const outstanding: ReviewBlocker[] = changesBlockers;

  function setAnswer(questionId: string, answer: GeneralCheckAnswer) {
    const next = draft.generalCheck.filter((entry) => entry.questionId !== questionId);
    onChange({ ...draft, generalCheck: [...next, { questionId, answer }] });
  }

  const totalFeedbackLength =
    draft.findings.incorrectCode.length +
    draft.findings.incompleteImplementation.length +
    draft.findings.sourceFormatting.length +
    draft.otherRemarks.length;

  return (
    <Card className="border-success/30 bg-success-surface">
      <CardHeader title={reviews.form.title} description={reviews.form.subtitle} />

      <CardBody className="space-y-6 pt-4">
        {/* ------------------------------------------------ 3.1 General Check */}
        <section aria-labelledby="general-check">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3
              id="general-check"
              className="flex items-center gap-2 text-sm font-bold text-ink-900"
            >
              <ClipboardList className="size-4 text-ink-400" aria-hidden="true" />
              {reviews.form.generalCheck}
              <span aria-hidden="true" className="text-danger">
                *
              </span>
            </h3>
            <Tag
              className={
                answered === questions.length
                  ? 'bg-status-approved-surface text-status-approved'
                  : 'bg-status-draft-surface text-status-draft'
              }
            >
              {reviews.form.generalCheckAnswered} {answered}/{questions.length}
            </Tag>
          </div>

          <ul className="space-y-2">
            {questions.map((question, index) => (
              <li key={question.id} className="rounded-card border border-line bg-surface p-3">
                <p className="mb-2 flex gap-2 text-sm text-ink-700">
                  <span className="shrink-0 text-xs text-ink-400">{index + 1}.</span>
                  {question.text}
                </p>
                <GeneralCheckPicker
                  value={answers.get(question.id)}
                  onValueChange={(answer) => {
                    setAnswer(question.id, answer);
                  }}
                  questionLabel={`${String(index + 1)}. ${question.text}`}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------ 3.2 Detailed Review Findings */}
        <section aria-labelledby="findings" className="space-y-3">
          <h3 id="findings" className="text-sm font-bold text-ink-900">
            {reviews.form.findings}
          </h3>

          <Field label={reviews.form.findingsIncorrect}>
            <Textarea
              value={draft.findings.incorrectCode}
              onChange={(event) => {
                onChange({
                  ...draft,
                  findings: {
                    ...draft.findings,
                    incorrectCode: event.target.value,
                  },
                });
              }}
              placeholder={reviews.form.findingsIncorrectPlaceholder}
              disabled={readOnly}
              rows={3}
            />
          </Field>

          <Field label={reviews.form.findingsIncomplete}>
            <Textarea
              value={draft.findings.incompleteImplementation}
              onChange={(event) => {
                onChange({
                  ...draft,
                  findings: {
                    ...draft.findings,
                    incompleteImplementation: event.target.value,
                  },
                });
              }}
              placeholder={reviews.form.findingsIncompletePlaceholder}
              disabled={readOnly}
              rows={3}
            />
          </Field>

          <Field label={reviews.form.findingsFormatting}>
            <Textarea
              value={draft.findings.sourceFormatting}
              onChange={(event) => {
                onChange({
                  ...draft,
                  findings: {
                    ...draft.findings,
                    sourceFormatting: event.target.value,
                  },
                });
              }}
              placeholder={reviews.form.findingsFormattingPlaceholder}
              disabled={readOnly}
              rows={3}
            />
          </Field>
        </section>

        {/* -------------------------------------------------- Other Remarks */}
        <section aria-labelledby="other-remarks">
          <h3
            id="other-remarks"
            className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-900"
          >
            <MessageSquare className="size-4 text-ink-400" aria-hidden="true" />
            {reviews.form.otherRemarks}
          </h3>
          <Field label={reviews.form.otherRemarksLabel}>
            <Textarea
              value={draft.otherRemarks}
              onChange={(event) => {
                onChange({ ...draft, otherRemarks: event.target.value });
              }}
              placeholder={reviews.form.otherRemarksPlaceholder}
              disabled={readOnly}
              rows={3}
            />
          </Field>
          <p className="mt-1 flex justify-between text-xs text-ink-500">
            <span>{reviews.form.feedbackLength}</span>
            <span>
              {totalFeedbackLength.toLocaleString()} / {MAX_FEEDBACK_SUMMARY_CHARS.toLocaleString()}{' '}
              characters
            </span>
          </p>
        </section>

        {/* ------------------------------------------------ Feedback Summary */}
        <section aria-labelledby="feedback-summary">
          <h3 id="feedback-summary" className="mb-2 text-sm font-bold text-ink-900">
            {reviews.form.feedbackSummary}
          </h3>
          <Field label={reviews.form.feedbackSummaryLabel} hint={reviews.form.feedbackSummaryHint}>
            <Textarea
              value={draft.feedbackSummary}
              onChange={(event) => {
                onChange({ ...draft, feedbackSummary: event.target.value });
              }}
              maxLength={MAX_FEEDBACK_SUMMARY_CHARS}
              showCount
              placeholder={reviews.form.feedbackSummaryPlaceholder}
              disabled={readOnly}
              rows={3}
            />
          </Field>
        </section>

        {/* -------------------------------------------------- Review Ranking */}
        <section aria-labelledby="ranking">
          <h3 id="ranking" className="mb-2 text-sm font-bold text-ink-900">
            {reviews.form.ranking}
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
          </h3>
          <RadioGroup
            value={draft.rank === null ? null : String(draft.rank)}
            onValueChange={(value) => {
              onChange({ ...draft, rank: Number(value) as ReviewRank });
            }}
            options={RANK_OPTIONS}
            label={reviews.form.ranking}
          />
        </section>

        {/* ------------------------------------- Issue Screenshot Feedback */}
        <section aria-labelledby="screenshots">
          {/* A step up from the other section headings in this form, matching
              the reference: this one introduces a drop target rather than a
              group of radios, and needs to be findable while scrolling. */}
          <h3
            id="screenshots"
            className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink-900"
          >
            <Image className="size-5 text-ink-400" aria-hidden="true" />
            {reviews.form.screenshots}
          </h3>
          <p className="mb-4 text-sm text-ink-500">{reviews.form.screenshotsHint}</p>
          <ImageDropzone
            images={screenshots}
            onAdd={onAddScreenshot}
            onComment={onCommentScreenshot}
            onRemove={onRemoveScreenshot}
            disabled={readOnly}
          />
        </section>

        {outstanding.length > 0 && !readOnly ? (
          <Alert tone="warning" title={reviews.form.blockers.title}>
            <ul className="mt-1 space-y-1">
              {outstanding.map((blocker) => (
                <li key={blocker} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {reviews.form.blockers[blocker]}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {/*
          FL 2.9.2.5-01 made visible: at Rank 2 or 3 the reviewer is told, in
          words, why Approve has stopped being available. A silently disabled
          button would read as a bug.
        */}
        {approveBlockers.includes('approveBlockedByRank') && !readOnly ? (
          <Alert tone="danger" title={reviews.form.blockers.approveBlockedByRank} />
        ) : null}
      </CardBody>

      {readOnly ? null : (
        // Sticky for the same reason as the wizard's bar: this is the longest
        // page in the product — 13 General Check rows, three finding fields, a
        // rank picker and a dropzone — and Approve / Request Changes were
        // reachable only after scrolling the whole of it.
        <div className="sticky bottom-0 z-10 flex flex-wrap gap-3 rounded-b-card border-t border-success/30 bg-surface px-4 py-4 sm:px-6">
          <Button
            variant="success"
            className="flex-1"
            disabled={approveBlockers.length > 0 || isDeciding}
            isLoading={isDeciding}
            onClick={() => {
              onDecide('Approved');
            }}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {reviews.form.approve}
          </Button>

          <Button
            variant="secondary"
            className="flex-1"
            disabled={changesBlockers.length > 0 || isDeciding}
            isLoading={isDeciding}
            onClick={() => {
              onDecide('ChangesRequested');
            }}
          >
            <Send className="size-4" aria-hidden="true" />
            {reviews.form.requestChanges}
          </Button>
        </div>
      )}
    </Card>
  );
}
