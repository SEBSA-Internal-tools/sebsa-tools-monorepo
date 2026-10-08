import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, findUser } from './db.ts';
import { DEMO_PASSWORD } from './handlers.ts';
import {
  devOutbox,
  MAX_FORGOT_REQUESTS,
  MAX_SET_PASSWORD_ATTEMPTS,
  RESEND_COOLDOWN_MS,
} from './passwordLinks.ts';

/**
 * The password-link contract, exercised over HTTP against the MSW handlers.
 *
 * This is the behaviour the NestJS endpoints must reproduce (see
 * docs/18-security.md, "Password links"). Each case is a property an attacker
 * would probe: reuse, expiry, enumeration, guessing, and acting on someone
 * else's invite.
 */

const GOOD = 'Zebra-Kettle-42!';
const ADMIN = 'u-qa-admin';
const SUPER_ADMIN = 'u-qa-superadmin';

async function post(path: string, body?: unknown, userId?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId !== undefined) headers['X-Mock-User-Id'] = userId;
  const response = await fetch(new URL(path, window.location.href), {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

const validate = (token: string) => post('/api/auth/token/validate', { token });
const setPassword = (token: string, newPassword = GOOD) =>
  post('/api/auth/set-password', { token, newPassword });
const signIn = (email: string, password: string) => post('/api/auth/login', { email, password });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Moves the server clock forward, past cooldowns, without fake timers (MSW's delay needs real ones). */
function advanceClock(ms: number) {
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + ms);
}

async function inviteUser(email: string, roles: string[] = ['Developer'], actor = ADMIN) {
  const reason = roles.includes('Admin') ? { reason: 'New team lead' } : {};
  const created = await post('/api/users', { name: 'Test Person', email, roles, ...reason }, actor);
  const message = devOutbox.findLast((m) => m.to === email.toLowerCase());
  return { created, token: message?.token };
}

describe('validate', () => {
  it('describes a valid link without consuming it, and masks the email', async () => {
    const first = await validate('demo-invite');
    expect(first).toMatchObject({
      status: 200,
      body: { status: 'valid', purpose: 'INVITE', emailHint: 'n***@sebsaworld.com' },
    });
    expect(await validate('demo-invite')).toMatchObject({ body: { status: 'valid' } });
  });

  it.each([
    ['demo-expired-invite', { status: 'expired', purpose: 'INVITE' }],
    ['demo-expired-reset', { status: 'expired', purpose: 'RESET' }],
    ['demo-used', { status: 'invalid' }],
    ['not-a-real-token', { status: 'invalid' }],
    ['', { status: 'invalid' }],
  ])('answers %j with %j', async (token, expected) => {
    expect((await validate(token)).body).toEqual(expected);
  });

  it('treats an oversized token as invalid rather than hashing it', async () => {
    expect((await validate('x'.repeat(10_000))).body).toEqual({ status: 'invalid' });
  });
});

describe('invite → set password → sign in', () => {
  it('creates an INVITED account that cannot sign in until a password is set', async () => {
    const { created, token } = await inviteUser('Test.Person@SebsaWorld.com');

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email: 'test.person@sebsaworld.com',
      status: 'INVITED',
      isActive: false,
      inviteEmailStatus: 'SENT',
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // No password exists yet, so not even the shared demo password works.
    expect((await signIn('test.person@sebsaworld.com', DEMO_PASSWORD)).status).toBe(401);

    expect(await setPassword(token!)).toMatchObject({ status: 200, body: { ok: true } });
    const user = db.users.find((u) => u.email === 'test.person@sebsaworld.com');
    expect(user).toMatchObject({ status: 'ACTIVE', isActive: true, inviteExpiresAt: null });

    expect((await signIn('test.person@sebsaworld.com', GOOD)).status).toBe(200);
  });

  it('works once: the same link is invalid after use', async () => {
    const { token } = await inviteUser('once@sebsaworld.com');
    await setPassword(token!);

    expect((await validate(token!)).body).toEqual({ status: 'invalid' });
    expect(await setPassword(token!, 'Another-Pass-99!')).toMatchObject({
      status: 400,
      body: { code: 'TOKEN_INVALID' },
    });
  });

  it('kills the older link when a newer one is sent', async () => {
    const { token: first } = await inviteUser('resent@sebsaworld.com');
    const user = db.users.find((u) => u.email === 'resent@sebsaworld.com')!;
    // The invite just went out, so an immediate resend waits for the cooldown.
    expect(
      (await post(`/api/users/${user.id}/resend-invite`, undefined, ADMIN)).body,
    ).toMatchObject({ code: 'RATE_LIMITED' });

    advanceClock(RESEND_COOLDOWN_MS + 1000);
    expect((await post(`/api/users/${user.id}/resend-invite`, undefined, ADMIN)).status).toBe(200);
    const second = devOutbox.findLast((m) => m.to === 'resent@sebsaworld.com')!.token;

    expect(second).not.toBe(first);
    expect((await validate(first!)).body).toEqual({ status: 'invalid' });
    expect((await validate(second)).body).toMatchObject({ status: 'valid' });
  });

  it('refuses to send email for a duplicate address', async () => {
    const { created } = await inviteUser('dheliya.kankanamge@sebsaworld.com');
    expect(created).toMatchObject({ status: 409, body: { code: 'EMAIL_TAKEN' } });
  });

  it('rejects a malformed email with the shared message', async () => {
    const { created } = await inviteUser('name@company');
    expect(created).toMatchObject({
      status: 422,
      body: { message: 'Enter a valid email address, for example name@company.com' },
    });
  });
});

describe('set password', () => {
  it('re-checks the policy on the server and names the failed rules', async () => {
    const result = await setPassword('demo-invite', 'short');
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      code: 'PASSWORD_POLICY',
      failedRules: expect.arrayContaining(['MIN_LENGTH', 'UPPERCASE', 'NUMBER', 'SPECIAL']),
    });
  });

  it.each(['Starter-Pass-42!', 'Password-2026!x'])(
    'rejects %j as personal or common',
    async (password) => {
      expect((await setPassword('demo-invite', password)).body).toMatchObject({
        code: 'PASSWORD_PERSONAL',
      });
    },
  );

  it(`locks the link after ${String(MAX_SET_PASSWORD_ATTEMPTS)} rejected passwords`, async () => {
    for (let i = 0; i < MAX_SET_PASSWORD_ATTEMPTS; i += 1) {
      expect((await setPassword('demo-invite', 'weak')).status).toBe(422);
    }
    expect(await setPassword('demo-invite', GOOD)).toMatchObject({
      status: 429,
      body: { code: 'RATE_LIMITED' },
    });
  });

  it('refuses an expired link', async () => {
    expect(await setPassword('demo-expired-invite')).toMatchObject({
      status: 410,
      body: { code: 'TOKEN_EXPIRED' },
    });
  });

  it('replaces the demo password once a reset link is used', async () => {
    const email = 'dheliya.kankanamge@sebsaworld.com';
    expect((await setPassword('demo-reset')).status).toBe(200);

    expect((await signIn(email, DEMO_PASSWORD)).status).toBe(401);
    expect((await signIn(email, GOOD)).status).toBe(200);
  });
});

describe('forgot password', () => {
  it('answers 202 for an unknown address and sends nothing', async () => {
    const result = await post('/api/auth/forgot-password', { email: 'nobody@nowhere.example' });
    expect(result).toEqual({ status: 202, body: null });
    expect(devOutbox).toHaveLength(0);
  });

  it('answers the same 202 for a real address, and emails a reset link', async () => {
    const result = await post('/api/auth/forgot-password', {
      email: '  Dheliya.Kankanamge@sebsaworld.com ',
    });
    expect(result).toEqual({ status: 202, body: null });
    expect(devOutbox.at(-1)).toMatchObject({
      to: 'dheliya.kankanamge@sebsaworld.com',
      purpose: 'RESET',
    });
    expect((await validate(devOutbox.at(-1)!.token)).body).toMatchObject({ purpose: 'RESET' });
  });

  it('sends a still-invited user their invite again, not a reset', async () => {
    await post('/api/auth/forgot-password', { email: 'new.starter@sebsaworld.com' });
    expect(devOutbox.at(-1)).toMatchObject({ purpose: 'INVITE' });
  });

  it('sends nothing to a deactivated account', async () => {
    await post('/api/auth/forgot-password', { email: 'nimal.perera@sebsaworld.com' });
    expect(devOutbox).toHaveLength(0);
  });

  it('rate-limits per address, for real and unknown addresses alike', async () => {
    for (const email of ['dheliya.kankanamge@sebsaworld.com', 'nobody@nowhere.example']) {
      for (let i = 0; i < MAX_FORGOT_REQUESTS; i += 1) {
        expect((await post('/api/auth/forgot-password', { email })).status).toBe(202);
      }
      expect((await post('/api/auth/forgot-password', { email })).body).toMatchObject({
        code: 'RATE_LIMITED',
      });
    }
  });
});

describe('resend link', () => {
  it('turns an expired link into a fresh one, then enforces a cooldown', async () => {
    expect(await post('/api/auth/resend-link', { token: 'demo-expired-invite' })).toEqual({
      status: 202,
      body: null,
    });
    const fresh = devOutbox.at(-1)!;
    expect(fresh).toMatchObject({ to: 'new.starter@sebsaworld.com', purpose: 'INVITE' });
    expect((await validate(fresh.token)).body).toMatchObject({ status: 'valid' });

    expect(
      (await post('/api/auth/resend-link', { token: 'demo-expired-invite' })).body,
    ).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('answers 202 for an unknown or used token and sends nothing', async () => {
    for (const token of ['not-a-real-token', 'demo-used']) {
      expect((await post('/api/auth/resend-link', { token })).status).toBe(202);
    }
    expect(devOutbox).toHaveLength(0);
  });
});

describe('admin invite actions', () => {
  it('revokes an invite: the link dies, the account goes, and it is audited', async () => {
    const { token } = await inviteUser('revoked@sebsaworld.com');
    const user = db.users.find((u) => u.email === 'revoked@sebsaworld.com')!;

    expect((await post(`/api/users/${user.id}/revoke-invite`, undefined, ADMIN)).status).toBe(204);
    expect(findUser(user.id)).toBeUndefined();
    expect((await validate(token!)).body).toEqual({ status: 'invalid' });
    expect(db.auditEvents.at(-1)).toMatchObject({ action: 'InviteRevoked', targetId: user.id });
  });

  it('refuses invite actions on a user who is not invited', async () => {
    expect(await post('/api/users/u-dheliya/resend-invite', undefined, ADMIN)).toMatchObject({
      status: 409,
      body: { code: 'NOT_INVITED' },
    });
  });

  it('refuses to activate an invited user directly', async () => {
    await inviteUser('pending@sebsaworld.com');
    const user = db.users.find((u) => u.email === 'pending@sebsaworld.com')!;
    const response = await fetch(new URL(`/api/users/${user.id}`, window.location.href), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Mock-User-Id': ADMIN },
      body: JSON.stringify({ isActive: true }),
    });
    expect(response.status).toBe(409);
  });

  it('keeps a privileged invite out of a normal Admin’s reach', async () => {
    await inviteUser('new.admin@sebsaworld.com', ['Admin'], SUPER_ADMIN);
    const user = db.users.find((u) => u.email === 'new.admin@sebsaworld.com')!;

    expect(await post(`/api/users/${user.id}/revoke-invite`, undefined, ADMIN)).toMatchObject({
      status: 403,
      body: { code: 'PRIVILEGED_ROLE_REQUIRED' },
    });
  });

  it('needs a signed-in admin', async () => {
    const { token: _token } = await inviteUser('anon@sebsaworld.com');
    const user = db.users.find((u) => u.email === 'anon@sebsaworld.com')!;
    expect((await post(`/api/users/${user.id}/resend-invite`)).status).toBe(401);
    expect((await post(`/api/users/${user.id}/resend-invite`, undefined, 'u-dheliya')).status).toBe(
      403,
    );
  });
});
