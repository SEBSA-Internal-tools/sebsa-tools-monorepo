import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';
import { postPublic } from './http.ts';
import {
  createInviteResponseSchema,
  LocalAuthError,
  okSchema,
  resendInviteResponseSchema,
  validateResultSchema,
  type CreateInviteInput,
  type CreateInviteResponse,
  type Invite,
  type ValidateResult,
} from './types.ts';

/**
 * The only module the screens use to reach the backend. One function per
 * endpoint in the shared contract, so connecting the real API means changing
 * nothing outside this folder.
 *
 * With `VITE_API_MOCK=true` (dev builds only) each function is answered by
 * `mockAdapter.ts` instead of the network.
 */

/**
 * Serve every endpoint below from `mockAdapter.ts` instead of the network.
 *
 * Defined HERE, not in config.ts, and gated on `DEV`: the bundler can only drop
 * the mock chunk from a production build if it sees this constant fold to
 * `false` in the same module as the dynamic imports.
 */
const isLocalAuthMock = import.meta.env.DEV && import.meta.env['VITE_API_MOCK'] === 'true';

/* --------------------------------- public --------------------------------- */

/** Never consumes the token. */
export async function validateToken(token: string): Promise<ValidateResult> {
  if (isLocalAuthMock) return (await import('./mockAdapter.ts')).validateToken(token);
  const payload = await postPublic('/token/validate', { token });
  const parsed = validateResultSchema.safeParse(payload);
  if (!parsed.success) throw new LocalAuthError('SERVER');
  return parsed.data;
}

/** Throws `LocalAuthError` — TOKEN_*, PASSWORD_*, RATE_LIMITED, NETWORK or SERVER. */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  if (isLocalAuthMock) {
    await (await import('./mockAdapter.ts')).setPassword(token, newPassword);
    return;
  }
  const parsed = okSchema.safeParse(await postPublic('/set-password', { token, newPassword }));
  if (!parsed.success) throw new LocalAuthError('SERVER');
}

/** Always 202 for any token; only a rate limit or a transport failure throws. */
export async function resendLink(token: string): Promise<void> {
  if (isLocalAuthMock) {
    await (await import('./mockAdapter.ts')).resendLink(token);
    return;
  }
  await postPublic('/resend-link', { token });
}

/** Always 202 for any email; only a rate limit or a transport failure throws. */
export async function forgotPassword(email: string): Promise<void> {
  if (isLocalAuthMock) {
    await (await import('./mockAdapter.ts')).forgotPassword(email);
    return;
  }
  await postPublic('/forgot-password', { email });
}

/* ------------------------------ signed-in admin --------------------------- */
/* These ride the shared client: it already attaches the caller's session. */

export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResponse> {
  if (isLocalAuthMock) return (await import('./mockAdapter.ts')).createInvite(input);
  return api.post('/admin/users', createInviteResponseSchema, input);
}

export async function resendInvite(userId: string): Promise<Invite> {
  if (isLocalAuthMock) return (await import('./mockAdapter.ts')).resendInvite(userId);
  const { invite } = await api.post(
    `/admin/users/${encodeURIComponent(userId)}/resend-invite`,
    resendInviteResponseSchema,
  );
  return invite;
}

export async function revokeInvite(userId: string): Promise<void> {
  if (isLocalAuthMock) {
    await (await import('./mockAdapter.ts')).revokeInvite(userId);
    return;
  }
  await api.post(`/admin/users/${encodeURIComponent(userId)}/revoke-invite`, z.undefined());
}
