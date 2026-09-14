import { useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquareWarning, Send, XCircle } from 'lucide-react';
import type { IssueResponseRecord, Review } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card.tsx';
import { Field } from '@/components/ui/Field.tsx';
import { Textarea } from '@/components/ui/controls.tsx';
import { interpolate } from '@/lib/formatters.ts';
import tasks from '@/content/tasks.json';
import {
  issuesFromReview,
  resubmitReadiness,
  type Issue,
  type ResponseLike,
} from '../domain/responseRules.ts';

/**
 * The developer's reply to a "changes requested" review (spec §1.5 p.11).
 *
 * Each finding is answered individually — Resolve, or Reject with a written
 * reason. FL 2.11.2.3-01 makes the reason mandatory, and this panel will not
 * let a rejection be saved without one; the server refuses it too.
 */

function IssueRow({
  issue,
  response,
  onRespond,
  disabled,
}: {
  issue: Issue;
  response: IssueResponseRecord | undefined;
  onRespond: (input: ResponseLike) => void;
  disabled: boolean;
}) {
  const [reason, setReason] = useState(response?.rejectionReason ?? '');
  const [showReason, setShowReason] = useState(response?.kind === 'Rejected');
  const [touched, setTouched] = useState(false);

  const isRejectedWithoutReason = showReason && reason.trim() === '';

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">
          {issue.screenshotId === null ? tasks.response.overallFindings : issue.label}
        </p>
        {response === undefined ? null : (
          <Tag
            className={
              response.kind === 'Resolved'
                ? 'bg-status-approved-surface text-status-approved'
                : 'bg-status-cancelled-surface text-status-cancelled'
            }
          >
            {response.kind === 'Resolved' ? tasks.response.resolved : tasks.response.rejected}
          </Tag>
        )}
      </div>

      {/* Reviewer text is untrusted: escaped, never HTML. */}
      <p className="mb-3 text-sm whitespace-pre-wrap text-ink-700">{issue.detail}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={response?.kind === 'Resolved' ? 'success' : 'secondary'}
          size="sm"
          disabled={disabled}
          onClick={() => {
            setShowReason(false);
            onRespond({ screenshotId: issue.screenshotId, kind: 'Resolved' });
          }}
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {tasks.response.resolve}
        </Button>

        <Button
          variant={response?.kind === 'Rejected' ? 'danger' : 'secondary'}
          size="sm"
          disabled={disabled}
          onClick={() => {
            // Reveals the reason box rather than saving immediately: a rejection
            // is not recorded until it has been justified.
            setShowReason(true);
            setTouched(false);
          }}
        >
          <XCircle className="size-3.5" aria-hidden="true" />
          {tasks.response.reject}
        </Button>
      </div>

      {showReason ? (
        <div className="mt-3">
          <Field
            label={tasks.response.reasonLabel}
            required
            error={touched && isRejectedWithoutReason ? tasks.response.reasonRequired : undefined}
          >
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder={tasks.response.reasonPlaceholder}
              disabled={disabled}
              rows={2}
            />
          </Field>
          <Button
            size="sm"
            className="mt-2"
            disabled={disabled}
            onClick={() => {
              setTouched(true);
              if (isRejectedWithoutReason) return;
              onRespond({
                screenshotId: issue.screenshotId,
                kind: 'Rejected',
                rejectionReason: reason,
              });
            }}
          >
            {tasks.response.saveRejection}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function ReviewFeedbackPanel({
  review,
  responses,
  onRespond,
  onResubmit,
  isResubmitting,
  disabled = false,
}: {
  review: Review | null;
  responses: readonly IssueResponseRecord[];
  onRespond: (input: ResponseLike) => void;
  onResubmit: () => void;
  isResubmitting: boolean;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const issues = issuesFromReview(review);
  if (issues.length === 0 || review === null) return null;

  const byScreenshot = new Map(responses.map((response) => [response.screenshotId, response]));
  const readiness = resubmitReadiness(issues, responses);

  const totalCount = issues.length;
  const answeredIssues = issues.filter((issue) => {
    const res = byScreenshot.get(issue.screenshotId);
    if (!res) return false;
    if (res.kind === 'Rejected') return (res.rejectionReason ?? '').trim() !== '';
    return true;
  });
  const resolvedCount = answeredIssues.length;
  const openCount = totalCount - resolvedCount;

  const filteredIssues = issues.filter((issue) => {
    const isAnswered = answeredIssues.includes(issue);
    if (filter === 'open') return !isAnswered;
    if (filter === 'resolved') return isAnswered;
    return true;
  });

  return (
    <Card className="border-amber-200/80 bg-gradient-to-b from-amber-50/20 via-surface to-surface shadow-card">
      <CardHeader
        title={tasks.response.title}
        description={interpolate(tasks.response.subtitle, {
          reviewer: review.reviewerName,
          cycle: review.reviewCycle,
        })}
        icon={<MessageSquareWarning className="size-4 text-amber-600" />}
        action={review.rank === null ? null : <RankBadge rank={review.rank} />}
      />

      <CardBody className="space-y-4 pt-3">
        {review.feedbackSummary.trim() === '' ? null : (
          <Alert tone="warning" title={tasks.response.summaryTitle}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{review.feedbackSummary}</p>
          </Alert>
        )}

        {/* Issue Status & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas/60 p-2.5">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-ink-700">
            <span className="font-bold text-ink-900">
              {totalCount} {totalCount === 1 ? 'Issue' : 'Issues'}
            </span>
            <span className="text-ink-300">·</span>
            <span className={openCount > 0 ? 'font-bold text-amber-700' : 'text-ink-500'}>
              {openCount} Open
            </span>
            <span className="text-ink-300">·</span>
            <span className={resolvedCount > 0 ? 'font-bold text-emerald-700' : 'text-ink-500'}>
              {resolvedCount} Resolved
            </span>
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'open', 'resolved'] as const).map((key) => {
              const label =
                key === 'all'
                  ? `All (${totalCount})`
                  : key === 'open'
                    ? `Open (${openCount})`
                    : `Resolved (${resolvedCount})`;
              const isSelected = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-semibold transition-all',
                    isSelected
                      ? 'border border-line bg-surface font-bold text-ink-900 shadow-2xs'
                      : 'hover:text-ink-800 text-ink-500 hover:bg-surface/50',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-500">
            No issues match the selected filter.
          </div>
        ) : (
          <ul className="space-y-3">
            {filteredIssues.map((issue) => (
              <IssueRow
                key={issue.screenshotId ?? 'overall'}
                issue={issue}
                response={byScreenshot.get(issue.screenshotId)}
                onRespond={onRespond}
                disabled={disabled}
              />
            ))}
          </ul>
        )}

        {readiness.canResubmit ? null : (
          <p
            className={cn('flex items-center gap-1.5 pt-1 text-xs font-semibold text-amber-700')}
            role="status"
          >
            <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
            {readiness.unjustified > 0
              ? tasks.response.blockedByReason
              : interpolate(
                  readiness.unanswered === 1
                    ? tasks.response.blockedByUnanswered
                    : tasks.response.blockedByUnansweredPlural,
                  { count: readiness.unanswered },
                )}
          </p>
        )}
      </CardBody>

      <CardFooter className="border-t border-line/60 bg-canvas/30">
        <Button
          onClick={onResubmit}
          disabled={!readiness.canResubmit || disabled}
          isLoading={isResubmitting}
          className="gap-1.5 font-semibold"
        >
          <Send className="size-4" aria-hidden="true" />
          {tasks.response.resubmit}
        </Button>
      </CardFooter>
    </Card>
  );
}
