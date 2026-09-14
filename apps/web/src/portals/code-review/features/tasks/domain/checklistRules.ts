import type {
  ChecklistAnswer,
  ChecklistCategory,
  ChecklistCategoryProgress,
  ChecklistProgress,
  ChecklistQuestion,
  TaskTypeId,
} from '@sdp/contracts';

const VALID_ANSWERS = new Set<ChecklistAnswer>(['Yes', 'No', 'NA']);

/**
 * The dynamic quality checklist (spec FL 2.6-01/02).
 *
 * The engine is data-driven end to end: categories, questions and task types are
 * all administered, so nothing here knows the name of a single question or task
 * type. Adding "Customization" to a question is a row edit; adding a whole task
 * type is a row insert. No code changes either way.
 *
 * The filter is applied to QUESTIONS, not categories. A category is a grouping
 * label with no task-type opinion of its own — it appears for a task type when
 * at least one of its questions does. That is what lets the same nine categories
 * serve five different question sets, with Unit Testing's four questions stored
 * once and shared by all of them.
 */

/** A question is rendered when it is active and covers one of the chosen types. */
function applies(question: ChecklistQuestion, taskTypeIds: readonly TaskTypeId[]): boolean {
  return question.isActive && question.appliesTo.some((id) => taskTypeIds.includes(id));
}

/**
 * Categories that have at least one applicable question, in declared order, each
 * carrying only the questions that apply.
 *
 * With no task type selected the result is empty rather than "everything":
 * screen 23 shows an explicit prompt to pick a task type first, and rendering
 * all 29 questions before the user has narrowed anything would be worse than
 * showing none.
 */
export function visibleCategories(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
): ChecklistCategory[] {
  if (taskTypeIds.length === 0) return [];

  return categories
    .filter((category) => category.isActive)
    .map((category) => ({
      ...category,
      questions: category.questions
        .filter((question) => applies(question, taskTypeIds))
        .sort((a, b) => a.order - b.order),
    }))
    .filter((category) => category.questions.length > 0)
    .sort((a, b) => a.order - b.order);
}

export function visibleQuestions(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
): ChecklistQuestion[] {
  return visibleCategories(categories, taskTypeIds).flatMap((category) => category.questions);
}

function answerMap(
  answers: readonly { questionId: string; answer: string }[],
): Map<string, string> {
  /*
   * Runtime state can outlive a deployment in sessionStorage. Do not let an
   * obsolete or corrupted value such as `"Maybe"` count as an answer merely
   * because TypeScript trusted it at compile time. The API validates this too,
   * but progress and the Next gate run before the API is called.
   */
  return new Map(
    answers
      .filter((entry) => VALID_ANSWERS.has(entry.answer as ChecklistAnswer))
      .map((entry) => [entry.questionId, entry.answer]),
  );
}

/**
 * Progress per category and overall.
 *
 * Only *visible* questions count. An answer left behind by a task type the
 * developer has since deselected must not hold the checklist open, and must not
 * inflate the completed count either — which is why answers are counted against
 * the visible set rather than the stored array.
 */
export function checklistProgress(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): ChecklistProgress {
  const byQuestion = answerMap(answers);
  const visible = visibleCategories(categories, taskTypeIds);

  const categoryProgress: ChecklistCategoryProgress[] = visible.map((category) => {
    const answered = category.questions.filter((question) => byQuestion.has(question.id)).length;
    return {
      categoryId: category.id,
      categoryName: category.name,
      answered,
      total: category.questions.length,
      isComplete: answered === category.questions.length,
    };
  });

  const total = categoryProgress.reduce((sum, category) => sum + category.total, 0);
  const answered = categoryProgress.reduce((sum, category) => sum + category.answered, 0);

  return {
    categories: categoryProgress,
    answered,
    total,
    // An empty checklist is not a complete one. Without this guard a task with
    // no types selected would report `0 === 0` and sail past the submit gate.
    isComplete: total > 0 && answered === total,
    issueCount: issueCount(categories, taskTypeIds, answers),
  };
}

/** FL 2.6-02: every rendered question must carry an answer. */
export function answersComplete(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): boolean {
  return checklistProgress(categories, taskTypeIds, answers).isComplete;
}

/**
 * Count of "No" answers — the "N Issue Found" badge on the review step.
 *
 * "N/A" is not an issue: it means the question does not apply, which is a
 * legitimate answer rather than a failed check.
 */
export function issueCount(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly { questionId: string; answer: string }[],
): number {
  const byQuestion = answerMap(answers);
  return visibleQuestions(categories, taskTypeIds).filter(
    (question) => byQuestion.get(question.id) === 'No',
  ).length;
}

/**
 * Answers whose question is no longer visible, so a save can drop them.
 *
 * Deselecting a task type must not silently keep its answers in the record: the
 * checklist a reviewer reads has to match the one the developer was shown.
 */
export function orphanedAnswers<TEntry extends { questionId: string }>(
  categories: readonly ChecklistCategory[],
  taskTypeIds: readonly TaskTypeId[],
  answers: readonly TEntry[],
): TEntry[] {
  const visibleIds = new Set(
    visibleQuestions(categories, taskTypeIds).map((question) => question.id),
  );
  return answers.filter((entry) => !visibleIds.has(entry.questionId));
}
