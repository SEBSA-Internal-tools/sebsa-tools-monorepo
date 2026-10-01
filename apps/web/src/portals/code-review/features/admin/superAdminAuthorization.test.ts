import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  customerSchema,
  systemAuditEventSchema,
  taskListItemSchema,
  userSchema,
} from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { db } from '@/mocks/db.ts';
import { signInForTest } from '@/test/setup.ts';

const NORMAL_ADMIN = 'u-qa-admin';
const SUPER_ADMIN = 'u-qa-superadmin';
const SUPER_REVIEWER = 'u-qa-superreviewer';

describe('Super Admin authorization', () => {
  beforeEach(() => {
    signInForTest(NORMAL_ADMIN);
  });

  it.each([
    ['Developer', ['Developer'] as const],
    ['Reviewer', ['Reviewer'] as const],
  ])('allows a normal Admin to create a %s account', async (_label, roles) => {
    const suffix = roles[0].toLowerCase();
    const created = await api.post('/users', userSchema, {
      name: `QA ${roles[0]}`,
      email: `qa.created.${suffix}@sebsaworld.com`,
      roles: [...roles],
    });

    expect(created.roles).toEqual([...roles]);
  });

  it.each([['Admin'], ['Admin', 'SuperAdmin']] as const)(
    'rejects a crafted normal-Admin create request with roles %j',
    async (...roles) => {
      await expect(
        api.post('/users', userSchema, {
          name: 'Escalated User',
          email: `qa.escalated.${roles.length}@sebsaworld.com`,
          roles,
          reason: 'Crafted request',
        }),
      ).rejects.toMatchObject({ code: 'PRIVILEGED_ROLE_REQUIRED' });
    },
  );

  it('rejects a normal Admin granting Admin or SuperAdmin through update', async () => {
    for (const roles of [
      ['Developer', 'Admin'],
      ['Developer', 'Admin', 'SuperAdmin'],
    ] as const) {
      await expect(
        api.patch('/users/u-dheliya', userSchema, { roles, reason: 'Escalate' }),
      ).rejects.toMatchObject({ code: 'PRIVILEGED_ROLE_REQUIRED' });
    }
  });

  it('prevents a normal Admin from self-promoting', async () => {
    await expect(
      api.patch(`/users/${NORMAL_ADMIN}`, userSchema, {
        roles: ['Admin', 'SuperAdmin'],
        reason: 'Self promotion',
      }),
    ).rejects.toMatchObject({ code: 'PRIVILEGED_ROLE_REQUIRED' });
  });

  it('prevents a normal Admin from deactivating a privileged user', async () => {
    await expect(
      api.patch(`/users/${SUPER_ADMIN}`, userSchema, { isActive: false }),
    ).rejects.toMatchObject({ code: 'PRIVILEGED_ROLE_REQUIRED' });
  });

  it('lets a Super Admin create Admin and manage privileged role membership', async () => {
    signInForTest(SUPER_ADMIN);
    const created = await api.post('/users', userSchema, {
      name: 'QA Privileged Target',
      email: 'qa.privileged.target@sebsaworld.com',
      roles: ['Admin'],
      reason: 'Cover the operations rota',
    });
    expect(created.roles).toEqual(['Admin']);

    const promoted = await api.patch(`/users/${created.id}`, userSchema, {
      roles: ['Admin', 'SuperAdmin'],
      reason: 'Assign governance duty',
    });
    expect(promoted.roles).toEqual(['Admin', 'SuperAdmin']);

    const superRevoked = await api.patch(`/users/${created.id}`, userSchema, {
      roles: ['Admin'],
      reason: 'Governance rotation ended',
    });
    expect(superRevoked.roles).toEqual(['Admin']);

    const adminRevoked = await api.patch(`/users/${created.id}`, userSchema, {
      roles: ['Developer'],
      reason: 'Return to delivery role',
    });
    expect(adminRevoked.roles).toEqual(['Developer']);
  });

  it('protects a Super Admin from removing their own access or deactivating themselves', async () => {
    signInForTest(SUPER_ADMIN);
    await expect(
      api.patch(`/users/${SUPER_ADMIN}`, userSchema, {
        roles: ['Admin'],
        reason: 'Self demotion',
      }),
    ).rejects.toMatchObject({ code: 'SELF_LOCKOUT' });

    await expect(
      api.patch(`/users/${SUPER_ADMIN}`, userSchema, {
        isActive: false,
        reason: 'Self deactivation',
      }),
    ).rejects.toMatchObject({ code: 'SELF_LOCKOUT' });
  });

  it('preserves the last active Super Admin', async () => {
    db.users.find((user) => user.id === SUPER_REVIEWER)!.isActive = false;
    signInForTest(SUPER_ADMIN);

    await expect(
      api.patch(`/users/${SUPER_ADMIN}`, userSchema, {
        roles: ['Admin'],
        reason: 'Remove the final owner',
      }),
    ).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });
    await expect(
      api.patch(`/users/${SUPER_ADMIN}`, userSchema, {
        isActive: false,
        reason: 'Disable the final owner',
      }),
    ).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });

    await expect(
      api.delete(`/users/${SUPER_ADMIN}`, z.unknown(), { body: { reason: 'Remove final owner' } }),
    ).rejects.toMatchObject({ code: 'SELF_DELETE' });
  });

  it('requires reasons for privileged grants and status changes and audits successful changes', async () => {
    signInForTest(SUPER_ADMIN);
    await expect(
      api.post('/users', userSchema, {
        name: 'Reasonless Admin',
        email: 'qa.reasonless.admin@sebsaworld.com',
        roles: ['Admin'],
      }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });

    await expect(
      api.patch(`/users/${SUPER_REVIEWER}`, userSchema, { isActive: false }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });

    await api.patch(`/users/${SUPER_REVIEWER}`, userSchema, {
      isActive: false,
      reason: 'Suspend privileged access for audit verification',
    });
    expect(db.auditEvents.at(-1)).toMatchObject({
      action: 'PrivilegedUserDeactivated',
      actorId: SUPER_ADMIN,
      targetId: SUPER_REVIEWER,
      reason: 'Suspend privileged access for audit verification',
    });
  });

  it('rejects stale sessions immediately after a privileged account is deactivated', async () => {
    signInForTest(SUPER_ADMIN);
    await api.patch(`/users/${SUPER_REVIEWER}`, userSchema, {
      isActive: false,
      reason: 'Temporary access suspension',
    });

    signInForTest(SUPER_REVIEWER);
    await expect(api.get('/users', z.array(userSchema))).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    });
  });

  it('restricts permanent deletion to Super Admin and records the action', async () => {
    const target = db.users.find((user) => user.id === 'u-nimal')!;
    await expect(
      api.delete(`/users/${target.id}`, z.unknown(), { body: { reason: 'Remove test account' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    signInForTest(SUPER_ADMIN);
    await api.delete(`/users/${target.id}`, z.unknown(), {
      body: { reason: 'Remove unused QA account' },
    });
    expect(db.users.some((user) => user.id === target.id)).toBe(false);
    expect(db.auditEvents.at(-1)).toMatchObject({
      action: 'UserDeleted',
      actorId: SUPER_ADMIN,
      targetId: target.id,
      reason: 'Remove unused QA account',
    });
  });

  it('requires and audits reasons for eligible task and customer deletion', async () => {
    signInForTest(SUPER_ADMIN);
    const task = db.tasks.find(
      (candidate) =>
        (candidate.status === 'Draft' || candidate.status === 'Cancelled') &&
        !db.handovers.some((handover) => handover.taskId === candidate.id),
    )!;

    await expect(api.delete(`/tasks/${task.id}`, z.unknown())).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
    await api.delete(`/tasks/${task.id}`, z.unknown(), {
      body: { reason: 'Remove obsolete test task' },
    });
    expect(db.auditEvents.at(-1)).toMatchObject({
      action: 'TaskDeleted',
      targetId: task.id,
      reason: 'Remove obsolete test task',
    });

    const customer = await api.post('/customers', customerSchema, {
      name: 'Deletion Audit Customer',
      description: 'Temporary customer',
      color: '#6b7591',
    });
    await expect(api.delete(`/customers/${customer.id}`, z.unknown())).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    });
    await api.delete(`/customers/${customer.id}`, z.unknown(), {
      body: { reason: 'Remove temporary customer' },
    });
    expect(db.auditEvents.at(-1)).toMatchObject({
      action: 'CustomerDeleted',
      targetId: customer.id,
      reason: 'Remove temporary customer',
    });
  });

  it('restricts the system audit trail to Super Admin', async () => {
    await expect(
      api.get('/system-audit-events', z.array(systemAuditEventSchema)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    signInForTest(SUPER_ADMIN);
    await expect(api.get('/system-audit-events', z.array(systemAuditEventSchema))).resolves.toEqual(
      [],
    );
  });

  it('does not give Reviewer behavior to SuperAdmin', async () => {
    signInForTest(SUPER_ADMIN);
    const available = db.tasks.find(
      (task) =>
        task.reviewerId === null && (task.status === 'Submitted' || task.status === 'ReSubmitted'),
    )!;
    await expect(api.post(`/tasks/${available.id}/pick`, taskListItemSchema)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
  });

  it('keeps self-review protection for explicitly multi-role privileged users', async () => {
    const ownTask = db.tasks.find(
      (task) =>
        task.developerId === 'u-charith' &&
        task.reviewerId === null &&
        (task.status === 'Submitted' || task.status === 'ReSubmitted'),
    );
    expect(ownTask).toBeDefined();
    signInForTest('u-charith');
    await expect(api.post(`/tasks/${ownTask!.id}/pick`, taskListItemSchema)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
