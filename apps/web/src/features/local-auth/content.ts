/**
 * Every string the local-auth screens show, in one file so the copy can be read
 * and changed without opening a component.
 */

export const TIPS = [
  'Use 12 or more characters',
  'Mix upper and lower case, numbers and symbols',
  'Do not reuse a password from another site',
] as const;

/**
 * This screen only ever sets a first password: accounts are created by an admin
 * and the invite link lands here. There is no separate "reset" wording.
 */
export const setPasswordCopy = {
  title: 'Create your password',
  leftHeading: 'Welcome to the Service Delivery Portal',
  leftText: 'Your administrator has set up your account. Choose a password to activate it.',
  button: 'Save password',
  successTitle: 'Password saved',
} as const;

export const setPassword = {
  checkingTitle: 'Checking your link',
  checkingText: 'One moment while we check your link.',
  expiryNote: 'This link works once and expires on {expiresAt}.',
  newPassword: 'New password',
  confirmPassword: 'Confirm password',
  show: 'Show password',
  hide: 'Hide password',
  rulesHeading: 'Password requirements',
  strength: 'Password strength',
  maxReached: 'Passwords can be up to 128 characters.',
  successText: 'Taking you to sign in...',
  successAction: 'Go to sign in',
  validateFailed: "We couldn't check your link. Check your connection and try again.",
  retry: 'Try again',
  errors: {
    PASSWORD_POLICY: "Your password doesn't meet all the rules yet.",
    PASSWORD_PERSONAL:
      "Choose a password that doesn't include your name or email, and isn't a common one.",
    RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
    GENERIC: "We couldn't save your password. Check your connection and try again.",
  },
} as const;

export const forgot = {
  title: 'Forgot your password?',
  leftHeading: 'Reset it in three steps',
  steps: ['Verify your email', 'Open the link we send you', 'Choose a new password'],
  subtitle: 'Enter your work email and we will send you a link to choose a new password.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@sebsaworld.com',
  submit: 'Verify email',
  submitting: 'Verifying…',
  back: 'Back to sign in',
  emailRequired: 'Enter your email address',
  emailInvalid: 'Enter a valid email address, for example name@company.com',
  emailTooLong: 'Email must be 254 characters or fewer',
  sentTitle: 'Check your inbox',
  sentText:
    'If this email belongs to an SDP account, we have sent a link. It is valid for 60 minutes. Check your spam folder too.',
  differentEmail: 'Use a different email',
  sendAgain: 'Send again',
  sendAgainIn: 'Send again in {seconds}s',
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  failed: "We couldn't send that request. Check your connection and try again.",
} as const;

export const expired = {
  title: 'Link expired',
  leftHeading: 'Links expire to keep your account safe',
  leftText: 'Each link works once, and only the newest email counts.',
  badgeExpired: 'Link expired',
  badgeInvalid: 'Link unavailable',
  expiredTitle: 'This link has expired',
  expiredText:
    'For your security, this link was only valid for {duration}. We can send you a new one.',
  durationInvite: '24 hours',
  durationReset: '60 minutes',
  invalidTitle: "This link can't be used",
  invalidText:
    'It may have been used already, or replaced by a newer email. Sign in, or request a new password link.',
  send: 'Send me a new link',
  sending: 'Sending…',
  sentAgainIn: 'Send again in {seconds}s',
  sent: 'A new link is on its way to your inbox. It can take a minute to arrive.',
  failed: "We couldn't send a new link. Check your connection and try again.",
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  requestNew: 'Request a new link',
  back: 'Back to sign in',
  goToSignIn: 'Go to sign in',
  forgot: 'Forgot password',
} as const;

export const invite = {
  addTitle: 'Add user',
  addSubtitle: 'We will email them a link to create their password.',
  email: 'Email',
  emailPlaceholder: 'name@company.com',
  fullName: 'Full name (optional)',
  role: 'Role',
  submit: 'Save and send invite',
  submitting: 'Sending invite…',
  emailInvalid: 'Enter a valid email address, for example name@company.com',
  roleRequired: 'Choose a role',
  sent: 'Invite sent to {email}. Valid for 24 hours.',
  sentButEmailFailed: 'User saved, but the email could not be sent. Use Resend invite.',
  resent: 'Invite sent again to {email}. Valid for 24 hours.',
  resentEmailFailed:
    'The invite is renewed, but the email could not be sent. Try Resend invite again.',
  revoked: 'Invite for {email} revoked.',
  generic: "We couldn't complete that. Please try again.",
  errors: {
    EMAIL_EXISTS: 'A user with this email already exists',
    INVITE_PENDING: 'This user was already invited. Use Resend invite.',
    EMAIL_UNDELIVERABLE: "This email domain can't receive mail. Check the spelling.",
    EMAIL_INVALID: 'Enter a valid email address, for example name@company.com',
    ROLE_INVALID: 'Choose a role this account can assign.',
    FORBIDDEN: "You don't have permission to add users.",
  } as Record<string, string>,
  columns: { invite: 'Invite' },
  status: { INVITED: 'Invited', ACTIVE: 'Active', DEACTIVATED: 'Deactivated' },
  expiresIn: 'Expires in {hours} h',
  expiresInUnderHour: 'Expires in under 1 h',
  expiredPill: 'Expired',
  emailFailed: 'Email failed',
  resendAction: 'Resend invite for {name}',
  revokeAction: 'Revoke invite for {name}',
  revokeTitle: 'Revoke this invite?',
  revokeText:
    "{name} won't be able to use the link they were sent. You can invite them again later.",
  revokeConfirm: 'Revoke invite',
  notInvited: 'This user is no longer in the invited state.',
  rateLimited: 'Please wait a moment before resending.',
} as const;
