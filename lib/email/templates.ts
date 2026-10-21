import { env } from '@/lib/env';
import type { EmailContent } from '@/lib/email/sendEmail';

type EmailTone = 'action' | 'success' | 'welcome';

interface BrandedEmailInput {
  preheader: string;
  eyebrow: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  detailLabel?: string;
  detailValue?: string;
  ctaLabel: string;
  ctaUrl: string;
  note?: string;
  highlights?: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  support?: {
    message: string;
    email: string;
    afterEmail?: string;
  };
  nextSteps?: {
    heading: string;
    items: string[];
  };
  tone: EmailTone;
}

const brandName = 'SEBSA CV Generator';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function appUrl(path: string): string {
  return new URL(path, `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/`).toString();
}

function renderBrandedEmail(input: BrandedEmailInput): string {
  const accent = input.tone === 'success' ? '#16805B' : input.tone === 'action' ? '#C35C12' : '#7650E1';
  const safeUrl = escapeHtml(input.ctaUrl);
  const logoUrl = escapeHtml(appUrl('/images/seb-logo-1.png'));
  const greeting = input.greeting
    ? `<p style="margin:0 0 18px;color:#20212B;font-size:16px;line-height:1.55;font-weight:600;">${escapeHtml(input.greeting)}</p>`
    : '';
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#505264;font-size:15px;line-height:1.7;">${escapeHtml(paragraph)}</p>`
    )
    .join('');
  const detail = input.detailLabel && input.detailValue
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 22px;border-collapse:separate;background:#F7F5FC;border:1px solid #E8E2F5;border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <div style="color:#77798B;font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(input.detailLabel)}</div>
          <div style="color:#272838;font-size:15px;font-weight:700;line-height:1.45;">${escapeHtml(input.detailValue)}</div>
        </td></tr>
      </table>`
    : '';
  const highlights = input.highlights?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 22px;border-collapse:separate;background:#FFF8F2;border:1px solid #F1D3BB;border-radius:10px;">
        ${input.highlights
          .map(
            (highlight, index) => `<tr><td style="padding:15px 16px;${index > 0 ? 'border-top:1px solid #F1D3BB;' : ''}">
          <div style="color:#9A450E;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(highlight.label)}</div>
          <div style="color:#20212B;font-size:16px;font-weight:800;line-height:1.4;">${escapeHtml(highlight.value)}</div>
          ${highlight.description ? `<div style="margin-top:3px;color:#686A78;font-size:13px;line-height:1.55;">${escapeHtml(highlight.description)}</div>` : ''}
        </td></tr>`
          )
          .join('')}
      </table>`
    : '';
  const support = input.support
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;border-collapse:separate;background:#F7F5FC;border:1px solid #E8E2F5;border-radius:10px;">
        <tr><td style="padding:15px 16px;color:#505264;font-size:13px;line-height:1.65;">
          ${escapeHtml(input.support.message)}
          <a href="mailto:${escapeHtml(input.support.email)}" style="color:#4E1C90;text-decoration:underline;font-weight:800;word-break:break-word;">${escapeHtml(input.support.email)}</a>${input.support.afterEmail ? ` ${escapeHtml(input.support.afterEmail)}` : ''}.
        </td></tr>
      </table>`
    : '';
  const nextSteps = input.nextSteps
    ? `<div style="margin-top:24px;">
        <h2 style="margin:0 0 10px;color:#20212B;font-size:17px;line-height:1.35;font-weight:800;">${escapeHtml(input.nextSteps.heading)}</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${input.nextSteps.items
            .map(
              (item, index) => `<tr>
            <td valign="top" width="28" style="padding:5px 8px 5px 0;color:#7650E1;font-size:14px;font-weight:800;line-height:1.6;">${index + 1}.</td>
            <td valign="top" style="padding:5px 0;color:#505264;font-size:14px;line-height:1.6;">${escapeHtml(item)}</td>
          </tr>`
            )
            .join('')}
        </table>
      </div>`
    : '';
  const note = input.note
    ? `<p style="margin:22px 0 0;padding:13px 15px;background:#F6F7FA;border-left:3px solid ${accent};color:#686A78;font-size:12px;line-height:1.6;">${escapeHtml(input.note)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.heading)}</title>
  <style>@media only screen and (max-width:620px){.email-shell{width:100%!important;max-width:100%!important;min-width:0!important;border-radius:0!important}.email-pad{padding:26px 20px!important;overflow-wrap:anywhere}.email-header{padding:21px 20px!important}.email-footer{padding:20px!important;overflow-wrap:anywhere}}</style>
</head>
<body style="margin:0;padding:0;background:#F1F2F7;font-family:'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;background:#F1F2F7;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:separate;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(38,28,68,.08);">
        <tr><td style="height:6px;background:#7650E1;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-header" style="padding:25px 34px;border-bottom:1px solid #ECECF2;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><img src="${logoUrl}" width="42" alt="SEBSA" style="display:block;width:42px;height:auto;border:0;"></td>
            <td valign="middle" style="padding-left:12px;color:#31284D;font-size:14px;font-weight:800;letter-spacing:.2px;">SEBSA <span style="color:#7650E1;">CV Generator</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="email-pad" style="padding:34px;">
          <p style="margin:0 0 10px;color:${accent};font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
          <h1 style="margin:0 0 22px;color:#20212B;font-size:25px;line-height:1.25;font-weight:800;">${escapeHtml(input.heading)}</h1>
          ${greeting}${paragraphs}${detail}${highlights}
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;"><tr><td bgcolor="#4E1C90" style="border-radius:9px;">
            <a href="${safeUrl}" style="display:inline-block;padding:13px 23px;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;line-height:1.2;">${escapeHtml(input.ctaLabel)}</a>
          </td></tr></table>
          ${support}${nextSteps}
          ${note}
        </td></tr>
        <tr><td class="email-footer" style="padding:22px 34px;background:#29243A;">
          <p style="margin:0 0 6px;color:#FFFFFF;font-size:12px;font-weight:700;">${brandName}</p>
          <p style="margin:0;color:#BDB8CC;font-size:11px;line-height:1.55;">This automated notification was sent by the SEBSA CV workflow. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function content(subject: string, input: BrandedEmailInput): EmailContent {
  const plainParts = [
    input.greeting,
    ...input.paragraphs,
    input.detailLabel && input.detailValue ? `${input.detailLabel}: ${input.detailValue}` : undefined,
    ...(input.highlights?.map(
      (highlight) => `${highlight.label}: ${highlight.value}${highlight.description ? ` — ${highlight.description}` : ''}`
    ) ?? []),
    `${input.ctaLabel}: ${input.ctaUrl}`,
    input.support
      ? `${input.support.message} ${input.support.email}${input.support.afterEmail ? ` ${input.support.afterEmail}` : ''}.`
      : undefined,
    input.nextSteps ? `${input.nextSteps.heading}\n${input.nextSteps.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : undefined,
    input.note,
    `This automated notification was sent by ${brandName}.`,
  ].filter((part): part is string => Boolean(part));

  return {
    subject: singleLine(subject),
    html: renderBrandedEmail(input),
    text: plainParts.join('\n\n'),
  };
}

export function buildEmployeeInviteEmail(actionLink: string, isResend: boolean): EmailContent {
  return content(
    isResend ? 'Your SEBSA CV Generator sign-in link' : 'You have been invited to SEBSA CV Generator',
    {
      preheader: isResend ? 'Your refreshed sign-in link is ready.' : 'Your SEBSA CV Generator account is ready.',
      eyebrow: isResend ? 'Invitation refreshed' : 'Welcome to SEBSA',
      heading: isResend ? 'Your new sign-in link is ready' : 'Your CV workspace is ready',
      greeting: 'Hello,',
      paragraphs: [
        isResend
          ? 'An administrator has sent you a new invitation to SEBSA CV Generator. This link replaces any invitation sent earlier. Use it to activate your account and set up your password.'
          : 'An administrator has created a SEBSA CV Generator account for you. Use the link below to verify your email address, activate your account, and set up your password.',
        'Please complete your account activation and log in to the system before the deadline below.',
      ],
      highlights: [
        {
          label: 'Activation deadline',
          value: 'Before October 26, 2026',
          description: 'Activate your account, set up your password, and log in before this date.',
        },
        {
          label: 'Link validity',
          value: '4 hours only',
          description: 'This secure activation link expires 4 hours after this email is sent.',
        },
      ],
      ctaLabel: 'Activate account and set password',
      ctaUrl: actionLink,
      support: {
        message: 'If you are unable to activate your account within 4 hours, please send an email to',
        email: 'cv.generator.sebsa@gmail.com',
        afterEmail: 'to request a new activation email from the system administrator',
      },
      nextSteps: {
        heading: 'After you log in',
        items: [
          'Review your profile information and verify that all details are correct.',
          'If anything is incorrect or outdated, update your profile details through the system.',
        ],
      },
      note: 'For your security, this is a one-time link. If you were not expecting this invitation, you can safely ignore this email.',
      tone: 'welcome',
    }
  );
}

export function buildNewProfileSubmittedEmail(employeeName: string): EmailContent {
  const name = singleLine(employeeName);
  return content(`New profile submitted — ${name}`, {
    preheader: `${name} submitted a new profile for review.`,
    eyebrow: 'Review required',
    heading: 'A new employee profile is ready for review',
    greeting: 'Hello reviewer,',
    paragraphs: ['A new employee CV profile has been submitted. Please review its details before publishing it to the company repository.'],
    detailLabel: 'Employee',
    detailValue: name,
    ctaLabel: 'Review submission',
    ctaUrl: appUrl('/review'),
    note: 'This profile will remain unpublished until an authorized reviewer approves it.',
    tone: 'action',
  });
}

export function buildProfileUpdateRequestedEmail(employeeName: string): EmailContent {
  const name = singleLine(employeeName);
  return content(`Profile update requested — ${name}`, {
    preheader: `${name} submitted profile changes for approval.`,
    eyebrow: 'Review required',
    heading: 'Profile changes are waiting for approval',
    greeting: 'Hello reviewer,',
    paragraphs: ['An employee has proposed changes to their CV profile. Review the differences and approve or reject the request.'],
    detailLabel: 'Employee',
    detailValue: name,
    ctaLabel: 'Review request',
    ctaUrl: appUrl('/review'),
    note: 'The current published profile will remain unchanged until the request is approved.',
    tone: 'action',
  });
}

export function buildProfileApprovedEmail(profileId: string, employeeName?: string): EmailContent {
  return content('Your SEBSA CV profile has been approved', {
    preheader: 'Your CV profile has been approved and published.',
    eyebrow: 'Approved',
    heading: 'Your profile is now live',
    greeting: employeeName ? `Hello ${singleLine(employeeName)},` : 'Hello,',
    paragraphs: ['Good news — your CV profile has been approved and is now available in the company repository.'],
    ctaLabel: 'View your profile',
    ctaUrl: appUrl(`/repository/${encodeURIComponent(profileId)}`),
    note: 'You can review your published information and request changes from your profile page at any time.',
    tone: 'success',
  });
}

export function buildProfileChangesApprovedEmail(profileId: string, employeeName: string): EmailContent {
  return content('Your SEBSA CV profile changes have been approved', {
    preheader: 'Your requested profile changes are now live.',
    eyebrow: 'Changes approved',
    heading: 'Your profile has been updated',
    greeting: `Hello ${singleLine(employeeName)},`,
    paragraphs: ['Your proposed CV profile changes have been approved and are now visible in the company repository.'],
    ctaLabel: 'View your profile',
    ctaUrl: appUrl(`/repository/${encodeURIComponent(profileId)}`),
    note: 'Please review the published profile and submit another change request if anything needs adjusting.',
    tone: 'success',
  });
}

export function buildProfileUpdatedByAdminEmail(
  profileId: string,
  employeeName: string,
  administratorName: string
): EmailContent {
  const admin = singleLine(administratorName);
  return content('Your SEBSA CV profile has been updated', {
    preheader: 'An administrator updated your CV profile.',
    eyebrow: 'Profile updated',
    heading: 'Changes were made to your profile',
    greeting: `Hello ${singleLine(employeeName)},`,
    paragraphs: [`${admin} updated details in your CV profile. Please check the published information to make sure everything is correct.`],
    detailLabel: 'Updated by',
    detailValue: admin,
    ctaLabel: 'Review your profile',
    ctaUrl: appUrl(`/repository/${encodeURIComponent(profileId)}`),
    note: 'If anything looks incorrect, submit a change request or contact an administrator.',
    tone: 'welcome',
  });
}
