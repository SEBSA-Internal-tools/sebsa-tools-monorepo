import { delay, http, HttpResponse, type HttpHandler } from 'msw';
import type { User } from '@sdp/contracts';
import { db, findUser } from './db.ts';
import { INVITE_VALID_HOURS, RESET_VALID_MINUTES } from '@/features/local-auth/config.ts';
import { RULE_CODES, evaluatePassword } from '@/features/local-auth/domain/passwordRules.ts';

/**
 * One-time password links — the Phase 1 stand-in for the NestJS endpoints behind
 * the temporary local sign-in (invite, set password, forgot password).
 *
 * Written as the specification the real backend must meet, so the behaviour
 * here is deliberate rather than convenient:
 *
 *  - A token is 32 random bytes and only its SHA-256 hash is stored. Whoever
 *    reads the store (a DB dump, a log) cannot use a link.
 *  - A link works once, expires (invite 24 h, reset 60 min), and issuing a new
 *    link for the same purpose kills the older ones. Setting a password kills
 *    every link the user still holds.
 *  - Nothing a guest can call says whether an email has an account:
 *    forgot-password and resend-link answer 202 whatever happens.
 *  - Guessing is rate-limited per token, per email and per resend.
 *
 * Email sending belongs to NestJS. Here a "dev outbox" logs each link to the
 * browser console so a developer can follow it, and `devOutbox` lets tests do
 * the same. Everything in this file is held in memory only — a set password is
 * never written to localStorage — so a reload forgets it; use "Forgot password"
 * to get a fresh link for that account.
 *
 * Fixed QA links, rebuilt on every page load (the demo invitee is put back to
 * INVITED each time):
 *
 *   /set-password#token=demo-invite          valid invite   new.starter@sebsaworld.com
 *   /set-password#token=demo-expired-invite  expired invite (resend issues a new one)
 *   /set-password#token=demo-reset           valid reset    dheliya.kankanamge@sebsaworld.com
 *   /set-password#token=demo-expired-reset   expired reset
 *   /set-password#token=demo-used            already used
 */

export type LinkPurpose = 'INVITE' | 'RESET';

interface StoredLink {
  userId: string;
  purpose: LinkPurpose;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
  failedAttempts: number;
}

export interface OutboxMessage {
  to: string;
  purpose: LinkPurpose;
  token: string;
  url: string;
}

const LATENCY_MS = 120;
const INVITE_TTL_MS = INVITE_VALID_HOURS * 3_600_000;
const RESET_TTL_MS = RESET_VALID_MINUTES * 60_000;
/** Wrong passwords tolerated on one link before it answers 429. */
export const MAX_SET_PASSWORD_ATTEMPTS = 5;
/** Forgot-password requests per email per window. */
export const MAX_FORGOT_REQUESTS = 3;
const FORGOT_WINDOW_MS = 15 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;

/** Keyed by SHA-256(token), never by the token. */
const links = new Map<string, StoredLink>();
/** Passwords set through a link. Takes precedence over the demo password. */
const passwords = new Map<string, string>();
const forgotRequests = new Map<string, number[]>();
const lastIssued = new Map<string, number>();
let seeded: Promise<void> | null = null;

/** Every link "emailed" since the last reset, newest last. */
export const devOutbox: OutboxMessage[] = [];

/** Forgets every link, password and counter. Called between tests. */
export function resetPasswordLinks(): void {
  links.clear();
  passwords.clear();
  forgotRequests.clear();
  lastIssued.clear();
  devOutbox.length = 0;
  seeded = null;
}

/** The password set through a link, or undefined if the user never set one. */
export function passwordFor(userId: string): string | undefined {
  return passwords.get(userId);
}

/* --------------------------------------------------------------- tokens */

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function setPasswordUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/set-password#token=${token}`;
}

/* ----------------------------------------------------------------- users */

type AccountState = 'INVITED' | 'ACTIVE' | 'DEACTIVATED';

function accountState(user: User): AccountState {
  return user.status ?? (user.isActive ? 'ACTIVE' : 'DEACTIVATED');
}

/** A link is only good while its account is still in the state it was issued for. */
function isEligible(user: User, purpose: LinkPurpose): boolean {
  return accountState(user) === (purpose === 'INVITE' ? 'INVITED' : 'ACTIVE');
}

/** "j***@company.com" — enough to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/* ---------------------------------------------------------------- issuing */

/**
 * Creates a link for `user`, revokes their older links for the same purpose and
 * "emails" it. For an invite, also stamps the user row the Users tab reads.
 */
export async function issueLink(
  user: User,
  purpose: LinkPurpose,
): Promise<{ token: string; expiresAt: string }> {
  const now = Date.now();
  for (const link of links.values()) {
    if (link.userId === user.id && link.purpose === purpose && link.revokedAt === null) {
      link.revokedAt = now;
    }
  }

  const token = newToken();
  const expiresAt = now + (purpose === 'INVITE' ? INVITE_TTL_MS : RESET_TTL_MS);
  links.set(await hashToken(token), {
    userId: user.id,
    purpose,
    expiresAt,
    usedAt: null,
    revokedAt: null,
    failedAttempts: 0,
  });
  lastIssued.set(`${user.id}:${purpose}`, now);

  const iso = new Date(expiresAt).toISOString();
  if (purpose === 'INVITE') {
    user.inviteExpiresAt = iso;
    user.inviteEmailStatus = 'SENT';
  }

  const message: OutboxMessage = { to: user.email, purpose, token, url: setPasswordUrl(token) };
  devOutbox.push(message);
  if (import.meta.env.MODE !== 'test') {
    // eslint-disable-next-line no-console -- the dev outbox IS console output; it stands in for email.
    console.info(
      `[dev outbox] ${purpose === 'INVITE' ? 'Invite' : 'Password reset'} for ${user.email}: ${message.url}`,
    );
  }
  return { token, expiresAt: iso };
}

/** Kills every live link a user holds — on password set and on revoke. */
export function revokeLinksFor(userId: string): void {
  const now = Date.now();
  for (const link of links.values()) {
    if (link.userId === userId && link.revokedAt === null && link.usedAt === null) {
      link.revokedAt = now;
    }
  }
}

/** Seconds a user must wait before another link of this purpose, or 0. */
export function resendWaitSeconds(userId: string, purpose: LinkPurpose): number {
  const last = lastIssued.get(`${userId}:${purpose}`);
  if (last === undefined) return 0;
  return Math.max(0, Math.ceil((last + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

/* ------------------------------------------------------------- demo seed */

const DEMO_INVITEE: User = {
  id: 'u-demo-invitee',
  name: 'New Starter',
  email: 'new.starter@sebsaworld.com',
  roles: ['Developer'],
  isActive: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  status: 'INVITED',
  inviteExpiresAt: null,
  inviteEmailStatus: 'SENT',
};
const DEMO_RESET_USER_ID = 'u-dheliya';

async function seedDemoLinks(): Promise<void> {
  const now = Date.now();
  let invitee = findUser(DEMO_INVITEE.id);
  if (invitee === undefined) {
    invitee = { ...DEMO_INVITEE, roles: [...DEMO_INVITEE.roles] };
    db.users.push(invitee);
  }
  Object.assign(invitee, {
    isActive: false,
    status: 'INVITED',
    inviteExpiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    inviteEmailStatus: 'SENT',
  });

  const fixtures: [string, string, LinkPurpose, number, number | null][] = [
    ['demo-invite', DEMO_INVITEE.id, 'INVITE', now + INVITE_TTL_MS, null],
    ['demo-expired-invite', DEMO_INVITEE.id, 'INVITE', now - 60_000, null],
    ['demo-reset', DEMO_RESET_USER_ID, 'RESET', now + RESET_TTL_MS, null],
    ['demo-expired-reset', DEMO_RESET_USER_ID, 'RESET', now - 60_000, null],
    ['demo-used', DEMO_RESET_USER_ID, 'RESET', now + RESET_TTL_MS, now - 60_000],
  ];
  for (const [token, userId, purpose, expiresAt, usedAt] of fixtures) {
    links.set(await hashToken(token), {
      userId,
      purpose,
      expiresAt,
      usedAt,
      revokedAt: null,
      failedAttempts: 0,
    });
  }
}

/** Seeds once per page load (or per test, after `resetPasswordLinks`). */
function ensureSeeded(): Promise<void> {
  seeded ??= seedDemoLinks();
  return seeded;
}

/* ------------------------------------------------------------ resolution */

type Resolved =
  | { state: 'valid'; link: StoredLink; user: User }
  | { state: 'expired'; link: StoredLink; user: User }
  | { state: 'invalid' };

async function resolveToken(token: unknown): Promise<Resolved> {
  // Real tokens are 43 characters; the cap stops hashing arbitrary payloads.
  if (typeof token !== 'string' || token === '' || token.length > 256) return { state: 'invalid' };
  const link = links.get(await hashToken(token));
  if (link?.usedAt !== null || link.revokedAt !== null) {
    return { state: 'invalid' };
  }
  const user = findUser(link.userId);
  if (user === undefined || !isEligible(user, link.purpose)) return { state: 'invalid' };
  return { state: Date.now() >= link.expiresAt ? 'expired' : 'valid', link, user };
}

/** The error body `features/local-auth/api/http.ts` parses. */
function authError(status: number, code: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ code, message: code, ...extra }, { status });
}

/** 202 with no body: the answer that reveals nothing. */
function accepted() {
  return new HttpResponse(null, { status: 202 });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Short, very common choices the policy rules alone would let through. */
const COMMON_PASSWORDS = ['password', 'qwerty', 'letmein', 'welcome', 'admin', '123456', 'sebsa'];

/** Contains the user's name or email, or a well-known password. */
function isPersonal(password: string, user: User): boolean {
  const lower = password.toLowerCase();
  const local = user.email.split('@')[0]?.toLowerCase() ?? '';
  const parts = [
    ...local.split(/[^a-z0-9]+/),
    ...user.name.toLowerCase().split(/\s+/),
    ...COMMON_PASSWORDS,
  ].filter((part) => part.length >= 3);
  return parts.some((part) => lower.includes(part));
}

/* -------------------------------------------------------------- handlers */

/**
 * The four public endpoints. No caller identity is read: these are reached
 * before anyone is signed in, and the token is the only credential.
 */
export const passwordLinkHandlers: HttpHandler[] = [
  /** Never consumes the token. */
  http.post('/api/auth/token/validate', async ({ request }) => {
    await delay(LATENCY_MS);
    await ensureSeeded();
    const resolved = await resolveToken((await readBody(request))['token']);

    if (resolved.state === 'invalid') return HttpResponse.json({ status: 'invalid' });
    if (resolved.state === 'expired') {
      return HttpResponse.json({ status: 'expired', purpose: resolved.link.purpose });
    }
    return HttpResponse.json({
      status: 'valid',
      purpose: resolved.link.purpose,
      emailHint: maskEmail(resolved.user.email),
      expiresAt: new Date(resolved.link.expiresAt).toISOString(),
    });
  }),

  http.post('/api/auth/set-password', async ({ request }) => {
    await delay(LATENCY_MS);
    await ensureSeeded();
    const body = await readBody(request);
    const resolved = await resolveToken(body['token']);
    const newPassword = body['newPassword'];

    if (resolved.state === 'invalid') return authError(400, 'TOKEN_INVALID');
    if (resolved.state === 'expired') return authError(410, 'TOKEN_EXPIRED');
    const { link, user } = resolved;

    if (link.failedAttempts >= MAX_SET_PASSWORD_ATTEMPTS) return authError(429, 'RATE_LIMITED');
    if (typeof newPassword !== 'string')
      return authError(422, 'PASSWORD_POLICY', { failedRules: [] });

    // The server re-checks the policy; the browser's checklist is a convenience.
    const results = evaluatePassword(newPassword);
    const failedRules = RULE_CODES.filter((code) => !results[code]);
    if (failedRules.length > 0) {
      link.failedAttempts += 1;
      return authError(422, 'PASSWORD_POLICY', { failedRules });
    }
    if (isPersonal(newPassword, user)) {
      link.failedAttempts += 1;
      return authError(422, 'PASSWORD_PERSONAL');
    }

    link.usedAt = Date.now();
    revokeLinksFor(user.id);
    passwords.set(user.id, newPassword);
    user.status = 'ACTIVE';
    user.isActive = true;
    user.inviteExpiresAt = null;
    user.inviteEmailStatus = null;
    // NestJS must also end every existing session for this user here.
    return HttpResponse.json({ ok: true });
  }),

  /**
   * Always 202. A live account gets a reset link; an account still waiting on
   * its invite gets the invite again, since that is the link it can use.
   */
  http.post('/api/auth/forgot-password', async ({ request }) => {
    await delay(LATENCY_MS);
    await ensureSeeded();
    const raw = (await readBody(request))['email'];
    if (typeof raw !== 'string' || raw.length > 254) return accepted();
    const email = raw.trim().toLowerCase();

    // Counted per address whether or not it has an account, so the limit
    // itself cannot be used to tell the two apart.
    const now = Date.now();
    const recent = (forgotRequests.get(email) ?? []).filter((at) => now - at < FORGOT_WINDOW_MS);
    if (recent.length >= MAX_FORGOT_REQUESTS) return authError(429, 'RATE_LIMITED');
    forgotRequests.set(email, [...recent, now]);

    const user = db.users.find((u) => u.email.toLowerCase() === email);
    if (user !== undefined) {
      const state = accountState(user);
      if (state === 'ACTIVE') await issueLink(user, 'RESET');
      else if (state === 'INVITED') await issueLink(user, 'INVITE');
    }
    return accepted();
  }),

  /**
   * From the link-expired screen. Always 202; a token that was genuinely
   * issued (even if expired) gets a fresh link of the same kind.
   */
  http.post('/api/auth/resend-link', async ({ request }) => {
    await delay(LATENCY_MS);
    await ensureSeeded();
    const token = (await readBody(request))['token'];
    if (typeof token !== 'string' || token === '' || token.length > 256) return accepted();

    const link = links.get(await hashToken(token));
    if (link?.usedAt !== null) return accepted();
    const user = findUser(link.userId);
    if (user === undefined || !isEligible(user, link.purpose)) return accepted();

    if (resendWaitSeconds(user.id, link.purpose) > 0) return authError(429, 'RATE_LIMITED');
    await issueLink(user, link.purpose);
    return accepted();
  }),
];
