import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  ListChecks,
  Pencil,
  Save,
  Send,
  X,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button.tsx';
import { Card, CardBody, CardHeader } from '@/components/ui/Card.tsx';
import { PageHeader } from '@/components/common/PageHeader.tsx';
import {
  RequirementList,
  Stepper,
  type Requirement,
  type Step,
} from '@/components/common/Stepper.tsx';
import { ROUTES } from '@/config/routes.ts';
import { ApiError } from '@/lib/apiClient.ts';
import { interpolate } from '@/lib/formatters.ts';
import { useCurrentUser } from '@/hooks/useCurrentUser.ts';
import { canEditTask } from '@/lib/statusMachine.ts';
import common from '@/content/common.json';
import tasks from '@/content/tasks.json';
import { checklistProgress } from '../domain/checklistRules.ts';
import {
  useChecklistTemplate,
  useCreateTask,
  useSubmitTask,
  useTask,
  useTaskChecklist,
  useUpdateTask,
} from '../api/queries.ts';
import {
  canLeaveStep,
  missingRequirements,
  requirementsForStep,
  TASK_WIZARD_STEPS,
  type TaskRequirement,
  type TaskWizardStep,
} from '../domain/taskRules.ts';
import { useTaskDraft, type TaskDraftState } from '../hooks/useTaskDraft.ts';
import { ChecklistSidePanels, WizardChecklistStep } from '../components/WizardChecklistStep.tsx';
import { SystemInformationPanel, WizardDetailsStep } from '../components/WizardDetailsStep.tsx';
import { ReviewSidePanels, WizardReviewStep } from '../components/WizardReviewStep.tsx';
import { PageContainer } from '@/components/common/PageContainer.tsx';
import { ErrorState, LoadingState } from '@/components/common/states.tsx';

/**
 * Task wizard (screens 22–24) — creation and editing flow.
 *
 * This component owns navigation and persistence; the step components own only
 * their fields. Every gate below is a call into `taskRules`, so the Next button,
 * the requirement panel and the final Submit read from one source and cannot
 * disagree about whether the task is ready.
 *
 * Steps are URL segments rather than local state, so a half-finished task is a
 * link, browser Back steps backwards through the wizard rather than leaving it,
 * and a draft resumes at the step that is actually incomplete.
 */

function isWizardStep(value: string | undefined): value is TaskWizardStep {
  return TASK_WIZARD_STEPS.includes(value as TaskWizardStep);
}

/** Requirements each step surfaces in its side panel, in the order shown. */
const PANEL_REQUIREMENTS: Record<TaskWizardStep, readonly TaskRequirement[]> = {
  details: ['customer', 'crimId', 'priority', 'versionTooLong'],
  checklist: ['taskTypes', 'checklist'],
  review: [],
};

type PersistedDraftFields = Pick<
  TaskDraftState,
  'customerId' | 'crimId' | 'version' | 'priority' | 'taskTypeIds' | 'answers' | 'remarks'
>;

/** Compare the values the API persists, independent of array insertion order. */
function draftFingerprint(draft: PersistedDraftFields): string {
  return JSON.stringify({
    customerId: draft.customerId,
    crimId: draft.crimId.trim(),
    version: draft.version.trim(),
    priority: draft.priority,
    taskTypeIds: [...draft.taskTypeIds].sort(),
    answers: [...draft.answers]
      .map(({ questionId, answer }) => ({ questionId, answer }))
      .sort((left, right) => left.questionId.localeCompare(right.questionId)),
    remarks: draft.remarks.trim(),
  });
}

export function NewTaskWizard({ mode = 'create' }: { mode?: 'create' | 'edit' } = {}) {
  const { step, taskId: routeTaskId } = useParams<{
    step: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const draft = useTaskDraft();
  const { data: user } = useCurrentUser();
  const isEditMode = mode === 'edit' || Boolean(routeTaskId);
  const editTaskId = routeTaskId ?? (isEditMode ? (draft.taskId ?? undefined) : undefined);

  const {
    data: existingTask,
    isPending: taskPending,
    error: taskError,
    refetch: refetchTask,
  } = useTask(editTaskId);
  const { data: existingChecklist, isPending: checklistPending } = useTaskChecklist(editTaskId);

  const {
    data: template,
    isPending: templatePending,
    isError: templateFailed,
    refetch: refetchTemplate,
  } = useChecklistTemplate();

  const actor = { userId: user?.id ?? '', roles: user?.roles ?? [] };
  const mayEdit =
    !isEditMode ||
    (existingTask !== undefined &&
      canEditTask(actor, {
        status: existingTask.status,
        developerId: existingTask.developerId,
        reviewerId: existingTask.reviewerId,
      }));

  const hydratedTaskId = useRef<string | null>(null);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(() =>
    draft.taskId === null ? null : draftFingerprint(draft),
  );

  // Auto-hydrate when loading an existing task if store is not yet initialized for this task
  useEffect(() => {
    if (
      !isEditMode ||
      !editTaskId ||
      !existingTask ||
      checklistPending ||
      !mayEdit ||
      hydratedTaskId.current === editTaskId
    )
      return;

    const answers = (existingChecklist?.answers ?? []).map((entry) => ({
      questionId: entry.questionId,
      answer: entry.answer,
    }));

    const serverDraft = {
      taskId: existingTask.id,
      taskCode: existingTask.taskCode,
      customerId: existingTask.customerId,
      crimId: existingTask.crimId,
      version: existingTask.version ?? '',
      priority: existingTask.priority,
      taskTypeIds: existingTask.taskTypeIds,
      answers,
      remarks: existingChecklist?.remarks ?? '',
      noteToReviewer: existingTask.noteToReviewer ?? '',
      createdAt: existingTask.createdAt,
      submittedAt: existingTask.submittedAt,
    };

    hydratedTaskId.current = editTaskId;
    draft.hydrate(serverDraft);
    setSavedDraftFingerprint(draftFingerprint(serverDraft));
  }, [isEditMode, editTaskId, existingTask, existingChecklist, checklistPending, mayEdit, draft]);

  const [showErrors, setShowErrors] = useState(false);
  const actionInFlight = useRef(false);
  const [activeAction, setActiveAction] = useState<'save' | 'next' | 'submit' | null>(null);

  const effectiveTaskId = draft.taskId ?? editTaskId ?? '';
  const createTask = useCreateTask();
  const updateTask = useUpdateTask(effectiveTaskId);
  const submitTask = useSubmitTask(effectiveTaskId);

  const progress = useMemo(
    () => checklistProgress(template ?? [], draft.taskTypeIds, draft.answers),
    [template, draft.taskTypeIds, draft.answers],
  );

  const missing = useMemo(
    () =>
      missingRequirements({
        draft: {
          customerId: draft.customerId,
          crimId: draft.crimId,
          version: draft.version,
          priority: draft.priority,
        },
        taskTypes: draft.taskTypeIds,
        isChecklistComplete: progress.isComplete,
      }),
    [
      draft.customerId,
      draft.crimId,
      draft.version,
      draft.priority,
      draft.taskTypeIds,
      progress.isComplete,
    ],
  );

  const getStepUrl = (targetStep: string) =>
    isEditMode && editTaskId
      ? ROUTES.developer.editTaskStep(editTaskId, targetStep)
      : ROUTES.developer.newTaskStep(targetStep);

  const handleReturnToContext = () => {
    if (isEditMode && editTaskId) {
      void navigate(ROUTES.developer.task(editTaskId));
    } else {
      void navigate(ROUTES.developer.root);
    }
  };

  if (isEditMode && editTaskId) {
    if (taskPending || checklistPending) {
      return (
        <PageContainer>
          <LoadingState className="min-h-[60vh]" />
        </PageContainer>
      );
    }
    if (taskError || !existingTask || !mayEdit) {
      return (
        <PageContainer>
          <ErrorState
            title={tasks.detail.notEditableTitle}
            message={tasks.detail.notEditable}
            onRetry={() => {
              void refetchTask();
            }}
            className="min-h-[60vh]"
          />
        </PageContainer>
      );
    }
  }

  if (!isWizardStep(step)) {
    return <Navigate to={getStepUrl('details')} replace />;
  }

  // Re-bound after the guard: TypeScript does not carry the narrowing of a
  // destructured param into the hoisted function declarations below.
  const currentStep: TaskWizardStep = step;
  const stepIndex = TASK_WIZARD_STEPS.indexOf(currentStep);

  if (currentStep !== 'details' && !canLeaveStep('details', missing)) {
    return <Navigate to={getStepUrl('details')} replace />;
  }

  if (currentStep !== 'details' && templatePending) {
    return (
      <PageContainer>
        <LoadingState className="min-h-[60vh]" />
      </PageContainer>
    );
  }

  if (currentStep !== 'details' && templateFailed) {
    return (
      <PageContainer>
        <ErrorState
          onRetry={() => {
            void refetchTemplate();
          }}
          className="min-h-[60vh]"
        />
      </PageContainer>
    );
  }

  if (currentStep === 'review' && !canLeaveStep('checklist', missing)) {
    return <Navigate to={getStepUrl('checklist')} replace />;
  }

  const isBusy = activeAction !== null;

  const steps: Step[] = TASK_WIZARD_STEPS.map((id, index) => ({
    id,
    title: tasks.wizard.steps[id],
    state:
      id === currentStep
        ? showErrors && !canLeaveStep(id, missing)
          ? 'error'
          : 'current'
        : index < stepIndex
          ? canLeaveStep(id, missing)
            ? 'complete'
            : 'error'
          : 'upcoming',
  }));

  const requirements: Requirement[] = PANEL_REQUIREMENTS[currentStep].map((requirement) => ({
    id: requirement,
    label: tasks.wizard.requirements[requirement],
    state: missing.includes(requirement) ? 'blocking' : 'met',
  }));

  const blockedCount = requirementsForStep(currentStep, missing).length;
  const canAdvance = canLeaveStep(currentStep, missing);
  const hasUnsavedChanges =
    savedDraftFingerprint === null || draftFingerprint(draft) !== savedDraftFingerprint;

  /**
   * Persists whatever the current step owns, then reports the task id.
   *
   * Save Draft writes details (and any checklist work on later steps). Moving
   * from Details to Checklist does not persist anything; moving from Checklist
   * to Review sends both records in one create/update request.
   */
  async function persist({ includeChecklist = false } = {}): Promise<string | null> {
    try {
      if (!canLeaveStep('details', missing) || draft.priority === '') {
        setShowErrors(true);
        return null;
      }

      let taskId = draft.taskId;
      let shouldCreate = taskId === null;
      const applicableQuestionIds =
        template === undefined
          ? null
          : new Set(
              template.flatMap((category) =>
                category.questions
                  .filter(
                    (question) =>
                      question.isActive &&
                      question.appliesTo.some((taskTypeId) =>
                        draft.taskTypeIds.includes(taskTypeId),
                      ),
                  )
                  .map((question) => question.id),
              ),
            );
      const checklistAnswers =
        applicableQuestionIds === null
          ? draft.answers
          : draft.answers.filter((answer) => applicableQuestionIds.has(answer.questionId));
      const payload = {
        customerId: draft.customerId,
        crimId: draft.crimId.trim(),
        version: draft.version.trim(),
        priority: draft.priority,
        ...(includeChecklist
          ? {
              taskTypeIds: [...draft.taskTypeIds],
              checklistAnswers: checklistAnswers.map((entry) => ({ ...entry })),
              additionalRemarks: draft.remarks.trim(),
            }
          : {}),
      };

      if (!shouldCreate && taskId !== null) {
        try {
          const updated = await updateTask.mutateAsync(payload);
          if (draft.createdAt === null && updated?.createdAt) {
            draft.setTaskId(updated.id, updated.taskCode, updated.createdAt, updated.submittedAt);
          }
        } catch (updateError) {
          // If the server draft was lost (e.g. mock DB reset, deleted task, or server restart returning 404),
          // self-heal by creating the task fresh on the server instead of getting stuck.
          if (updateError instanceof ApiError && updateError.statusCode === 404) {
            shouldCreate = true;
          } else {
            throw updateError;
          }
        }
      }

      if (shouldCreate) {
        const created = await createTask.mutateAsync(payload);
        taskId = created.id;
        draft.setTaskId(created.id, created.taskCode, created.createdAt, created.submittedAt);
      }
      if (includeChecklist) draft.hydrate({ answers: checklistAnswers });

      setSavedDraftFingerprint(draftFingerprint(useTaskDraft.getState()));

      return taskId;
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
      return null;
    }
  }

  async function handleNext() {
    if (!canAdvance) {
      setShowErrors(true);
      return;
    }

    if (currentStep === 'checklist') {
      const taskId = await persist({ includeChecklist: true });
      if (taskId === null) return;
    }

    setShowErrors(false);
    const next = TASK_WIZARD_STEPS[stepIndex + 1];
    if (next !== undefined) void navigate(getStepUrl(next));
  }

  async function handleSaveDraft() {
    const taskId = await persist({ includeChecklist: true });
    if (taskId === null) return;
    toast.success(common.actions.saveDraft);
  }

  async function handleSubmit() {
    if (missing.length > 0) {
      setShowErrors(true);
      /*
       * A toast, because the review step has nowhere else to say this. It owns
       * no requirements of its own, so `statusLine` renders nothing and the
       * requirement panel is empty — everything still outstanding belongs to an
       * earlier step the user is no longer looking at. Naming the first one is
       * what makes the dimmed Submit explicable instead of merely dead.
       */
      const first = missing[0];
      if (first !== undefined) toast.error(tasks.wizard.requirements[first]);
      return;
    }

    // Re-save the whole draft before submit. This protects a refreshed or
    // manually addressed review URL from presenting locally complete data while
    // the server still holds an older, incomplete checklist.
    const taskId = await persist({ includeChecklist: true });
    if (taskId === null) return;

    try {
      const submitted = await submitTask.mutateAsync();
      // `replace`, so browser Back from the confirmation returns to My Tasks
      // rather than to a review step for a task that has already gone.
      void navigate(ROUTES.developer.newTaskStep('confirmed'), {
        replace: true,
        state: {
          taskId: submitted.id,
          taskCode: submitted.taskCode,
          title: submitted.title,
          reviewCycle: submitted.reviewCycle,
        },
      });
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
    }
  }

  const unanswered = Math.max(progress.total - progress.answered, 0);

  async function runOnce(actionName: 'save' | 'next' | 'submit', action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActiveAction(actionName);
    try {
      await action();
    } finally {
      actionInFlight.current = false;
      setActiveAction(null);
    }
  }

  const statusLine =
    currentStep === 'review' && missing.length === 0 ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {tasks.wizard.status.allRequirementsMet}
      </span>
    ) : blockedCount > 0 ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertCircle className="size-4" aria-hidden="true" />
        {currentStep === 'checklist' && unanswered > 0
          ? interpolate(
              unanswered === 1
                ? tasks.wizard.status.questionsUnanswered
                : tasks.wizard.status.questionsUnansweredPlural,
              { count: unanswered },
            )
          : interpolate(
              blockedCount === 1
                ? tasks.wizard.status.requiredRemaining
                : tasks.wizard.status.requiredRemainingPlural,
              { count: blockedCount },
            )}
      </span>
    ) : null;

  return (
    <PageContainer className="space-y-5 pb-10">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={isBusy}
          onClick={handleReturnToContext}
          className="group text-ink-600 -ml-2.5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <ArrowLeft
            className="size-3.5 text-ink-500 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          {isEditMode ? 'Back to Task Details' : 'Back to Dashboard'}
        </button>
      </div>

      <PageHeader
        title={isEditMode ? (tasks.wizard.editTitle ?? 'Edit Review Task') : tasks.wizard.title}
        subtitle={tasks.wizard.subtitles[currentStep]}
        icon={
          isEditMode ? (
            <Pencil className="size-6 text-white" />
          ) : (
            <FilePlus2 className="size-6 text-white" />
          )
        }
        tone="developer"
      />

      <Stepper steps={steps} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="h-full">
          {currentStep === 'details' ? <WizardDetailsStep showErrors={showErrors} /> : null}
          {currentStep === 'checklist' ? <WizardChecklistStep /> : null}
          {currentStep === 'review' ? <WizardReviewStep /> : null}
        </div>

        <div className="flex flex-col space-y-5">
          {currentStep === 'details' ? (
            <>
              <Card>
                <CardHeader
                  title={tasks.wizard.blockedTitle}
                  icon={<ListChecks className="size-4 text-violet-600" />}
                />
                <CardBody className="pt-3">
                  <RequirementList requirements={requirements} />
                </CardBody>
              </Card>
              <SystemInformationPanel className="flex-1" />
            </>
          ) : null}
          {currentStep === 'checklist' ? <ChecklistSidePanels /> : null}
          {currentStep === 'review' ? <ReviewSidePanels /> : null}
        </div>
      </div>

      {/*
        Sticky bottom action bar
      */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-5 py-3.5 shadow-lg backdrop-blur-md">
        {/* Left Side Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {stepIndex > 0 ? (
            <Button
              variant="secondary"
              disabled={isBusy}
              leadingIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
              onClick={() => {
                const previous = TASK_WIZARD_STEPS[stepIndex - 1];
                if (previous !== undefined) void navigate(getStepUrl(previous));
              }}
            >
              {tasks.wizard.backTo[stepIndex === 1 ? 'details' : 'checklist']}
            </Button>
          ) : (
            <Button
              variant="ghost"
              disabled={isBusy}
              leadingIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
              onClick={handleReturnToContext}
              className="text-ink-600 hover:text-ink-900"
            >
              {isEditMode ? 'Back to Task Details' : 'Back to Dashboard'}
            </Button>
          )}

          <Button
            variant="ghost"
            disabled={isBusy}
            leadingIcon={<X className="size-4" aria-hidden="true" />}
            onClick={handleReturnToContext}
            className="hover:bg-danger-subtle text-ink-500 hover:text-danger"
          >
            {tasks.wizard.cancel}
          </Button>
        </div>

        {/* Right Side Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {statusLine}

          <Button
            variant="secondary"
            leadingIcon={<Save className="size-4" aria-hidden="true" />}
            onClick={() => {
              void runOnce('save', handleSaveDraft);
            }}
            isLoading={activeAction === 'save'}
            // Saving needs enough to create a task: the server derives the title
            // and the task code from exactly these fields.
            disabled={!canLeaveStep('details', missing) || !hasUnsavedChanges}
          >
            {tasks.wizard.saveDraft}
          </Button>

          {currentStep === 'review' ? (
            <Button
              onClick={() => {
                void runOnce('submit', handleSubmit);
              }}
              isLoading={activeAction === 'submit'}
              leadingIcon={<Send className="size-4" aria-hidden="true" />}
              aria-disabled={missing.length > 0}
            >
              {tasks.wizard.submit}
            </Button>
          ) : (
            <Button
              onClick={() => {
                void runOnce('next', handleNext);
              }}
              isLoading={activeAction === 'next'}
              trailingIcon={<ArrowRight className="size-4" aria-hidden="true" />}
              aria-disabled={!canAdvance}
            >
              {tasks.wizard.nextTo[currentStep === 'details' ? 'checklist' : 'review']}
            </Button>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
