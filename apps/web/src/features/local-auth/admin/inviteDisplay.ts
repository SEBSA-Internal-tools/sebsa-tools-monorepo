import type { User } from '@sdp/contracts';
import { invite as copy } from '../content.ts';
import { interpolate } from '@/lib/formatters.ts';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'DEACTIVATED';

/** The row's status; falls back to `isActive` for a backend that does not send one. */
export function userStatus(user: Pick<User, 'status' | 'isActive'>): UserStatus {
  return user.status ?? (user.isActive ? 'ACTIVE' : 'DEACTIVATED');
}

export interface InviteDisplay {
  text: string;
  tone: 'neutral' | 'warning';
}

/**
 * What the Invite column says for a row, or null when the row is not invited.
 * Expired wins over a failed email — a resend fixes both, and "Expired" is the
 * more urgent fact — and a failed email on a live invite shows as a warning.
 */
export function describeInvite(
  user: Pick<User, 'status' | 'isActive' | 'inviteExpiresAt' | 'inviteEmailStatus'>,
  now: number = Date.now(),
): InviteDisplay | null {
  if (userStatus(user) !== 'INVITED') return null;

  const expiresAt =
    user.inviteExpiresAt === null || user.inviteExpiresAt === undefined
      ? Number.NaN
      : Date.parse(user.inviteExpiresAt);
  const remainingMs = expiresAt - now;

  if (!Number.isNaN(expiresAt) && remainingMs <= 0) {
    return { text: copy.expiredPill, tone: 'warning' };
  }
  if (user.inviteEmailStatus === 'FAILED') return { text: copy.emailFailed, tone: 'warning' };
  if (Number.isNaN(expiresAt)) return null;

  const hours = Math.floor(remainingMs / 3_600_000);
  return {
    text: hours < 1 ? copy.expiresInUnderHour : interpolate(copy.expiresIn, { hours }),
    tone: 'neutral',
  };
}

/** Trimmed and lowercased, as it is validated and sent. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/;

/** Returns the message to show, or undefined when the address is acceptable. */
export function validateInviteEmail(raw: string): string | undefined {
  const email = normaliseEmail(raw);
  if (email === '' || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return copy.emailInvalid;
  }
  return undefined;
}
