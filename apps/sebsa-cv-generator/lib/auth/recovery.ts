/** Browser-session marker set only after /auth/callback accepts a password-recovery link. */
export const RECOVERY_SESSION_STORAGE_KEY = 'sebsa-password-recovery-user';

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  'If an account exists for that email address, a password reset link has been sent.';

export const INVALID_RECOVERY_LINK_MESSAGE =
  'This password reset link is invalid, expired, or has already been used. Request a new link and try again.';

interface RecoveryUserResult {
  data: { user: { id: string } | null };
  error: unknown;
}

interface RecoveryUpdateResult {
  data: { user: { id: string } | null };
  error: unknown;
}

export interface RecoveryAuthClient {
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string }
  ): Promise<{ error: unknown }>;
  getUser(): Promise<RecoveryUserResult>;
  updateUser(attributes: { password: string }): Promise<RecoveryUpdateResult>;
}

/** Always resolves to the same public response to avoid revealing whether an account exists. */
export async function requestPasswordReset(
  auth: Pick<RecoveryAuthClient, 'resetPasswordForEmail'>,
  email: string,
  redirectTo: string
): Promise<string> {
  try {
    await auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  } catch {
    // Network/provider failures must not turn this endpoint into an account-existence oracle.
  }
  return PASSWORD_RESET_REQUESTED_MESSAGE;
}

export async function verifyRecoveryUser(
  auth: Pick<RecoveryAuthClient, 'getUser'>,
  expectedUserId: string | null
): Promise<boolean> {
  if (!expectedUserId) return false;
  const { data, error } = await auth.getUser();
  return !error && data.user?.id === expectedUserId;
}

export type RecoveryPasswordUpdateResult =
  | { status: 'success' }
  | { status: 'invalid-session' }
  | { status: 'error'; error: unknown };

export async function updateRecoveryPassword(
  auth: Pick<RecoveryAuthClient, 'getUser' | 'updateUser'>,
  expectedUserId: string | null,
  password: string
): Promise<RecoveryPasswordUpdateResult> {
  if (!(await verifyRecoveryUser(auth, expectedUserId))) return { status: 'invalid-session' };

  const { data, error } = await auth.updateUser({ password });
  if (!error && data.user) return { status: 'success' };

  // Distinguish an expired session from a provider/password-policy error while keeping the latter
  // available for the existing readableAuthError presentation layer.
  if (!(await verifyRecoveryUser(auth, expectedUserId))) return { status: 'invalid-session' };
  return { status: 'error', error };
}

