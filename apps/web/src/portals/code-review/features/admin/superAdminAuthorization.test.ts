import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { systemAuditEventSchema, taskListItemSchema, userSchema } from '@sdp/contracts';
import { api } from '@/lib/apiClient.ts';
import { db, findUser } from '@/mocks/db.ts';
import { signInForTest } from '@/test/setup.ts';

const NORMAL_ADMIN = 'u-qa-admin';
const SUPER_ADMIN = 'u-qa-superadmin';

describe('Super Admin authorization', () => {
  beforeEach(() => {
    signInForTest(NORMAL_ADMIN);
  });

  it.each([
    ['Developer', ['Developer'] as const],
    ['Reviewer', ['Reviewer'] as const],
  ])('allows a normal Admin to create a %s account', async (_label, roles) => {
    const created = await api.post('/users', userSchema, {
      name: `QA ${roles[0]}`,
      email: `qa.created.${roles[0].toLowerCase()}@sebsaworld.com`,
      roles: [...roles],
    });
    expect(created.roles).toEqual([...roles]);
  });

  it('prevents a normal Admin from assigning Admin or Super Admin', async () => {
    await expect(
      api.post('/users', userSchema, {
        name: 'Escalated User',
        email: 'qa.escalated@sebsaworld.com',
        roles: ['Admin'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      api.patch('/users/u-dheliya', userSchema, {
        roles: ['Developer', 'Admin'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      api.patch(`/users/${NORMAL_ADMIN}`, userSchema, {
        roles: ['Super Admin'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows Super Admin to create Admin users without assigning Super Admin directly', async () => {
    signInForTest(SUPER_ADMIN);
    const created = await api.post('/users', userSchema, {
      name: 'QA Admin Target',
      email: 'qa.admin.target@sebsaworld.com',
      roles: ['Admin'],
    });
    expect(created.roles).toEqual(['Admin']);

    await expect(
      api.post('/users', userSchema, {
        name: 'Direct Super Admin',
        email: 'qa.direct.super@sebsaworld.com',
        roles: ['Super Admin'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('transfers the exclusive Super Admin role only to an existing Admin', async () => {
    signInForTest(SUPER_ADMIN);
    const previous = findUser(SUPER_ADMIN)!;
    const target = findUser('u-janith')!;
    const transferred = await api.post(
      `/users/${target.id}/roles/transfer-super-admin`,
      userSchema,
    );
    expect(transferred.roles).toEqual(['Super Admin']);
    expect(target.roles).toEqual(['Super Admin']);
    expect(previous.roles).toEqual(['Admin']);
    expect(db.users.filter((user) => user.roles.includes('Super Admin'))).toHaveLength(1);
  });

  it('rejects transfer to a user who is not already an Admin', async () => {
    signInForTest(SUPER_ADMIN);
    await expect(
      api.post('/users/u-dheliya/roles/transfer-super-admin', userSchema),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('soft-deletes users only as Super Admin and hides them from normal lists', async () => {
    const target = findUser('u-nimal')!;
    await expect(api.delete(`/users/${target.id}`, z.unknown())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    signInForTest(SUPER_ADMIN);
    await api.delete(`/users/${target.id}`, z.unknown());
    expect(findUser(target.id)).toBe(target);
    expect(target.isActive).toBe(false);
    expect(db.deletedUserIds.has(target.id)).toBe(true);
    const visible = await api.get('/users', z.array(userSchema));
    expect(visible.some((user) => user.id === target.id)).toBe(false);
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

  it('does not give Reviewer behavior to Super Admin', async () => {
    signInForTest(SUPER_ADMIN);
    const available = db.tasks.find(
      (task) =>
        task.reviewerId === null && (task.status === 'Submitted' || task.status === 'ReSubmitted'),
    )!;
    await expect(api.post(`/tasks/${available.id}/pick`, taskListItemSchema)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
  });
});
