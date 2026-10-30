import { renderEmailHtml } from '@/lib/email/templates';
import type { EmailContent } from '@/lib/email/sendEmail';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/** Congratulations email with the certificate PDF attached. Names are escaped: they come from
 *  user-editable profile data and are interpolated into HTML. */
export function buildCertificateEmail(params: {
  employeeName: string;
  cycleLabel: string;
  score: number;
  total: number;
  certificateNumber: string;
  pdf: Buffer;
}): EmailContent {
  return {
    subject: `Your assessment certificate | ${params.cycleLabel}`,
    text:
      `Hi ${params.employeeName}, you scored ${params.score}/${params.total} in the ` +
      `${params.cycleLabel} knowledge assessment. Your certificate is attached, and you can ` +
      'download it again from the portal.',
    html: renderEmailHtml({
      heading: 'Congratulations, you passed',
      body:
        `Hi ${escapeHtml(params.employeeName)}, you scored <strong>${params.score}/${params.total}</strong> in the ` +
        `${escapeHtml(params.cycleLabel)} knowledge assessment. Your certificate is attached, and you can ` +
        'download it again at any time from the portal.',
      ctaLabel: 'View my certificates',
      ctaPath: '/assessments/certificates',
    }),
    attachments: [
      {
        filename: `SEBSA_Certificate_${params.certificateNumber.slice(0, 8)}.pdf`,
        content: params.pdf,
        contentType: 'application/pdf',
      },
    ],
  };
}

/** Invitation to take the assessment. Mirrors the rules enforced in lib/assessment/rules.ts. */
export function buildInvitationEmail(params: {
  employeeName: string;
  cycleLabel: string;
  expiresAt: Date;
  passingScore: number;
}): EmailContent {
  const expiry = params.expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  });
  return {
    subject: `Internal assessment ready | ${params.cycleLabel}`,
    text:
      `Hi ${params.employeeName}, the ${params.cycleLabel} knowledge assessment is now open for you.\n\n` +
      `Invitation expires: ${expiry}\nPass mark: ${params.passingScore}/10\nAttempts: up to 2\n` +
      `Retry policy: if you score below ${params.passingScore} on your first attempt, you can retry once using the same questions.`,
    html: renderEmailHtml({
      heading: 'Your internal assessment is ready',
      body:
        `Hi ${escapeHtml(params.employeeName)}, the <strong>${escapeHtml(params.cycleLabel)}</strong> knowledge ` +
        `assessment is now open for you.<br><br><strong>Invitation expires:</strong> ${expiry}<br>` +
        `<strong>Pass mark:</strong> ${params.passingScore}/10<br><strong>Attempts:</strong> up to 2<br>` +
        `<strong>Retry policy:</strong> if you score below ${params.passingScore} on your first attempt you can retry once using the same questions.`,
      ctaLabel: 'Start my assessment',
      ctaPath: '/assessments',
    }),
  };
}

export function buildReminderEmail(params: { employeeName: string; cycleLabel: string }): EmailContent {
  return {
    subject: `Reminder: complete your assessment | ${params.cycleLabel}`,
    text:
      `Hi ${params.employeeName}, this is a reminder to complete the ${params.cycleLabel} knowledge assessment. ` +
      'Open the employee portal to start or continue your assessment.',
    html: renderEmailHtml({
      heading: 'Assessment reminder',
      body:
        `Hi ${escapeHtml(params.employeeName)}, you have not yet completed the ` +
        `<strong>${escapeHtml(params.cycleLabel)}</strong> knowledge assessment. Open the portal to start or continue it.`,
      ctaLabel: 'Complete my assessment',
      ctaPath: '/assessments/take',
    }),
  };
}
