import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChecklistSubmission } from '@sdp/contracts';
import { ChecklistHistory } from '@/portals/code-review/components/ChecklistHistory.tsx';
import { renderWithProviders } from '@tests/support/renderWithProviders.tsx';

const submissionV1: ChecklistSubmission = {
  id: '00000000-0000-4000-8000-000000000001',
  taskId: '00000000-0000-4000-8000-000000000010',
  version: 1,
  submittedAt: '2026-10-13T10:00:00.000Z',
  developerId: '00000000-0000-4000-8000-000000000020',
  taskTypes: [{ id: '1', name: 'Customization' }],
  categories: [
    {
      categoryId: 'cat-1',
      categoryName: 'Unit Testing',
      categoryOrder: 1,
      questions: [
        {
          questionId: 'q-1',
          questionText: 'Have you tested according to functional specification?',
          questionOrder: 1,
          answer: 'Yes',
        },
        {
          questionId: 'q-2',
          questionText: 'Have you tested as end-user, not App owner (IFSAPP)?',
          questionOrder: 2,
          answer: 'No',
        },
      ],
    },
    {
      categoryId: 'cat-2',
      categoryName: 'Completion',
      categoryOrder: 2,
      questions: [
        {
          questionId: 'q-3',
          questionText: 'Is your CRIM object tested and approved by a functional consultant?',
          questionOrder: 1,
          answer: 'Yes',
        },
      ],
    },
  ],
  remarks: 'Initial checklist remarks',
};

const historicalSubmissionV2: ChecklistSubmission = {
  ...submissionV1,
  id: '00000000-0000-4000-8000-000000000002',
  version: 2,
  submittedAt: '2026-10-13T11:00:00.000Z',
  remarks: 'Duplicate snapshot v2',
};

const historicalSubmissionV3: ChecklistSubmission = {
  ...submissionV1,
  id: '00000000-0000-4000-8000-000000000003',
  version: 3,
  submittedAt: '2026-10-13T12:00:00.000Z',
  remarks: 'Duplicate snapshot v3',
};

describe('ChecklistHistory presentation', () => {
  it('renders Developer Quality Checklist directly without version selector', () => {
    renderWithProviders(
      <ChecklistHistory submissions={[submissionV1]} fallback={null} />,
    );

    // No dropdown or version selector
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Checklist History/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current review submission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Version 1/i)).not.toBeInTheDocument();

    // Renders questions and category headers directly
    expect(screen.getByText('Unit Testing')).toBeInTheDocument();
    expect(
      screen.getByText('Have you tested according to functional specification?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Have you tested as end-user, not App owner (IFSAPP)?'),
    ).toBeInTheDocument();
  });

  it('safely handles historical task with multiple old snapshots by rendering one canonical checklist', () => {
    renderWithProviders(
      <ChecklistHistory
        submissions={[submissionV1, historicalSubmissionV2, historicalSubmissionV3]}
        fallback={null}
      />,
    );

    // No version selector even with multiple historical snapshots
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Version 2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Version 3/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current review submission/i)).not.toBeInTheDocument();

    // Answers are displayed
    expect(screen.getByText('Unit Testing')).toBeInTheDocument();
    expect(screen.getByText('Completion')).toBeInTheDocument();
  });

  it('displays answer counts, checks met, and allows filtering by Needs Attention', async () => {
    const user = userEvent.setup({ delay: null });

    renderWithProviders(
      <ChecklistHistory submissions={[submissionV1]} fallback={null} />,
    );

    expect(screen.getByText(/3 \/ 3 Answered/i)).toBeInTheDocument();
    expect(screen.getByText(/2 Checks Met/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1 needs? attention/i).length).toBeGreaterThanOrEqual(1);

    // Filter buttons
    const allBtn = screen.getByRole('button', { name: /^All Questions/i });
    const needsAttentionBtn = screen.getByRole('button', { name: /^Needs Attention/i });
    expect(allBtn).toBeInTheDocument();
    expect(needsAttentionBtn).toBeInTheDocument();

    // Before filter: both categories visible
    expect(screen.getByText('Unit Testing')).toBeInTheDocument();
    expect(screen.getByText('Completion')).toBeInTheDocument();

    // Filter to Needs Attention only
    await user.click(needsAttentionBtn);

    // Unit Testing has the "No" answer, Completion has none
    expect(screen.getByText('Unit Testing')).toBeInTheDocument();
    expect(screen.queryByText('Completion')).not.toBeInTheDocument();

    // Switch back to all questions
    await user.click(allBtn);
    expect(screen.getByText('Completion')).toBeInTheDocument();
  });
});
