import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';
import { postPublic } from './http.ts';
import {
  LocalAuthError,
  okSchema,
  resendInviteResponseSchema,
  validateResultSchema,
  type Invite,
  type ValidateResult,
} from './types.ts';

/**
 * The only module the screens use to reach the backend. One function per
 * endpoint in the shared contract, so connecting the real API means changing
 * nothing outside this folder.
 *
 * In development these requests are answered by MSW (`mocks/passwordLinks.ts`),
 * like every other endpoint; a production build sends them to NestJS.
 */

/* --------------------------------- public --------------------------------- */

/** Never consumes the token. */
export async function validateToken(token: string): Promise<ValidateResult> {
  const payload = await postPublic('/token/validate', { token });
  const parsed = validateResultSchema.safeParse(payload);
  if (!parsed.success) throw new LocalAuthError('SERVER');
  return parsed.data;
}

/** Throws `LocalAuthError` — TOKEN_*, PASSWORD_*, RATE_LIMITED, NETWORK or SERVER. */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  const parsed = okSchema.safeParse(await postPublic('/set-password', { token, newPassword }));
  if (!parsed.success) throw new LocalAuthError('SERVER');
}

/** Always 202 for any token; only a rate limit or a transport failure throws. */
export async function resendLink(token: string): Promise<void> {
  await postPublic('/resend-link', { token });
}

/** Always 202 for any email; only a rate limit or a transport failure throws. */
export async function forgotPassword(email: string): Promise<void> {
  await postPublic('/forgot-password', { email });
}

/* ------------------------------ signed-in admin --------------------------- */
/* These ride the shared client: it already attaches the caller's session.
   Creating the user is the ordinary `POST /users`, which also sends the invite. */

export async function resendInvite(userId: string): Promise<Invite> {
  const { invite } = await api.post(
    `/users/${encodeURIComponent(userId)}/resend-invite`,
    resendInviteResponseSchema,
  );
  return invite;
}

export async function revokeInvite(userId: string): Promise<void> {
  await api.post(`/users/${encodeURIComponent(userId)}/revoke-invite`, z.undefined());
}
