import { beforeEach, describe, expect, it } from 'vitest';
import { nextTaskVersionSchema, taskListItemSchema, type TaskDraft } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { signInForTest } from '@/test/setup.ts';

const DEVELOPER = 'u-hiruni';

function preview(customerId: string, crimId: string) {
  return api.get('/task-identities/next-version', nextTaskVersionSchema, {
    searchParams: { customerId, crimId },
  });
}

function create(customerId: string, crimId: string, extra: Record<string, unknown> = {}) {
  const input = { customerId, crimId, priority: 'Medium', ...extra } as TaskDraft;
  return api.post('/tasks', taskListItemSchema, input);
}

beforeEach(() => {
  signInForTest(DEVELOPER);
});

describe('authoritative task version allocation', () => {
  it('starts a new customer/CRIM identity at zero and derives the title from customer code', async () => {
    await expect(preview('c-aim', 'AUTO-FIRST')).resolves.toEqual({
      version: 0,
      title: 'AIM-AUTO-FIRST-0',
    });
    const task = await create('c-aim', 'AUTO-FIRST');
    expect(task).toMatchObject({ version: '0', title: 'AIM-AUTO-FIRST-0' });
  });

  it('increments from all persisted tasks and does not reuse Draft versions', async () => {
    const first = await create('c-aim', 'AUTO-SEQUENCE');
    const second = await create('c-aim', 'AUTO-SEQUENCE');
    const third = await create('c-aim', 'AUTO-SEQUENCE');
    expect([first.version, second.version, third.version]).toEqual(['0', '1', '2']);
    await expect(preview('c-aim', 'AUTO-SEQUENCE')).resolves.toMatchObject({ version: 3 });
  });

  it('uses customerId as part of the identity key', async () => {
    await create('c-aim', 'SHARED-CRIM');
    expect((await create('c-semco', 'SHARED-CRIM')).version).toBe('0');
    expect((await create('c-aim', 'SHARED-CRIM')).version).toBe('1');
  });

  it('normalizes CRIM whitespace and case', async () => {
    await create('c-aim', '  Case-570  ');
    expect((await create('c-aim', 'case-570')).version).toBe('1');
  });

  it('ignores an arbitrary client version and title', async () => {
    const task = await create('c-aim', 'SERVER-AUTHORITY', {
      version: '999',
      title: 'spoofed',
    });
    expect(task.version).toBe('0');
    expect(task.title).toBe('AIM-SERVER-AUTHORITY-0');
  });

  it('allocates unique versions for concurrent creates', async () => {
    const tasks = await Promise.all([create('c-aim', 'CONCURRENT'), create('c-aim', 'CONCURRENT')]);
    expect(new Set(tasks.map((task) => task.version))).toEqual(new Set(['0', '1']));
  });

  it('does not interpret a legacy decimal release label as a sequence integer', async () => {
    await expect(preview('c-semco', 'CRIM-941')).resolves.toMatchObject({ version: 0 });
  });

  it('keeps identity and assigned version immutable after creation', async () => {
    const task = await create('c-aim', 'IMMUTABLE');
    await expect(
      api.patch(`/tasks/${task.id}`, taskListItemSchema, {
        customerId: 'c-semco',
        crimId: 'DIFFERENT',
        version: '500',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'IMMUTABLE_TASK_IDENTITY' });
    expect(task.version).toBe('0');
  });
});
