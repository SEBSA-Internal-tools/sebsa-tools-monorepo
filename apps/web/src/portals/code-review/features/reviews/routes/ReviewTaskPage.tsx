import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, History, Image as ImageIcon, LogOut } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { GeneralCheckQuestion, Review, ReviewDecision, ReviewDraft } from '@sdp/contracts';
import {
  CycleBadge,
  PriorityPill,
  StatusBadge,
  VersionTag,
} from '@/portals/code-review/components/badges.tsx';
import { MonoId } from '@/portals/code-review/components/cells.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { BackLink, PageHeader } from '@/components/common/PageHeader.tsx';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import {
  useTask,
  useTaskAttachments,
  useTaskChecklist,
} from '@/portals/code-review/hooks/useTasks.ts';
import common from '@/content/common.json';
import reviews from '@/content/reviews.json';
import { ChecklistSummary } from '@/portals/code-review/components/ChecklistSummary.tsx';
import { ImageGallery } from '@/components/common/ImageGallery.tsx';
import { canDecideReview } from '@/lib/statusMachine.ts';
import {
  useAddScreenshot,
  useCommentScreenshot,
  useCurrentReview,
  useDecideReview,
  useGeneralCheckQuestions,
  useRemoveScreenshot,
  useReviewHistory,
  useSaveReviewDraft,
} from '../api/queries.ts';
import { Button } from '@/components/ui/Button.tsx';
import { CodeReviewForm } from '../components/CodeReviewForm.tsx';
import { HandoverDialog } from '../components/HandoverDialog.tsx';
import { ReviewCycleHistory } from '@/portals/code-review/components/ReviewCycleHistory.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';

/**
 * The Review Task page (screens 12, 13 and 14).
 *
 * One screen, three wireframes. 13 is the same page for a re-submitted task and
 * 14 adds the cycle history panel — both are states of this page rather than
 * separate designs, and `canDecideReview` decides whether the form is editable
 * at all.
 */

/**
 * How long the reviewer has to stop typing before their work is saved.
 *
 * Long enough that a sentence is one request rather than forty, short enough
 * that clicking away almost never falls inside the window — and the unmount
 * flush covers the times it does.
 */
const AUTOSAVE_DELAY_MS = 800;

const EMPTY_DRAFT: ReviewDraft = {
  generalCheck: [],
  findings: {
    incorrectCode: '',
    incompleteImplementation: '',
    sourceFormatting: '',
  },
  otherRemarks: '',
  feedbackSummary: '',
  rank: null,
};

/**
 * Owns the reviewer's in-progress answers.
 *
 * Split out so the draft can be initialised from the saved review in
 * `useState`'s initialiser and then left alone. The parent keys this component
 * on the task and review CYCLE, so React remounts it only when the reviewer
 * should genuinely start again, and leaves it untouched on every refetch — the
 * documented alternative to synchronising state in an effect. See the key at
 * the call site for why the review id is the wrong thing to key on.
 */
function ReviewFormSection({
  review,
  questions,
  onSaveDraft,
  onAddScreenshot,
  onCommentScreenshot,
  onRemoveScreenshot,
  onDecide,
  isDeciding,
  readOnly,
}: {
  review: Review | null;
  questions: readonly GeneralCheckQuestion[];
  /** Persists work in progress. No-op while the form is read-only. */
  onSaveDraft: (draft: ReviewDraft) => void;
  onAddScreenshot: (file: {
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    dataUrl: string;
  }) => void;
  onCommentScreenshot: (screenshotId: string, comment: string) => void;
  onRemoveScreenshot: (screenshotId: string) => void;
  onDecide: (decision: ReviewDecision, draft: ReviewDraft) => void;
  isDeciding: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<ReviewDraft>(() =>
    review === null
      ? EMPTY_DRAFT
      : {
          generalCheck: review.generalCheck,
          findings: review.findings,
          otherRemarks: review.otherRemarks,
          feedbackSummary: review.feedbackSummary,
          rank: review.rank,
        },
  );

  /*
   * Auto-save (spec p.10).
   *
   * The draft used to live only here, and there was no endpoint that could store
   * it: a reviewer who answered ten of the thirteen General Check questions and
   * then clicked away lost all ten.
   *
   * Debounced rather than saved per keystroke — the three findings boxes are
   * free text, and a request per character would be one per keypress for no gain.
   *
   * The two refs both exist for the UNMOUNT flush, which has to see the newest
   * values while depending on nothing: `latest` carries the draft, `save` the
   * callback, because the parent recreates its handler on every render and
   * depending on it would restart the debounce on each keystroke — so the save
   * would never fire while the reviewer kept typing.
   *
   * Both are assigned inside effects rather than in render (`react-hooks/refs`).
   */
  const latest = useRef(draft);
  const save = useRef(onSaveDraft);
  const isReadOnly = useRef(readOnly);
  const isDirty = useRef(false);

  useEffect(() => {
    latest.current = draft;
    save.current = onSaveDraft;
    isReadOnly.current = readOnly;

    if (readOnly || !isDirty.current) return;

    const timer = setTimeout(() => {
      save.current(latest.current);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [draft, readOnly, onSaveDraft]);

  // One final save on the way out, so navigating away inside the debounce window
  // does not discard the last few seconds of work. Empty deps on purpose: this
  // must run on unmount and never in between.
  useEffect(() => {
    return () => {
      if (!isReadOnly.current && isDirty.current) save.current(latest.current);
    };
  }, []);

  return (
    <CodeReviewForm
      draft={draft}
      onChange={(next) => {
        // Only a real edit arms the autosave. Without this the mount itself
        // would POST the untouched draft back to the server.
        isDirty.current = true;
        setDraft(next);
      }}
      questions={questions}
      screenshots={review?.screenshots ?? []}
      onAddScreenshot={onAddScreenshot}
      onCommentScreenshot={onCommentScreenshot}
      onRemoveScreenshot={onRemoveScreenshot}
      onDecide={(decision) => {
        onDecide(decision, draft);
      }}
      isDeciding={isDeciding}
      readOnly={readOnly}
    />
  );
}

export function ReviewTaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const { data: user } = useCurrentUser();
  const { data: task, isPending, error, refetch } = useTask(taskId);
  const { data: checklist } = useTaskChecklist(taskId);
  const { data: attachments } = useTaskAttachments(taskId);
  const { data: questions } = useGeneralCheckQuestions();
  const { data: current } = useCurrentReview(taskId);
  const { data: history } = useReviewHistory(taskId);

  const [isHandoverOpen, setHandoverOpen] = useState(false);

  const decide = useDecideReview(taskId ?? '');
  const saveDraft = useSaveReviewDraft(taskId ?? '');
  const addScreenshot = useAddScreenshot(taskId ?? '');
  const commentScreenshot = useCommentScreenshot(taskId ?? '');
  const removeScreenshot = useRemoveScreenshot(taskId ?? '');

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
  const isEditable = canDecideReview(actor, {
    status: task.status,
    developerId: task.developerId,
    reviewerId: task.reviewerId,
  });

  function handleDecide(decision: ReviewDecision, draft: ReviewDraft) {
    decide.mutate(
      { decision, draft },
      {
        onSuccess: (updated) => {
          toast.success(
            interpolate(
              decision === 'Approved' ? reviews.form.approved : reviews.form.changesRequested,
              { taskCode: updated.taskCode },
            ),
          );
          void navigate(ROUTES.reviewer.root);
        },
        onError: (cause) => {
          // The server re-runs every gate. If it refuses, its message is the
          // authoritative one — the client may be working from a stale template.
          toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
        },
      },
    );
  }

  return (
    <PageContainer className="space-y-4">
      <BackLink to={ROUTES.reviewer.root} label={reviews.form.back} />

      <PageHeader
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <MonoId value={task.taskCode} />
            <VersionTag version={task.version} />
            <StatusBadge status={task.status} />
            <CycleBadge cycle={task.reviewCycle} />
            <PriorityPill priority={task.priority} />
          </span>
        }
        icon={<ClipboardCheck className="size-5" />}
        tone="reviewer"
        actions={
          isEditable ? (
            <Button
              variant="secondary"
              onClick={() => {
                setHandoverOpen(true);
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {reviews.form.handover}
            </Button>
          ) : null
        }
      />

      {isHandoverOpen ? (
        <HandoverDialog
          task={task}
          onClose={() => {
            setHandoverOpen(false);
          }}
        />
      ) : null}

      <Card>
        <CardHeader
          title={reviews.form.developerChecklist}
          description={task.developerName}
          icon={<ClipboardCheck className="size-4" />}
        />
        <CardBody className="pt-4">
          <ChecklistSummary checklist={checklist ?? null} />
        </CardBody>
      </Card>

      {/*
        Hidden when there are none. Attaching is optional for the developer, so
        an empty card would appear on most reviews and add a section to an
        already long form that says only "nothing here".
      */}
      {(attachments ?? []).length === 0 ? null : (
        <Card>
          <CardHeader
            title={reviews.form.developerAttachments}
            description={reviews.form.developerAttachmentsHint}
            icon={<ImageIcon className="size-4" />}
          />
          <CardBody className="pt-4">
            <ImageGallery
              images={(attachments ?? []).map((item) => ({
                ...item,
                comment: item.caption,
              }))}
              emptyText=""
            />
          </CardBody>
        </Card>
      )}

      {/*
        Keyed on the task and its CYCLE, not on the review id.

        The form seeds itself in `useState` and is remounted when it should
        genuinely reset, which is the documented alternative to synchronising
        props into state from an effect — that pattern fights every refetch for
        ownership of half-typed findings.

        The review id looked like the natural key and was wrong. A review row is
        created lazily, on the first write: until then `current` is null and the
        key is "new", and the moment a reviewer attached their first screenshot
        the id appeared, the key changed, and the form remounted — silently
        discarding the General Check answers, findings and rank they had just
        spent ten minutes on. Nothing caught it because no test had ever
        uploaded a screenshot AND typed something.

        The cycle is the thing that actually means "start again": it advances
        only when a review round completes, which is exactly when a fresh form
        is wanted.
      */}
      <ReviewFormSection
        key={`${task.id}-${String(task.reviewCycle)}`}
        review={current ?? null}
        questions={questions ?? []}
        onSaveDraft={(draft) => {
          /*
           * Silent on success AND on failure, by design. This fires while the
           * reviewer is mid-sentence, so a toast either way would interrupt the
           * work it exists to protect — and a failed autosave costs nothing yet,
           * because the draft is still in the form. Deciding the review sends
           * the whole draft again and DOES report its errors.
           */
          saveDraft.mutate(draft);
        }}
        onAddScreenshot={(file) => {
          addScreenshot.mutate(file, {
            onError: (cause) => {
              toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
            },
          });
        }}
        onCommentScreenshot={(screenshotId, comment) => {
          commentScreenshot.mutate({ screenshotId, comment });
        }}
        onRemoveScreenshot={(screenshotId) => {
          removeScreenshot.mutate(screenshotId);
        }}
        onDecide={handleDecide}
        isDeciding={decide.isPending}
        readOnly={!isEditable}
      />

      <Card>
        <CardHeader
          title={reviews.form.historyTitle}
          description={reviews.form.historySubtitle}
          icon={<History className="size-4" />}
        />
        <CardBody className="pt-4">
          {(history ?? []).filter((entry) => entry.decision !== null).length === 0 ? (
            <EmptyState title={reviews.form.historyEmpty} />
          ) : (
            <ReviewCycleHistory
              entries={(history ?? []).filter((entry) => entry.decision !== null)}
            />
          )}
        </CardBody>
      </Card>
    </PageContainer>
  );
}
