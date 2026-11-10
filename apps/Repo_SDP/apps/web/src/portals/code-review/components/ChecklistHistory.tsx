import { useMemo } from 'react';
import type { ChecklistSubmission, TaskChecklist } from '@sdp/contracts';
import { ChecklistSummary } from './ChecklistSummary.tsx';
import { formatDateTime } from '@/lib/formatters.ts';

function asChecklist(submission: ChecklistSubmission): TaskChecklist {
  return {
    id: submission.id,
    taskId: submission.taskId,
    taskTypeIds: submission.taskTypes.map((type) => type.id),
    answers: submission.categories.flatMap((category) =>
      category.questions.map((question, index) => ({
        questionId: question.questionId,
        questionText: question.questionText,
        categoryName: category.categoryName,
        order: category.categoryOrder * 10_000 + question.questionOrder + index,
        answer: question.answer,
      })),
    ),
    remarks: submission.remarks,
    isComplete: true,
    checkedDate: submission.submittedAt,
    developerId: submission.developerId,
  };
}

export function ChecklistHistory({
  submissions,
  fallback,
}: {
  submissions: readonly ChecklistSubmission[];
  fallback: TaskChecklist | null;
}) {
  const canonical = useMemo(() => {
    if (!submissions || submissions.length === 0) return undefined;
    const v1 = submissions.find((entry) => entry.version === 1);
    if (v1) return v1;
    return [...submissions].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    )[0];
  }, [submissions]);

  const checklist = useMemo(
    () => (canonical === undefined ? fallback : asChecklist(canonical)),
    [canonical, fallback],
  );

  const submittedAt = canonical?.submittedAt ?? checklist?.checkedDate;

  return (
    <div className="space-y-3.5">
      {submittedAt && (
        <p className="text-xs font-medium text-ink-500">
          Submitted {formatDateTime(submittedAt)}
        </p>
      )}
      <ChecklistSummary checklist={checklist} />
    </div>
  );
}
