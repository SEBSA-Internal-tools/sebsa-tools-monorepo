import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderEmail, type EmailBody, type EmailContent } from './layout.js';

function durationText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes % 60 !== 0) return `${String(minutes)} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

@Injectable()
export class MailTemplates {
  constructor(private readonly config: ConfigService) {}

  get timeZone(): string {
    return this.config.getOrThrow<string>('appTimezone');
  }

  get appName(): string {
    return this.config.getOrThrow<string>('appName');
  }

  /** e.g. "10 Oct 2026, 14:35 (GMT+5:30)" in APP_TIMEZONE. */
  formatDateTime(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} (${get('timeZoneName')})`;
  }

  appUrl(path: string): string {
    const base = this.config.getOrThrow<string>('appBaseUrl');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  setPasswordUrl(token: string): string {
    return this.appUrl(`/set-password#token=${encodeURIComponent(token)}`);
  }

  get adminContactEmail(): string {
    return this.config.getOrThrow<string>('mail.adminContactEmail');
  }

  render(subject: string, body: EmailBody, sentAt: Date = new Date()): EmailContent {
    return renderEmail(subject, body, {
      appName: this.appName,
      helpEmail: this.adminContactEmail,
      sentAt: this.formatDateTime(sentAt),
      logoUrl: this.appUrl('/logo/sebsa-logo-email.png'),
    });
  }

  private expiry(input: { expiresAt: Date; issuedAt: Date }) {
    return {
      lifetime: durationText(input.expiresAt.getTime() - input.issuedAt.getTime()),
      expiresAt: this.formatDateTime(input.expiresAt),
    };
  }

  userInvite(input: {
    name: string;
    token: string;
    expiresAt: Date;
    issuedAt: Date;
  }): EmailContent {
    const expiry = this.expiry(input);
    return this.render(
      `You have been invited to the ${this.appName}`,
      {
        tone: 'brand',
        label: 'Account invitation',
        heading: 'Set Up Your Account',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          `An administrator has created your ${this.appName} account. Choose a password to activate it and sign in.`,
        ],
        action: { label: 'Create your password', url: this.setPasswordUrl(input.token) },
        expiry,
        notes: [
          `If you are unable to activate your account within ${expiry.lifetime}, please send an email to ${this.adminContactEmail} to request a new activation email from the system administrator.`,
          'This is a one time link. If you were not expecting this invitation, you can safely ignore this email.',
        ],
      },
      input.issuedAt,
    );
  }

  passwordReset(input: {
    name: string;
    token: string;
    expiresAt: Date;
    issuedAt: Date;
  }): EmailContent {
    return this.render(
      `Reset your ${this.appName} password`,
      {
        tone: 'brand',
        label: 'Password reset',
        heading: 'Reset Your Password',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          `A password reset was requested for your ${this.appName} account. Use the button below to choose a new password.`,
        ],
        action: { label: 'Choose a new password', url: this.setPasswordUrl(input.token) },
        expiry: this.expiry(input),
        notes: [
          'This is a one time link. If the link expires, request a new password reset from the sign-in page.',
          'If you did not ask for this, you can safely ignore this email — your password stays the same.',
        ],
      },
      input.issuedAt,
    );
  }

  passwordChanged(input: { name: string; at: Date; firstPassword: boolean }): EmailContent {
    return this.render(
      input.firstPassword ? 'Your account is ready' : 'Your password was changed',
      {
        tone: input.firstPassword ? 'success' : 'warning',
        label: input.firstPassword ? 'Account activated' : 'Security notice',
        heading: input.firstPassword ? 'Your Account Is Ready' : 'Your Password Was Changed',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          input.firstPassword
            ? `Your password was set and your ${this.appName} account is now active.`
            : `The password for your ${this.appName} account was changed, and every signed-in session was signed out.`,
        ],
        details: [['When', this.formatDateTime(input.at)]],
        action: { label: 'Sign in', url: this.appUrl('/login') },
        notes: [
          'If you did not make this change, contact the administrator straight away using the details below.',
        ],
      },
      input.at,
    );
  }

  emailChangedNotice(input: {
    name: string;
    newEmailMasked: string;
    at: Date;
    actorName: string;
  }): EmailContent {
    return this.render(
      'The email address on your account was changed',
      {
        tone: 'warning',
        label: 'Security notice',
        heading: 'Your Sign-In Email Was Changed',
        greeting: `Hello ${input.name},`,
        paragraphs: [
          `${input.actorName} changed the email address for your ${this.appName} account. This address will no longer receive account emails.`,
        ],
        details: [
          ['New address', input.newEmailMasked],
          ['Changed by', input.actorName],
          ['When', this.formatDateTime(input.at)],
        ],
        notes: [
          'If you did not expect this change, contact the administrator straight away using the details below.',
        ],
      },
      input.at,
    );
  }

  accessChanged(input: {
    name: string;
    at: Date;
    actorName: string;
    summary: string;
    reason?: string | null | undefined;
  }): EmailContent {
    const details: (readonly [string, string])[] = [
      ['Change', input.summary],
      ['Changed by', input.actorName],
      ['When', this.formatDateTime(input.at)],
    ];
    if (input.reason) details.push(['Reason', input.reason]);
    return this.render(
      `Your access to the ${this.appName} changed`,
      {
        tone: 'warning',
        label: 'Account update',
        heading: 'Your Access Changed',
        greeting: `Hello ${input.name},`,
        paragraphs: [`An administrator changed your access to the ${this.appName}.`],
        details,
        notes: ['If you think this is a mistake, contact the administrator using the details below.'],
      },
      input.at,
    );
  }
}
