// Until Microsoft SSO fully replaces it (docs/sso-microsoft.md), self-signup is restricted to real
// SEBSA work emails in firstname.lastname@sebsaworld.com form: it keeps the employee directory
// consistent and prevents junk/duplicate accounts. Shared by the signup page (instant feedback)
// and the server action (the check that actually counts).
export const SEBSA_WORK_EMAIL = /^[a-z]+\.[a-z]+@sebsaworld\.com$/i;

export function isSebsaWorkEmail(email: string): boolean {
  return SEBSA_WORK_EMAIL.test(email.trim());
}

export const SIGNUP_EMAIL_MESSAGE = 'Please use your SEBSA work email, in firstname.lastname@sebsaworld.com format.';

/** Shown for every signup that passes validation, whether or not the address already had an account. */
export const SIGNUP_SUBMITTED_NOTE = 'If this address can be registered, a confirmation link has been sent.';

export const SIGNUP_FAILED_MESSAGE =
  'We could not create your account right now. Please try again in a few minutes, or contact an administrator.';

export const SIGNUP_EMAIL_FAILED_MESSAGE =
  'We could not send the confirmation email, so your account was not created. Please try again, or contact an administrator.';

export const SIGNUP_THROTTLED_MESSAGE = 'Too many attempts. Please wait a while before trying again.';
