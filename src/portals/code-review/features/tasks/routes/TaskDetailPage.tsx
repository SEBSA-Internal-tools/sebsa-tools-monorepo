import {
  Calendar,
  Camera,
  ClipboardList,
  FileText,
  History,
  Send,
  Tag as TagIcon,
  User,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/components/ui';
import {
  CustomerChip,
  PriorityPill,
  StatusBadge,
  Tag,
} from '@/portals/code-review/components/badges.tsx';
import { MonoId, OptionalCell } from '@/portals/code-review/components/cells.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { buttonVariants } from '@/components/ui/buttonVariants.ts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { Alert } from '@/components/ui/Alert.tsx';
import { BackLink, PageHeader } from '@/components/common/PageHeader.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { formatCompactDateTime, formatDate } from '@/lib/formatters.ts';
import { ApiError } from '@/lib/apiClient.ts';
import common from '@/content/common.json';
import tasksContent from '@/content/tasks.json';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import {
  useSubmitTask,
  useTask,
  useTaskChecklist,
  useTaskEvents,
  useTaskTypes,
  useIssueResponses,
  useRespondToIssue,
} from '../api/queries.ts';
import { canEditTask, canRespondToFindings, canSubmitForReview } from '@/lib/statusMachine.ts';
import { ChecklistSummary } from '@/portals/code-review/components/ChecklistSummary.tsx';
import { ImageGallery } from '@/components/common/ImageGallery.tsx';
import { useTaskAttachments } from '@/portals/code-review/hooks/useTasks.ts';
import { useReviewHistory } from '@/portals/code-review/hooks/useReviews.ts';
import { ReviewFeedbackPanel } from '../components/ReviewFeedbackPanel.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';

const EVENT_MARKER_CLASSES: Record<string, { dot: string; ring: string }> = {
  Created: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  Submitted: {
    dot: 'bg-blue-600',
    ring: 'ring-blue-100',
  },
  Resubmitted: {
    dot: 'bg-blue-600',
    ring: 'ring-blue-100',
  },
  Picked: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  ReviewerAssigned: {
    dot: 'bg-violet-600',
    ring: 'ring-violet-100',
  },
  ChangesRequested: {
    dot: 'bg-amber-500',
    ring: 'ring-amber-100',
  },
  Approved: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-100',
  },
  Cancelled: {
    dot: 'bg-rose-500',
    ring: 'ring-rose-100',
  },
  Delivered: {
    dot: 'bg-emerald-600',
    ring: 'ring-emerald-100',
  },
};

/**
 * Task Details (screens 18 and 19).
 *
 * One screen, not two. The wireframes draw an approved task and a draft task
 * separately, but they differ only in which actions the status permits — and
 * that question already has an answer in `statusMachine`. Two components would
 * mean two places to update when a transition changes.
 */
export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();

  const { data: user } = useCurrentUser();
  const { data: task, isPending, error, refetch } = useTask(taskId);
  const { data: checklist } = useTaskChecklist(taskId);
  const { data: events } = useTaskEvents(taskId);
  const { data: attachments } = useTaskAttachments(taskId);
  const { data: taskTypes } = useTaskTypes();
  /*
   * No checklist TEMPLATE request here, deliberately.
   *
   * This page renders the checklist that was SAVED against the task, and
   * `ChecklistSummary` reads its wording from that snapshot. The template was
   * fetched back when the page hydrated the wizard store itself; that job moved
   * to `EditTaskRedirect`, and the request outlived the reason for it.
   */
  const { data: reviewHistory } = useReviewHistory(taskId);
  const { data: responses } = useIssueResponses(taskId);
  const respond = useRespondToIssue(taskId ?? '');
  const submit = useSubmitTask(taskId ?? '');

  if (isPending) return <LoadingState />;
  if (error || !task) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const subject = {
    status: task.status,
    developerId: task.developerId,
    reviewerId: task.reviewerId,
  };

  const mayEdit = canEditTask(actor, subject);
  const isReady = task.isChecklistComplete;

  /*
   * The header Submit is for the FIRST submission only.
   *
   * `canSubmitForReview` is true on both edges — Draft → Submitted and
   * ChangesRequested → ReSubmitted — and this button gates only on checklist
   * completeness. On a returned task that let a developer resubmit without
   * answering the reviewer's findings: the server refused with
   * `RESPONSES_INCOMPLETE`, so nothing was corrupted, but the user was handed an
   * error they had no way to anticipate.
   *
   * Spec 2.11.2.2 makes "all feedback items addressed" the activation condition
   * for Resubmit, and `ReviewFeedbackPanel` below already enforces exactly that
   * through `resubmitReadiness` — in the place the developer is answering the
   * findings. One control, one rule; this one steps aside once a task has been
   * returned.
   */
  const maySubmitFirstTime = canSubmitForReview(actor, subject) && task.status === 'Draft';

  function handleSubmit() {
    submit.mutate(undefined, {
      onSuccess: (updated) => {
        toast.success(`${updated.taskCode} ${common.status[updated.status].toLowerCase()}`);
      },
      onError: (cause) => {
        // The server's message is the authoritative one — it knows rules the
        // client may not have re-derived (a checklist changed in another tab).
        toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      },
    });
  }

  const chronologicalEvents = [...(events ?? [])].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  return (
    <PageContainer className="space-y-5">
      <BackLink to={ROUTES.developer.root} label={tasksContent.detail.back} />

      {/* Task Header */}
      <PageHeader
        title={task.title}
        subtitle={
          <div className="text-ink-600 flex flex-wrap items-center gap-2 text-xs font-medium">
            <MonoId value={task.taskCode} className="text-xs font-bold text-ink-900" />
            <span className="text-ink-300">·</span>
            <StatusBadge status={task.status} />
            <span className="text-ink-300">·</span>
            <PriorityPill priority={task.priority} />
            <span className="text-ink-300">·</span>
            <Tag className="bg-violet-100 font-semibold text-violet-700">
              Cycle {task.reviewCycle}
            </Tag>
            <span className="text-ink-300">·</span>
            <span className="text-ink-500">
              {task.submittedAt
                ? `Submitted ${formatDate(task.submittedAt)}`
                : `Created ${formatDate(task.createdAt)}`}
            </span>
          </div>
        }
        icon={<FileText className="size-5" />}
        tone="developer"
        actions={
          <div className="flex items-center gap-2.5">
            {mayEdit ? (
              <Link
                to={ROUTES.developer.editTask(task.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {tasksContent.detail.editDraft}
              </Link>
            ) : null}
            {maySubmitFirstTime ? (
              <Button onClick={handleSubmit} disabled={!isReady} isLoading={submit.isPending}>
                <Send className="size-4" aria-hidden="true" />
                {submit.isPending ? tasksContent.detail.submitting : tasksContent.detail.submit}
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Contextual Status Banners for Important States */}
      {task.status === 'Cancelled' ? (
        <Alert tone="info" title="Task Cancelled">
          This task was cancelled and is no longer active.
        </Alert>
      ) : task.status === 'Approved' ? (
        <Alert tone="success" title="Review Approved">
          This task has been approved by the reviewer.
        </Alert>
      ) : task.status === 'ChangesRequested' ? (
        <Alert tone="warning" title="Changes Requested">
          The reviewer has requested changes. Please address the feedback findings below before
          resubmitting.
        </Alert>
      ) : null}

      {/* Warning banner when draft is blocked from submission */}
      {maySubmitFirstTime && !isReady ? (
        <Alert tone="warning" title={tasksContent.detail.submitBlocked} />
      ) : null}

      {/* 2-Column Balanced Responsive Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left / Primary Column (7-8 cols on desktop) */}
        <div className="space-y-5 lg:col-span-7 xl:col-span-8">
          {/* Actionable Review Feedback Response Panel when changes are requested */}
          {canRespondToFindings(actor, subject) ? (
            <ReviewFeedbackPanel
              review={
                (reviewHistory ?? []).find((entry) => entry.decision === 'ChangesRequested') ?? null
              }
              responses={responses ?? []}
              onRespond={(input) => {
                respond.mutate(input, {
                  onError: (cause) => {
                    toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
                  },
                });
              }}
              onResubmit={handleSubmit}
              isResubmitting={submit.isPending}
              disabled={respond.isPending}
            />
          ) : null}

          {/* Developer Quality Checklist */}
          <Card>
            <CardHeader
              title={tasksContent.detail.checklistTitle}
              description={tasksContent.detail.checklistSubtitle}
              icon={<ClipboardList className="size-4 text-violet-600" />}
            />
            <CardBody className="pt-3">
              <ChecklistSummary checklist={checklist ?? null} />
            </CardBody>
          </Card>

          {/* Review Feedback History */}
          {(reviewHistory ?? []).filter((entry) => entry.decision !== null).length === 0 ? null : (
            <Card>
              <CardHeader
                title={tasksContent.response.historyTitle}
                description={tasksContent.response.historySubtitle}
                icon={<History className="size-4 text-violet-600" />}
              />
              <CardBody className="pt-3">
                <ReviewCycleHistory
                  entries={(reviewHistory ?? []).filter((entry) => entry.decision !== null)}
                />
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right / Sidebar Column (4-5 cols on desktop) */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:col-span-5 xl:col-span-4">
          {/* Task Details Card (Grouped Structured Layout) */}
          <Card>
            <CardHeader
              title={tasksContent.detail.informationTitle}
              description={tasksContent.detail.informationSubtitle}
              icon={<ClipboardList className="size-4 text-violet-600" />}
            />
            <CardBody className="space-y-4 pt-3">
              {/* 1. Task Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
                    <FileText className="size-3.5" aria-hidden="true" />
                  </span>
                  <h4 className="text-xs font-bold tracking-tight text-ink-900">Task Details</h4>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.taskId}
                    </dt>
                    <dd className="mt-1 font-bold text-ink-900">
                      {task.taskCode ? (
                        <span className="font-bold text-ink-900">{task.taskCode}</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.crimId}
                    </dt>
                    <dd className="mt-1 font-bold text-ink-900">{task.crimId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.customer}
                    </dt>
                    <dd className="mt-1">
                      <CustomerChip
                        name={task.customerName}
                        color={task.customerColor}
                        variant="inline"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.version}
                    </dt>
                    <dd className="mt-1 font-semibold text-ink-900">
                      <OptionalCell value={task.version} />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.priority}
                    </dt>
                    <dd className="mt-1">
                      <PriorityPill priority={task.priority} />
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">{tasksContent.detail.fields.cycle}</dt>
                    <dd className="mt-1 font-semibold text-ink-900">Cycle {task.reviewCycle}</dd>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-line/70" />

              {/* 2. People */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
                    <User className="size-3.5" aria-hidden="true" />
                  </span>
                  <h4 className="text-xs font-bold tracking-tight text-ink-900">People</h4>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.developer}
                    </dt>
                    <dd
                      className="mt-1 truncate font-semibold text-ink-900"
                      title={task.developerName}
                    >
                      {task.developerName}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.reviewer}
                    </dt>
                    <dd
                      className="mt-1 truncate font-semibold text-ink-900"
                      title={task.reviewerName ?? undefined}
                    >
                      <OptionalCell value={task.reviewerName} fallback={common.badges.unassigned} />
                    </dd>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-line/70" />

              {/* 3. Dates */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
                    <Calendar className="size-3.5" aria-hidden="true" />
                  </span>
                  <h4 className="text-xs font-bold tracking-tight text-ink-900">Dates</h4>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.created}
                    </dt>
                    <dd className="mt-1 font-semibold text-ink-900">
                      {formatDate(task.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-ink-400">
                      {tasksContent.detail.fields.submitted}
                    </dt>
                    <dd className="mt-1 font-semibold text-ink-900">
                      {task.submittedAt === null ? '—' : formatDate(task.submittedAt)}
                    </dd>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-line/70" />

              {/* 4. Task Type */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-5.5 place-items-center rounded-md bg-violet-100/80 text-violet-600 shadow-2xs">
                    <TagIcon className="size-3.5" aria-hidden="true" />
                  </span>
                  <h4 className="text-xs font-bold tracking-tight text-ink-900">
                    {tasksContent.detail.fields.taskTypes}
                  </h4>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {task.taskTypeIds.length > 0 ? (
                    task.taskTypeIds.map((id) => (
                      <span
                        key={id}
                        className="text-ink-800 inline-flex items-center rounded-md border border-line-strong/60 bg-surface px-2.5 py-1 text-xs font-medium shadow-2xs"
                      >
                        {taskTypes?.find((type) => type.id === id)?.name ?? id}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-ink-400">—</span>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Screenshot Feedback Card */}
          <Card>
            <CardHeader
              title={tasksContent.detail.attachmentsTitle}
              icon={<Camera className="size-4 text-violet-600" />}
            />
            <CardBody className="pt-3">
              {(attachments ?? []).length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-line bg-canvas/40 px-3 py-2.5 text-xs text-ink-500">
                  <Camera className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <span>{tasksContent.detail.attachmentsEmpty}</span>
                </div>
              ) : (
                <ImageGallery
                  images={(attachments ?? []).map((item) => ({
                    ...item,
                    comment: item.caption,
                  }))}
                  emptyTitle={tasksContent.detail.attachmentsEmptyTitle}
                  emptyText={tasksContent.detail.attachmentsEmpty}
                />
              )}
            </CardBody>
          </Card>

          {/* Task History Timeline Card */}
          <Card>
            <CardHeader
              title={tasksContent.detail.historyTitle}
              description={tasksContent.detail.historySubtitle}
              icon={<History className="size-4 text-violet-600" />}
            />
            <CardBody className="pt-2.5 pb-3">
              {chronologicalEvents.length === 0 ? (
                <p className="py-1 text-xs text-ink-400">No events recorded.</p>
              ) : (
                <div className="space-y-0">
                  {chronologicalEvents.map((event, index) => {
                    const marker = EVENT_MARKER_CLASSES[event.kind] ?? {
                      dot: 'bg-violet-600',
                      ring: 'ring-violet-100',
                    };
                    const isLast = index === chronologicalEvents.length - 1;

                    return (
                      <div key={event.id} className="relative flex items-start gap-3">
                        {/* Continuous vertical connector line */}
                        {!isLast ? (
                          <span
                            className="absolute top-3 bottom-0 left-[5px] w-[1.5px] bg-line/80"
                            aria-hidden="true"
                          />
                        ) : null}

                        {/* Status-aware Timeline Marker */}
                        <span
                          className={cn(
                            'relative z-10 mt-1 size-3 shrink-0 rounded-full border border-surface shadow-2xs ring-2',
                            marker.dot,
                            marker.ring,
                          )}
                          aria-hidden="true"
                        />

                        {/* Event Details */}
                        <div className={cn('min-w-0 flex-1', !isLast ? 'pb-3.5' : 'pb-0.5')}>
                          <p className="text-xs leading-tight font-bold text-ink-900">
                            {tasksContent.detail.events[event.kind] ?? event.kind}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-ink-500">
                            {formatCompactDateTime(event.occurredAt)}
                          </p>
                          {event.actorName ? (
                            <p
                              className="mt-0.5 truncate text-[11px] font-medium text-ink-700"
                              title={event.actorName}
                            >
                              {event.actorName}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
