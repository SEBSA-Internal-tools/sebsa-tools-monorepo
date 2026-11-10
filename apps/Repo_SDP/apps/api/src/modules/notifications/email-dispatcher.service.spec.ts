import { describe, expect, it, vi } from 'vitest';
import { MailError } from '../../integrations/mail/mailer.js';
import { MailTemplates } from '../../integrations/mail/templates/mail-templates.service.js';
import { testConfig } from '../../config/test-config.js';
import { EmailDispatcher, backoffMs } from './email-dispatcher.service.js';
import { TASK_EMAIL_EVENTS, buildTaskEmail, taskEmail } from './task-email.js';

const config = testConfig(
  { APP_BASE_URL: 'https://sdp.example.com', APP_TIMEZONE: 'Asia/Colombo' },
  { mail: { enabled: true } },
);
const templates = new MailTemplates(config as never);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    taskId: 'task-1',
    recipientId: 'dev-1',
    notificationType: 'TASK_ASSIGNED',
    createdAt: new Date(),
    payload: taskEmail('TASK_PICKED', 'Rae Viewer', {
      reviewerId: 'rev-1',
      reviewerName: 'Rae Viewer',
    }),
    task: {
      developerId: 'dev-1',
      taskCode: 'ACME-07',
      title: 'ACME-CRIM-1',
      customer: { name: 'Acme' },
    },
    recipient: {
      email: 'dev@example.com',
      fullName: 'Dev One',
      status: 'ACTIVE',
      deletedAt: null,
      userRoles: [{ role: { code: 'DEVELOPER' } }],
    },
    ...overrides,
  };
}

function harness(found: ReturnType<typeof row>, send = vi.fn().mockResolvedValue(undefined)) {
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ id: 'n-1', attempts: 1 }])
      .mockResolvedValue([]),
    notification: { findUnique: vi.fn().mockResolvedValue(found), update },
  };
  const dispatcher = new EmailDispatcher(prisma as never, { send }, templates, config as never);
  return { dispatcher, update, send, prisma };
}

describe('EmailDispatcher', () => {
  it('sends a queued task email and marks it SENT', async () => {
    const { dispatcher, update, send } = harness(row());
    await dispatcher.runOnce();

    const message = send.mock.calls[0]![0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(message.to).toBe('dev@example.com');
    expect(message.subject).toBe('ACME-07: picked up for review by Rae Viewer');
    expect(message.text).toMatch(
      /Reviewer Rae Viewer picked up your task ACME-07 \(Acme\) on .*\(GMT\+5:30\)\./,
    );
    expect(message.text).toContain('FOR YOUR INFORMATION');
    expect(message.html).toContain('For your information');
    expect(message.html).toContain('Need help?');
    expect(message.html).toContain('mailto:service.delivery@sebsaworld.com');
    expect(message.html).toContain(
      'This is an automated notification from the SEBSA Service Delivery Portal workflow. Please do not reply to this email.',
    );
    expect(message.html).not.toContain('Questions?');
    expect(message.text).toContain('https://sdp.example.com/crp/developer/tasks/task-1');
    expect(message.text).not.toMatch(/^By: /m);
    const links = [...message.html.matchAll(/<a href="(?!mailto:)([^"]+)"/g)].map(
      ([, href]) => href,
    );
    expect(links).toEqual(['https://sdp.example.com/crp/developer/tasks/task-1']);
    expect(message.html).not.toContain('If the button does not work');
    expect(message.html).toContain('src="https://sdp.example.com/logo/sebsa-logo-email.png"');
    expect(message.text).toMatch(/When: .*\(GMT\+5:30\)/);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailStatus: 'SENT', emailSent: true }),
      }),
    );
  });

  it('claims with SKIP LOCKED so two API instances never send the same row', async () => {
    const { dispatcher, prisma } = harness(row());
    await dispatcher.runOnce();
    const sql = (prisma.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('retries a retryable failure later, with growing back-off', async () => {
    const { dispatcher, update } = harness(
      row(),
      vi.fn().mockRejectedValue(new MailError('429', true)),
    );
    await dispatcher.runOnce();
    const data = (update.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data['emailStatus']).toBeUndefined();
    expect(data['emailNextAttemptAt']).toBeInstanceOf(Date);
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 960_000]);
  });

  it('fails a permanent error at once', async () => {
    const { dispatcher, update } = harness(
      row(),
      vi.fn().mockRejectedValue(new MailError('Brevo answered 400', false)),
    );
    await dispatcher.runOnce();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'FAILED' }) }),
    );
  });

  it.each([
    ['an inactive recipient', { recipient: { ...row().recipient, status: 'INACTIVE' } }],
    ['an unreadable payload', { payload: { event: 'NOPE' } }],
    ['a row older than a day', { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }],
  ])('skips %s without sending', async (_label, overrides) => {
    const { dispatcher, update, send } = harness(row(overrides));
    await dispatcher.runOnce();
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'SKIPPED' }) }),
    );
  });

  it('stays idle when email is disabled outside tests', () => {
    const idle = new EmailDispatcher(
      {} as never,
      {} as never,
      templates,
      testConfig({ NODE_ENV: 'development', EMAIL_ENABLED: 'false' }) as never,
    );
    expect(idle.active).toBe(false);
  });
});

describe('task email copy', () => {
  const context = {
    recipientName: 'Ana',
    task: { code: 'ACME-07', title: 'ACME-CRIM-1', customer: 'Acme' },
    link: 'https://sdp.example.com/x',
    when: '10 Oct 2026, 13:30 (GMT+5:30)',
  };

  it('tells admins who handed over a task and why', () => {
    const { subject, body } = buildTaskEmail(
      taskEmail('TASK_HANDED_OVER', 'Rae Viewer', { reason: 'On leave' }),
      { ...context, relation: 'admin' },
    );
    expect(subject).toBe('ACME-07: handed over by Rae Viewer');
    expect(body.details).toContainEqual(['Reason', 'On leave']);
    expect(body.details).toContainEqual(['When', context.when]);
  });

  it('tells the developer and the new reviewer about a reassignment in their own words', () => {
    const payload = taskEmail('HANDOVER_REASSIGNED', 'Ada Admin', {
      reviewerId: 'rev-2',
      reviewerName: 'Ravi',
      previousReviewerName: 'Rae Viewer',
    });
    expect(buildTaskEmail(payload, { ...context, relation: 'developer' }).subject).toBe(
      'ACME-07: Ravi is now your reviewer',
    );
    expect(buildTaskEmail(payload, { ...context, relation: 'reviewer' }).subject).toBe(
      'ACME-07: assigned to you for review',
    );
  });

  it('reports the round and the number of findings when changes are requested', () => {
    const { body } = buildTaskEmail(
      taskEmail('CHANGES_REQUESTED', 'Rae', { reviewerName: 'Rae', round: 2, findings: 3 }),
      { ...context, relation: 'developer' },
    );
    expect(body.details).toContainEqual(['Review cycle', '2']);
    expect(body.details).toContainEqual(['Findings', '3']);
  });

  it('lists the reviewer once when the reviewer is also the actor', () => {
    const { body } = buildTaskEmail(
      taskEmail('CHANGES_REQUESTED', 'Rae', { reviewerName: 'Rae', round: 1 }),
      { ...context, relation: 'developer' },
    );
    const labels = body.details?.map(([label]) => label);
    expect(labels).toContain('Reviewer');
    expect(labels).not.toContain('By');
  });

  it('shows previous and new reviewer only when the reviewer changed', () => {
    const changed = buildTaskEmail(
      taskEmail('REVIEWER_ASSIGNED', 'Ada Admin', {
        reviewerName: 'Ravi',
        previousReviewerName: 'Rae Viewer',
      }),
      { ...context, relation: 'developer' },
    ).body.details;
    expect(changed).toContainEqual(['Previous reviewer', 'Rae Viewer']);
    expect(changed).toContainEqual(['New reviewer', 'Ravi']);
    expect(changed).toContainEqual(['Assigned by', 'Ada Admin']);

    const first = buildTaskEmail(
      taskEmail('REVIEWER_ASSIGNED', 'Ada Admin', { reviewerName: 'Ravi' }),
      { ...context, relation: 'developer' },
    ).body.details;
    expect(first).toContainEqual(['Reviewer', 'Ravi']);
    expect(first?.map(([label]) => label)).not.toContain('Previous reviewer');
  });

  it('does not repeat the reviewer who handed a task over', () => {
    const { body } = buildTaskEmail(
      taskEmail('TASK_HANDED_OVER', 'Rae Viewer', {
        previousReviewerName: 'Rae Viewer',
        reason: 'On leave',
      }),
      { ...context, relation: 'admin' },
    );
    expect(body.details?.filter(([, value]) => value === 'Rae Viewer')).toEqual([
      ['Previous reviewer', 'Rae Viewer'],
    ]);
  });

  it('adds the rank, checklist issues and summary to a review decision', () => {
    const payload = taskEmail('CHANGES_REQUESTED', 'Rae', {
      reviewerName: 'Rae',
      rank: 2,
      summary: 'Fix the cursor',
      checklistIssues: [
        { section: 'General Check', question: 'Variables use %TYPE?', answer: 'NOT_OK' },
        { section: 'General Check', question: 'Forms follow AQS?', answer: 'PARTIALLY_OK' },
      ],
    });
    const { body } = buildTaskEmail(payload, { ...context, relation: 'developer' });
    expect(body.tone).toBe('warning');
    expect(body.callout).toMatchObject({
      tone: 'warning',
      title: expect.stringContaining('Rank 2'),
    });
    expect(body.tables).toEqual([
      {
        title: 'General Check Issues',
        columns: ['Status', 'Item'],
        rows: [
          { tone: 'danger', status: '❌ Not OK', item: 'Variables use %TYPE?' },
          { tone: 'warning', status: '⚠️ Partially OK', item: 'Forms follow AQS?' },
        ],
      },
    ]);
    expect(body.sections).toEqual([{ title: 'Reviewer Summary', text: 'Fix the cursor' }]);

    const html = templates.render('s', body).html;
    expect(html).toContain('Review Ranking: Rank 2');
    expect(html).toContain('Variables use %TYPE?');
  });

  it('keeps review details out of other events', () => {
    const { body } = buildTaskEmail(
      taskEmail('TASK_PICKED', 'Rae', { reviewerName: 'Rae', rank: 3 }),
      { ...context, relation: 'developer' },
    );
    expect(body.callout).toBeUndefined();
    expect(body.tables).toBeUndefined();
  });

  it('shows the review cycle callout on a resubmission', () => {
    const { body } = buildTaskEmail(
      taskEmail('TASK_RESUBMITTED', 'Dev', { developerName: 'Dev', round: 3, reviewerId: 'r' }),
      { ...context, relation: 'reviewer' },
    );
    expect(body.callout?.title).toBe('Review Cycle 3');
    expect(body.details).toContainEqual(['Developer', 'Dev']);
    expect(body.details?.map(([label]) => label)).not.toContain('By');
  });

  it('labels every event for every recipient and leaves no gaps in the copy', () => {
    const relations = ['developer', 'reviewer', 'admin'] as const;
    for (const event of TASK_EMAIL_EVENTS) {
      for (const relation of relations) {
        const { subject, body } = buildTaskEmail(
          taskEmail(event, 'Ada Admin', {
            reviewerName: 'Ravi',
            previousReviewerName: 'Rae',
            developerName: 'Dev',
            round: 2,
            findings: 1,
            reason: 'On leave',
          }),
          { ...context, relation },
        );
        expect(body.label, `${event}/${relation}`).toBeTruthy();
        const html = templates.render(subject, body).html;
        expect(`${subject}${html}`).not.toMatch(/undefined|null|NaN/);
        expect(html).not.toContain('If the button does not work');
      }
    }
  });

  it('asks the developer to act on a change request, naming reviewer, cycle and findings', () => {
    const { body } = buildTaskEmail(
      taskEmail('CHANGES_REQUESTED', 'Rae', { reviewerName: 'Rae', round: 2, findings: 3 }),
      { ...context, relation: 'developer' },
    );
    expect(body.label).toBe('Action required');
    expect(body.paragraphs[0]).toContain('Rae reviewed your task ACME-07 (Acme) in review cycle 2');
    expect(body.paragraphs[0]).toContain('with 3 findings');
  });
});

it('leaves queued delivery to the external scheduler without starting timers', async () => {
  const scheduled = new EmailDispatcher(
    { $queryRaw: vi.fn().mockResolvedValue([]) } as never,
    {} as never,
    templates,
    testConfig({}, { mail: { enabled: true, dispatchMode: 'scheduled' } }) as never,
  );
  const interval = vi.spyOn(globalThis, 'setInterval');
  const timeout = vi.spyOn(globalThis, 'setTimeout');
  try {
    scheduled.onModuleInit();
    scheduled.kick();
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    await scheduled.runOnce(1);
  } finally {
    await scheduled.onModuleDestroy();
    interval.mockRestore();
    timeout.mockRestore();
  }
});

it('bounds a background invocation even when the queue keeps returning a full batch', async () => {
  const { dispatcher, prisma } = harness(row());
  prisma.$queryRaw
    .mockReset()
    .mockResolvedValue(Array.from({ length: 20 }, () => ({ id: 'n-1', attempts: 1 })));
  await dispatcher.runOnce(2);
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
});
