import { ApiError } from '@/lib/apiClient.ts';
import { INVITE_VALID_HOURS, RESET_VALID_MINUTES } from '../config.ts';
import { RULE_CODES, evaluatePassword, type RuleCode } from '../domain/passwordRules.ts';
import {
  LocalAuthError,
  type CreateInviteInput,
  type CreateInviteResponse,
  type Invite,
  type LinkPurpose,
  type ValidateResult,
} from './types.ts';

/**
 * In-memory stand-in for the auth endpoints. Loaded only when `isLocalAuthMock`
 * is true, which needs a dev build AND `VITE_API_MOCK=true`.
 *
 * Tokens:
 *   mock-invite          valid INVITE link        mock-expired        expired INVITE link
 *   mock-reset           valid RESET link         mock-expired-reset  expired RESET link
 *   mock-used            already used (invalid)   anything else       invalid
 *
 * Passwords that trigger a server answer (after the policy check passes):
 *   contains "password" or "sebsa"  -> PASSWORD_PERSONAL
 *   contains "ratelimit"            -> RATE_LIMITED
 *   contains "servererror"          -> SERVER (5xx)
 * Forgot-password: an email containing "ratelimit" -> RATE_LIMITED; "offline" -> NETWORK.
 * Resend-link: a token containing "ratelimit" -> RATE_LIMITED.
 * Add user: see `createInvite`.
 *
 * A saved link is spent until the page reloads, as the real one would be.
 */

const LATENCY_MS = 450;
const wait = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

const spent = new Set<string>();

function validLink(purpose: LinkPurpose, expiresAt: number): ValidateResult {
  return {
    status: 'valid',
    purpose,
    emailHint: 'j***@company.com',
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function describeToken(token: string): ValidateResult {
  if (spent.has(token)) return { status: 'invalid' };
  const now = Date.now();
  switch (token) {
    case 'mock-invite':
      return validLink('INVITE', now + INVITE_VALID_HOURS * 3_600_000);
    case 'mock-reset':
      return validLink('RESET', now + RESET_VALID_MINUTES * 60_000);
    case 'mock-expired':
      return { status: 'expired', purpose: 'INVITE' };
    case 'mock-expired-reset':
      return { status: 'expired', purpose: 'RESET' };
    default:
      return { status: 'invalid' };
  }
}

export async function validateToken(token: string): Promise<ValidateResult> {
  await wait();
  return describeToken(token);
}

export async function setPassword(token: string, newPassword: string): Promise<void> {
  await wait();
  const state = describeToken(token);
  if (state.status === 'expired') throw new LocalAuthError('TOKEN_EXPIRED');
  if (state.status === 'invalid') throw new LocalAuthError('TOKEN_INVALID');

  const results = evaluatePassword(newPassword);
  const failed: RuleCode[] = RULE_CODES.filter((code) => !results[code]);
  if (failed.length > 0) throw new LocalAuthError('PASSWORD_POLICY', failed);

  const lower = newPassword.toLowerCase();
  if (lower.includes('password') || lower.includes('sebsa')) {
    throw new LocalAuthError('PASSWORD_PERSONAL');
  }
  if (lower.includes('ratelimit')) throw new LocalAuthError('RATE_LIMITED');
  if (lower.includes('servererror')) throw new LocalAuthError('SERVER');

  spent.add(token);
}

export async function resendLink(token: string): Promise<void> {
  await wait();
  if (token.includes('ratelimit')) throw new LocalAuthError('RATE_LIMITED');
}

export async function forgotPassword(email: string): Promise<void> {
  await wait();
  const lower = email.toLowerCase();
  if (lower.includes('offline')) throw new LocalAuthError('NETWORK');
  if (lower.includes('ratelimit')) throw new LocalAuthError('RATE_LIMITED');
}

/* ---------------------------------- admin --------------------------------- */

function apiError(statusCode: number, code: string): ApiError {
  return new ApiError({ statusCode, code, message: code });
}

/**
 * Add user. Special emails (the part before the @):
 *   exists  -> EMAIL_EXISTS         pending -> INVITE_PENDING
 *   nomail  -> EMAIL_UNDELIVERABLE  bad     -> EMAIL_INVALID
 *   fail    -> saved, but emailStatus FAILED
 */
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
  await wait();
  const local = input.email.split('@')[0] ?? '';
  if (local === 'exists') throw apiError(409, 'EMAIL_EXISTS');
  if (local === 'pending') throw apiError(409, 'INVITE_PENDING');
  if (local === 'nomail') throw apiError(422, 'EMAIL_UNDELIVERABLE');
  if (local === 'bad') throw apiError(422, 'EMAIL_INVALID');

  return {
    user: {
      id: `mock-${local}`,
      email: input.email,
      fullName: input.fullName ?? null,
      roleId: input.roleId,
      status: 'INVITED',
    },
    invite: {
      expiresAt: new Date(Date.now() + INVITE_VALID_HOURS * 3_600_000).toISOString(),
      emailStatus: local === 'fail' ? 'FAILED' : 'SENT',
    },
  };
}

export async function resendInvite(_userId: string): Promise<Invite> {
  await wait();
  return {
    expiresAt: new Date(Date.now() + INVITE_VALID_HOURS * 3_600_000).toISOString(),
    emailStatus: 'SENT',
  };
}

export async function revokeInvite(_userId: string): Promise<void> {
  await wait();
}
